#!/bin/bash
# ─── Nexus Aviation Suite — Local Development Startup Script ──────────────────
set -e

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

# ─── Helpers ──────────────────────────────────────────────────────────────────

print_step() { echo -e "\n${BLUE}${BOLD}[$1]${NC} $2"; }
print_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
print_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
print_err()  { echo -e "  ${RED}✗${NC} $1"; }

wait_for_service() {
  local name=$1
  local check_cmd=$2
  local max_attempts=30
  local attempt=1

  echo -ne "  Waiting for ${name}"
  while ! eval "$check_cmd" &>/dev/null; do
    if [ $attempt -ge $max_attempts ]; then
      echo ""
      print_err "${name} did not become healthy in time. Check: docker compose logs"
      exit 1
    fi
    echo -ne "."
    sleep 2
    attempt=$((attempt + 1))
  done
  echo ""
  print_ok "${name} is ready"
}

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Nexus Aviation Suite — Local Setup          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Check prerequisites ──────────────────────────────────────────────

print_step "1/7" "Checking prerequisites"

if ! command -v docker &>/dev/null; then
  print_err "Docker is not installed. Install Docker Desktop from https://docker.com/products/docker-desktop"
  exit 1
fi
print_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

if ! docker info &>/dev/null; then
  print_err "Docker daemon is not running. Please start Docker Desktop."
  exit 1
fi
print_ok "Docker daemon running"

if ! command -v node &>/dev/null; then
  print_err "Node.js is not installed. Install from https://nodejs.org (v20+ recommended)"
  exit 1
fi
print_ok "Node.js $(node --version)"

if ! command -v npm &>/dev/null; then
  print_err "npm is not installed. It comes with Node.js."
  exit 1
fi
print_ok "npm $(npm --version)"

# ─── Step 2: Environment file ─────────────────────────────────────────────────

print_step "2/7" "Setting up environment"

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  print_ok "Created .env.local from .env.example"
  print_warn "Add your GEMINI_API_KEY to .env.local to enable LLM queries (optional)"
else
  print_ok ".env.local already exists — skipping"
fi

# Load env vars
export $(grep -v '^#' .env.local | grep -v '^$' | xargs) 2>/dev/null || true

# ─── Step 3: Start infrastructure ─────────────────────────────────────────────

print_step "3/7" "Starting infrastructure (Docker)"

echo "  Starting: TimescaleDB, Neo4j, Redis, Kafka..."
docker compose up -d timescaledb neo4j redis zookeeper kafka

# Wait for each service
wait_for_service "TimescaleDB" \
  "docker exec nexus-timescale psql -U ${TIMESCALE_USER:-nexus_ts} -d ${TIMESCALE_DB:-nexus_timeseries} -c 'SELECT 1' -q"

wait_for_service "Redis" \
  "docker exec nexus-redis redis-cli -a ${REDIS_PASSWORD:-redis_secret} ping"

wait_for_service "Neo4j" \
  "docker exec nexus-neo4j cypher-shell -u ${NEO4J_USER:-neo4j} -p ${NEO4J_PASSWORD:-nexus_graph} 'RETURN 1' 2>/dev/null"

wait_for_service "Kafka" \
  "docker exec nexus-kafka kafka-broker-api-versions --bootstrap-server localhost:9092"

# Create Kafka topics
echo "  Creating Kafka topics..."
docker compose up -d kafka-init &>/dev/null || true
print_ok "Kafka topics initialised"

# ─── Step 4: Install Node dependencies ────────────────────────────────────────

print_step "4/7" "Installing Node.js dependencies"

install_deps() {
  local dir=$1
  local name=$2
  local expected_prisma_ver="5.22.0"

  # Force reinstall if Prisma version is wrong (e.g. global Prisma 7 was cached)
  if [ -d "$dir/node_modules" ]; then
    local installed_ver
    installed_ver=$("$dir/node_modules/.bin/prisma" --version 2>/dev/null | awk '/prisma/{print $NF}' || echo "unknown")
    if [[ "$installed_ver" != "$expected_prisma_ver"* ]]; then
      print_warn "${name}: found Prisma $installed_ver, need $expected_prisma_ver — reinstalling..."
      rm -rf "$dir/node_modules"
    fi
  fi

  if [ ! -d "$dir/node_modules" ]; then
    echo -n "  Installing ${name} dependencies..."
    (cd "$dir" && npm install --silent)
    echo " done"
    print_ok "${name}"
  else
    print_ok "${name} (already installed)"
  fi
}

install_deps "apps/api-gateway"       "API Gateway"
install_deps "apps/ingestor-service"  "Ingestor Service"

# ─── Step 5: Database migrations & seed ───────────────────────────────────────

