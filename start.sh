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

echo "  Starting: PostgreSQL, TimescaleDB, Neo4j, Redis, Kafka..."
docker compose up -d postgres timescaledb neo4j redis zookeeper kafka

# Wait for each service
wait_for_service "PostgreSQL" \
  "docker exec nexus-postgres pg_isready -U postgres"

wait_for_service "TimescaleDB" \
  "docker exec nexus-timescale pg_isready -U ${TIMESCALE_USER:-nexus_ts}"

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

# Use postgres superuser — guaranteed full access, no permission issues
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD:-nexus2024}@localhost:5432/${POSTGRES_DB:-nexus}"
SCHEMA_PATH="../../libs/database/src/prisma/schema.prisma"

# Use the LOCAL Prisma binary — never the global one (avoids Prisma 7 conflicts)
PRISMA="./node_modules/.bin/prisma"
TS_NODE="./node_modules/.bin/ts-node"

# Check if already migrated
MIGRATED=$(docker exec nexus-postgres psql -U postgres -d ${POSTGRES_DB:-nexus} \
  -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='users'" 2>/dev/null || echo "0")

if [ "$MIGRATED" = "0" ]; then
  # 1. Generate Prisma client FIRST (creates UserRole, ZoneType enums in node_modules)
  echo "  Generating Prisma client..."
  (cd apps/api-gateway && DATABASE_URL="$DB_URL" \
    $PRISMA generate --schema "$SCHEMA_PATH")
  print_ok "Prisma client generated"

  # 2. Push schema to database (creates all tables)
  echo "  Pushing schema to database..."
  (cd apps/api-gateway && DATABASE_URL="$DB_URL" \
    $PRISMA db push --schema "$SCHEMA_PATH" --accept-data-loss)
  print_ok "Prisma schema applied"

  # 3. Seed with initial data
  echo "  Seeding database..."
  (cd apps/api-gateway && DATABASE_URL="$DB_URL" \
    $TS_NODE --compiler-options '{"module":"commonjs","esModuleInterop":true}' \
    src/seed.ts)
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
  tmux send-keys -t nexus:0 "cd apps/api-gateway && DATABASE_URL='$DB_URL' npm run start:dev" Enter
  tmux split-window -t nexus:0 -h
  tmux send-keys -t nexus:0 "cd apps/ingestor-service && TIMESCALE_URL='${TIMESCALE_URL:-postgresql://nexus_ts:timescale_secret@localhost:5433/nexus_timeseries}' REDIS_URL='${REDIS_URL:-redis://:redis_secret@localhost:6379}' KAFKA_BROKER='localhost:9092' npm run start:dev" Enter

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
