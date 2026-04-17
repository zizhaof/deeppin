#!/bin/bash
# scripts/smoke_test.sh
# 部署后端到端连通性验证
# End-to-end connectivity smoke test after deployment
#
# 用法 / Usage:
#   bash scripts/smoke_test.sh https://deeppin.duckdns.org

set -euo pipefail

BASE_URL="${1:-https://deeppin.duckdns.org}"
PASS=0
FAIL=0

# 颜色 / Colors
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
    echo "    期望包含 / Expected: $expected"
    echo "    实际返回 / Got:      $response"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE_URL ==="
echo ""

# 1. 整体状态（LLM 偶尔限流导致 degraded，只要 status 字段存在即可）
check "HTTPS 可访问"       "$BASE_URL/health"           '"status"'

# 2. 各组件连通性
check "backend 自身"       "$BASE_URL/health"           '"backend":true'
check "searxng 连通"       "$BASE_URL/health"           '"searxng":true'
check "supabase 连通"      "$BASE_URL/health"           '"supabase":true'
check "embedding 正常"     "$BASE_URL/health"           '"ok":true'
check "embedding 维度1024" "$BASE_URL/health"           '"dim":1024'
check "embedding 模型bge"  "$BASE_URL/health"           'bge-m3'

# 3. 认证中间件生效
check "未授权请求返回 401"  "$BASE_URL/api/sessions"     '"detail"'

echo ""
echo "================================"
echo "结果：${PASS} 通过，${FAIL} 失败"
echo "================================"

[ "$FAIL" -eq 0 ] || exit 1