print_step "5/7" "Running database migrations & seed"

# DATABASE_URL is loaded from .env.local above (Supabase remote connection string)
TIMESCALE_URL="postgresql://nexus_ts:timescale_secret@localhost:5433/nexus_timeseries"
SCHEMA_PATH="../../libs/database/src/prisma/schema.prisma"

# Use the LOCAL Prisma binary — never the global one (avoids Prisma 7 conflicts)
PRISMA="./node_modules/.bin/prisma"
TS_NODE="./node_modules/.bin/ts-node"

# Check if already migrated (psql connects directly to Supabase)
MIGRATED=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='users'" 2>/dev/null || echo "0")

if [ "$MIGRATED" = "0" ]; then
  # 1. Generate Prisma client FIRST (creates UserRole, ZoneType enums in node_modules)
  echo "  Generating Prisma client..."
  (cd apps/api-gateway && DATABASE_URL="$DATABASE_URL" \
    $PRISMA generate --schema "$SCHEMA_PATH")
  print_ok "Prisma client generated"

  # 2. Push schema directly to Supabase (no intermediate SQL file needed)
  echo "  Pushing schema to Supabase..."
  (cd apps/api-gateway && DATABASE_URL="$DATABASE_URL" \
    $PRISMA db push --schema "$SCHEMA_PATH")
  print_ok "Schema applied"

  # 3. Seed with initial data — pure SQL inside the container (no Prisma Client, no host networking)
  echo "  Seeding database..."

  # Compute SHA-256 password hash using Node.js (same algorithm as seed.ts)
  PW_HASH=$(node -e "const c=require('crypto');process.stdout.write(c.createHash('sha256').update('nexus2024!').digest('hex'))")

  psql "$DATABASE_URL" << SEED_SQL
-- Terminals
INSERT INTO terminals (id, name, "isActive") VALUES
  ('T1', 'Terminal 1', true),
  ('T2', 'Terminal 2', true)
ON CONFLICT (id) DO NOTHING;

