#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "✗ $*" >&2
  exit 1
}

echo "Проверка HAPP subscription/install/update invariants"

bash -n xrayebator update.sh install.sh uninstall.sh || fail "bash -n failed"
echo "  ✓ shell syntax ok"

SUBHTTP_TMP=$(mktemp /tmp/xrayebator-subhttp-static.XXXXXX)
trap 'rm -f "$SUBHTTP_TMP"' EXIT
awk '/cat > \/usr\/local\/bin\/subhttp\.sh << '\''SUBHTTP_EOF'\''/{flag=1; next} /^SUBHTTP_EOF$/{flag=0} flag' \
  xrayebator > "$SUBHTTP_TMP"
[[ -s "$SUBHTTP_TMP" ]] || fail "subhttp heredoc not found"
bash -n "$SUBHTTP_TMP" || fail "generated subhttp heredoc is not valid bash"
echo "  ✓ generated subhttp syntax ok"

grep -q '^emit_500()' "$SUBHTTP_TMP" || fail "subhttp must emit HTTP 500 instead of closing connection"
! grep -q '^set -u$' "$SUBHTTP_TMP" || fail "subhttp must not use set -u; it can turn config/env issues into nginx 502"
grep -q 'source /usr/local/bin/xrayebator' "$SUBHTTP_TMP" || fail "subhttp must source installed xrayebator"
echo "  ✓ subhttp failure mode guards ok"

grep -q '^ensure_xray_runtime_user()' xrayebator || fail "xrayebator missing runtime user repair"
grep -q '^ensure_xray_runtime_user()' update.sh || fail "update.sh missing runtime user repair"
grep -q 'getent passwd xray' install.sh || fail "install.sh must verify xray user creation"
echo "  ✓ xray runtime user repair ok"

grep -q '^_subscription_restart_service()' xrayebator || fail "missing centralized subscription restart helper"
! grep -q 'enable --now xrayebator-sub.service' xrayebator || fail "xrayebator must restart/reset subscription service, not just enable --now"
grep -q '_subscription_restart_service' update.sh || fail "update.sh must use subscription restart helper after regenerating handler"
echo "  ✓ systemd restart path ok"

grep -q 'openssl' install.sh || fail "install.sh dependencies must include openssl"
grep -q 'socat' install.sh || fail "install.sh dependencies must include socat"
grep -q 'bash -n "$XRAYEBATOR_TMP"' install.sh || fail "install.sh must validate downloaded xrayebator"
echo "  ✓ install dependencies/download validation ok"

echo "✓ HAPP subscription static checks passed"
