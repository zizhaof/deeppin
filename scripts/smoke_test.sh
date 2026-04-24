#!/bin/bash
# scripts/smoke_test.sh
# End-to-end connectivity smoke test after deployment.
#
# Usage:
#   bash scripts/smoke_test.sh https://deeppin.duckdns.org

set -euo pipefail

BASE_URL="${1:-https://deeppin.duckdns.org}"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check() {
  local name="$1"
  local url="$2"
  local expected="$3"

  response=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "")
  if echo "$response" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗${NC} $name"
    echo "    expected substring: $expected"
    echo "    got:                $response"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE_URL ==="
echo ""

# 1. Overall status (LLM throttling can degrade the aggregate — we just
#    need the status field to be present).
check "HTTPS reachable"          "$BASE_URL/health"           '"status"'

# 2. Per-component liveness.
check "backend itself"           "$BASE_URL/health"           '"backend":true'
check "searxng connectivity"     "$BASE_URL/health"           '"searxng":true'
check "supabase connectivity"    "$BASE_URL/health"           '"supabase":true'
check "embedding healthy"        "$BASE_URL/health"           '"ok":true'
check "embedding dim=1024"       "$BASE_URL/health"           '"dim":1024'
check "embedding model=bge-m3"   "$BASE_URL/health"           'bge-m3'

# 3. Auth middleware is wired up.
check "unauth request -> 401"    "$BASE_URL/api/sessions"     '"detail"'

echo ""
echo "================================"
echo "Result: ${PASS} passed, ${FAIL} failed"
echo "================================"

[ "$FAIL" -eq 0 ] || exit 1
