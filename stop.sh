#!/bin/bash
# ─── Nexus Aviation Suite — Stop Script ──────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "\n${BOLD}Stopping Nexus Aviation Suite...${NC}\n"

# Stop Docker infrastructure
docker compose down
echo -e "  ${GREEN}✓${NC} All Docker services stopped"

# Kill tmux session if running
if command -v tmux &>/dev/null && tmux has-session -t nexus 2>/dev/null; then
  tmux kill-session -t nexus
  echo -e "  ${GREEN}✓${NC} tmux session 'nexus' closed"
fi

echo -e "\n${GREEN}${BOLD}Nexus stopped.${NC}"
echo -e "Data is preserved in Docker volumes. To also delete all data:"
echo -e "  docker compose down -v\n"