-- Users
INSERT INTO users (id, email, "passwordHash", role, "terminalId", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'admin@nexus.airport',    '$PW_HASH', 'ADMIN'::"UserRole",      NULL, true, NOW(), NOW()),
  (gen_random_uuid(), 'ops@nexus.airport',       '$PW_HASH', 'OPERATIONS'::"UserRole", NULL, true, NOW(), NOW()),
  (gen_random_uuid(), 'security@nexus.airport',  '$PW_HASH', 'SECURITY'::"UserRole",   'T1', true, NOW(), NOW()),
  (gen_random_uuid(), 'terminal@nexus.airport',  '$PW_HASH', 'TERMINAL'::"UserRole",   'T1', true, NOW(), NOW()),
  (gen_random_uuid(), 'airline@nexus.airport',   '$PW_HASH', 'AIRLINE'::"UserRole",    NULL, true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Zones
INSERT INTO zones (id, "terminalId", name, type, "capacityMax", "alertThresholdPct") VALUES
  ('T1_SECURITY_LANE_1',          'T1', 'Security Lane 1',        'SECURITY_LANE'::"ZoneType",   60,  80),
  ('T1_SECURITY_LANE_2',          'T1', 'Security Lane 2',        'SECURITY_LANE'::"ZoneType",   60,  80),
  ('T1_SECURITY_LANE_3',          'T1', 'Security Lane 3',        'SECURITY_LANE'::"ZoneType",   60,  80),
  ('T1_IMMIGRATION',              'T1', 'Immigration T1',          'IMMIGRATION'::"ZoneType",     80,  75),
  ('T1_CHECKIN_A',                'T1', 'Check-in Zone A',         'CHECK_IN'::"ZoneType",       200,  70),
  ('T1_CHECKIN_B',                'T1', 'Check-in Zone B',         'CHECK_IN'::"ZoneType",       180,  70),
  ('T1_RETAIL_PLAZA',             'T1', 'Retail Plaza T1',         'RETAIL'::"ZoneType",         300,  85),
  ('T1_GATE_A05',                 'T1', 'Gate A05',                'BOARDING_GATE'::"ZoneType",   80,  90),
  ('T1_GATE_A08',                 'T1', 'Gate A08',                'BOARDING_GATE'::"ZoneType",   80,  90),
  ('T1_GATE_A12',                 'T1', 'Gate A12',                'BOARDING_GATE'::"ZoneType",  100,  90),
  ('T1_GATE_B03',                 'T1', 'Gate B03',                'BOARDING_GATE'::"ZoneType",   80,  90),
  ('T1_GATE_B08',                 'T1', 'Gate B08',                'BOARDING_GATE'::"ZoneType",  120,  90),
  ('T1_CORRIDOR_POST_SECURITY',   'T1', 'Post-Security Corridor',  'CORRIDOR'::"ZoneType",       150,  80),
  ('T1_CORRIDOR_PIER_A',          'T1', 'Pier A Corridor',         'CORRIDOR'::"ZoneType",       100,  80),
  ('T1_CORRIDOR_PIER_B',          'T1', 'Pier B Corridor',         'CORRIDOR'::"ZoneType",       100,  80),
  ('T1_BAGGAGE_A',                'T1', 'Baggage Reclaim A',       'BAGGAGE_RECLAIM'::"ZoneType",100,  85),
  ('T1_LANDSIDE',                 'T1', 'T1 Landside',             'LANDSIDE'::"ZoneType",       400,  70),
  ('T2_CHECKIN_B',                'T2', 'Check-in Zone B',         'CHECK_IN'::"ZoneType",       160,  70),
  ('T2_SECURITY_LANE_1',          'T2', 'Security Lane 1',         'SECURITY_LANE'::"ZoneType",   60,  80),
  ('T2_SECURITY_LANE_2',          'T2', 'Security Lane 2',         'SECURITY_LANE'::"ZoneType",   60,  80),
  ('T2_IMMIGRATION',              'T2', 'Immigration T2',           'IMMIGRATION'::"ZoneType",    80,  75),
  ('T2_RETAIL',                   'T2', 'Retail T2',               'RETAIL'::"ZoneType",         200,  85),
  ('T2_GATE_C07',                 'T2', 'Gate C07',                'BOARDING_GATE'::"ZoneType",   80,  90),
  ('T2_GATE_D11',                 'T2', 'Gate D11',                'BOARDING_GATE'::"ZoneType",  100,  90),
  ('T2_CORRIDOR_POST_SECURITY',   'T2', 'Post-Security T2',        'CORRIDOR'::"ZoneType",       120,  80)
ON CONFLICT (id) DO NOTHING;

-- Zone configs (SECURITY_LANE gets tighter thresholds 15/20; others 20/30)
INSERT INTO zone_configs (id, "zoneId", "forecastThreshold30", "forecastThreshold60", "sentinelZScore", "updatedAt") VALUES
  (gen_random_uuid(), 'T1_SECURITY_LANE_1',        15, 20, 2.5, NOW()),
  (gen_random_uuid(), 'T1_SECURITY_LANE_2',        15, 20, 2.5, NOW()),
  (gen_random_uuid(), 'T1_SECURITY_LANE_3',        15, 20, 2.5, NOW()),
  (gen_random_uuid(), 'T1_IMMIGRATION',            20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_CHECKIN_A',              20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_CHECKIN_B',              20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_RETAIL_PLAZA',           20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_GATE_A05',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_GATE_A08',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_GATE_A12',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_GATE_B03',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_GATE_B08',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_CORRIDOR_POST_SECURITY', 20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_CORRIDOR_PIER_A',        20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_CORRIDOR_PIER_B',        20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_BAGGAGE_A',              20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T1_LANDSIDE',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_CHECKIN_B',              20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_SECURITY_LANE_1',        15, 20, 2.5, NOW()),
  (gen_random_uuid(), 'T2_SECURITY_LANE_2',        15, 20, 2.5, NOW()),
  (gen_random_uuid(), 'T2_IMMIGRATION',            20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_RETAIL',                 20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_GATE_C07',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_GATE_D11',               20, 30, 2.5, NOW()),
  (gen_random_uuid(), 'T2_CORRIDOR_POST_SECURITY', 20, 30, 2.5, NOW())
ON CONFLICT ("zoneId") DO NOTHING;

-- Zone mappings (Wi-Fi AP → Zone)
INSERT INTO zone_mappings (id, "apLocationId", "zoneId", "terminalId") VALUES
  (gen_random_uuid(), 'AP-T1-SEC-01', 'T1_SECURITY_LANE_1', 'T1'),
  (gen_random_uuid(), 'AP-T1-SEC-02', 'T1_SECURITY_LANE_2', 'T1'),
  (gen_random_uuid(), 'AP-T1-SEC-03', 'T1_SECURITY_LANE_3', 'T1'),
  (gen_random_uuid(), 'AP-T1-CHK-01', 'T1_CHECKIN_A',       'T1'),
  (gen_random_uuid(), 'AP-T1-CHK-02', 'T1_CHECKIN_B',       'T1'),
  (gen_random_uuid(), 'AP-T1-IMG-01', 'T1_IMMIGRATION',     'T1'),
  (gen_random_uuid(), 'AP-T2-SEC-01', 'T2_SECURITY_LANE_1', 'T2'),
  (gen_random_uuid(), 'AP-T2-SEC-02', 'T2_SECURITY_LANE_2', 'T2'),
  (gen_random_uuid(), 'AP-T2-CHK-01', 'T2_CHECKIN_B',       'T2')
ON CONFLICT ("apLocationId") DO NOTHING;
SEED_SQL

  print_ok "Database seeded (users, terminals, zones)"
else
  print_ok "Database already migrated — skipping"
fi

# ─── Step 6: Seed Neo4j ───────────────────────────────────────────────────────

print_step "6/7" "Seeding Neo4j airport graph"

NODE_COUNT=$(docker exec nexus-neo4j cypher-shell \
  -u ${NEO4J_USER:-neo4j} -p ${NEO4J_PASSWORD:-nexus_graph} \
  "MATCH (z:Zone) RETURN count(z) AS c" 2>/dev/null | grep -E '^[0-9]+$' || echo "0")

if [ "$NODE_COUNT" = "0" ] || [ -z "$NODE_COUNT" ]; then
  echo "  Loading airport topology graph..."
  docker exec -i nexus-neo4j cypher-shell \
    -u ${NEO4J_USER:-neo4j} -p ${NEO4J_PASSWORD:-nexus_graph} \
    < tools/simulators/neo4j-seed.cypher &>/dev/null
  print_ok "Neo4j seeded (2 terminals, 25 zones)"
else
  print_ok "Neo4j already seeded (${NODE_COUNT} zones) — skipping"
fi

# ─── Step 7: Launch backend services ──────────────────────────────────────────

print_step "7/7" "Launching backend services"

# Detect terminal multiplexer support
if command -v tmux &>/dev/null && [ -z "$TMUX" ]; then
  # Create a new tmux session with split panes
  echo "  Starting services in tmux (split panes)..."
  tmux new-session -d -s nexus -x 220 -y 50

  tmux rename-window -t nexus:0 "Nexus"
  tmux send-keys -t nexus:0 "cd apps/api-gateway && DATABASE_URL='$DATABASE_URL' npm run start:dev" Enter
  tmux split-window -t nexus:0 -h
  tmux send-keys -t nexus:0 "cd apps/ingestor-service && TIMESCALE_URL='$TIMESCALE_URL' REDIS_URL='${REDIS_URL:-redis://:redis_secret@localhost:6379}' KAFKA_BROKER='localhost:9092' npm run start:dev" Enter

  echo ""
  echo -e "${GREEN}${BOLD}┌─────────────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}${BOLD}│  Nexus is starting in tmux session 'nexus'       │${NC}"
  echo -e "${GREEN}${BOLD}│                                                   │${NC}"
  echo -e "${GREEN}${BOLD}│  Attach with:  tmux attach -t nexus               │${NC}"
  echo -e "${GREEN}${BOLD}│  Detach with:  Ctrl+B then D                      │${NC}"
  echo -e "${GREEN}${BOLD}└─────────────────────────────────────────────────┘${NC}"
  tmux attach -t nexus

else
  # No tmux — give instructions to run manually
  echo ""
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║  Infrastructure is ready! Start services manually:   ║${NC}"
  echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}${BOLD}║                                                       ║${NC}"
  echo -e "${GREEN}${BOLD}║  Terminal 1 — API Gateway (port 4000):               ║${NC}"
  echo -e "${BOLD}║    cd apps/api-gateway && npm run start:dev           ║${NC}"
  echo -e "${GREEN}${BOLD}║                                                       ║${NC}"
  echo -e "${GREEN}${BOLD}║  Terminal 2 — Ingestor Service (port 4001):          ║${NC}"
  echo -e "${BOLD}║    cd apps/ingestor-service && npm run start:dev      ║${NC}"
  echo -e "${GREEN}${BOLD}║                                                       ║${NC}"
  echo -e "${GREEN}${BOLD}║  Frontend (existing POC, port 3000):                 ║${NC}"
  echo -e "${BOLD}║    npm run dev                                        ║${NC}"
  echo -e "${GREEN}${BOLD}║                                                       ║${NC}"
  echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}${BOLD}║  Services & URLs:                                     ║${NC}"
  echo -e "${BOLD}║    API Gateway   →  http://localhost:4000/api/v1     ║${NC}"
  echo -e "${BOLD}║    Neo4j Browser →  http://localhost:7474             ║${NC}"
  echo -e "${BOLD}║    Frontend POC  →  http://localhost:3000             ║${NC}"
  echo -e "${GREEN}${BOLD}║                                                       ║${NC}"
  echo -e "${GREEN}${BOLD}║  Test login:                                          ║${NC}"
  echo -e "${BOLD}║    Email:    ops@nexus.airport                        ║${NC}"
  echo -e "${BOLD}║    Password: nexus2024!                               ║${NC}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
fi
