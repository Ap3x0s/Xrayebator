#!/usr/bin/env bash
# Тест backend AmneziaWG 2.0 — срез 4 (2026-10-04).
# Функционально: junk-параметры (диапазоны спеки AWG 2.0), рендер серверного
# конфига, keygen через фейковый awg, реестр/статус. Полная установка (PPA/
# DKMS/сборка) и поднятие интерфейса — живой спайк на VPS (срез 7).
set -u
cd "$(dirname "$0")/.."

fail() { echo "✗ $1"; exit 1; }
pass() { echo "✓ $1"; }

command -v jq >/dev/null 2>&1 || fail "jq required (CI installs it)"
command -v openssl >/dev/null 2>&1 || fail "openssl required"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
export BACKENDS_ROOT="$TMP_ROOT/xrayebator-backends"
export LOCK_FILE="$TMP_ROOT/xrayebator.lock"
export PROFILES_DIR="$TMP_ROOT/profiles"
mkdir -p "$PROFILES_DIR"

FAKEBIN="$TMP_ROOT/fakebin"
mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKEBIN/awg" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  genkey) openssl rand -base64 32 ;;
  genpsk) openssl rand -base64 32 ;;
  pubkey) cat >/dev/null; openssl rand -base64 32 ;;
  show)   exit 0 ;;
  *)      exit 0 ;;
esac
EOF
cat > "$FAKEBIN/awg-quick" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 755 "$FAKEBIN"/systemctl "$FAKEBIN"/awg "$FAKEBIN"/awg-quick
export PATH="$FAKEBIN:$PATH"

# shellcheck disable=SC1091
source ./xrayebator || fail "source ./xrayebator failed"

# 1) junk-параметры: диапазоны и уникальность (5 прогонов)
for _ in 1 2 3 4 5; do
  junk=$(_awg_gen_junk)
  jq -e '
    .Jc >= 1 and .Jc <= 128 and
    .Jmin >= 8 and .Jmin < .Jmax and .Jmax <= 1280 and
    .S1 >= 15 and .S1 <= 150 and .S2 >= 15 and .S2 <= 150 and
    (.S1 + 56) != .S2 and
    .H1 >= 5 and .H2 >= 5 and .H3 >= 5 and .H4 >= 5 and
    ([.H1, .H2, .H3, .H4] | (length == ([unique[]] | length)))
  ' <<<"$junk" >/dev/null || fail "junk params out of spec: $junk"
done
pass "junk params generated within AWG 2.0 spec (5/5 runs)"

# 2) keygen через awg (фейковый): три непустых base64
keys=$(_awg_gen_keys) || fail "awg gen keys"
read -r priv pub psk <<<"$keys"
[[ -n "$priv" && -n "$pub" && -n "$psk" ]] || fail "keys empty"
pass "awg genkey/pubkey/genpsk produce key triple"

# 3) рендер серверного конфига
junk=$(_awg_gen_junk)
conf="$TMP_ROOT/awg0.conf"
_awg_render_server_conf "$conf" 51820 "$priv" "$junk" "eth0" || fail "render server conf"
grep -q '^Address = 10.8.1.1/24$' "$conf" || fail "conf Address"
grep -q '^ListenPort = 51820$' "$conf" || fail "conf ListenPort"
grep -qF "PrivateKey = $priv" "$conf" || fail "conf PrivateKey"
grep -q '^MTU = 1280$' "$conf" || fail "conf MTU"
grep -qF "Jc = $(jq -r .Jc <<<"$junk")" "$conf" || fail "conf Jc"
grep -qF "H4 = $(jq -r .H4 <<<"$junk")" "$conf" || fail "conf H4"
grep -qF "PostUp = iptables -A FORWARD -i awg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE" "$conf" || fail "conf PostUp"
grep -qF "PostDown = iptables -D FORWARD -i awg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE" "$conf" || fail "conf PostDown"
! grep -q '^\[Peer\]' "$conf" || fail "conf must have no peers at install"
pass "server conf rendered (Address/keys/junk/PostUp-MASQUERADE, no peers yet)"

# 4) реестр + awg-status
_backend_set awg '(.awg.installed) = true' || fail "set installed"
_backend_set awg '(.awg.port) = $p' --argjson p 51820 || fail "set port"
_backend_set awg '(.awg.unit) = $u' --arg u "awg-quick@awg0.service" || fail "set unit"
_backend_set awg '(.awg.subnet) = $s' --arg s "10.8.1.0/24" || fail "set subnet"
status="$(awg_status_command)" || fail "awg_status_command"
jq -e '.ok == true and .backend.installed == true and .backend.port == 51820 and
       .backend.subnet == "10.8.1.0/24"' <<<"$status" >/dev/null \
  || fail "awg status shape: $status"
pass "awg-status JSON shape correct"

# 5) uninstall при отсутствии установки → rc 2 (safe no-op)
safe_jq_write --arg t awg 'del(.[$t])' "$BACKENDS_REGISTRY_FILE" || fail "registry del"
rc=0; _awg_uninstall >/dev/null 2>&1 || rc=$?
[[ "$rc" == "2" ]] || fail "uninstall rc=$rc on not-installed (expected 2)"
pass "awg uninstall is a safe no-op (rc 2) when not installed"

# 6) статика: диспетчер и меню
grep -Fq '    awg-install)' xrayebator || fail "dispatch awg-install missing"
grep -Fq '    awg-uninstall)' xrayebator || fail "dispatch awg-uninstall missing"
grep -Fq '    awg-status)' xrayebator || fail "dispatch awg-status missing"
grep -Fq '      12) awg_menu ;;' xrayebator || fail "menu dispatch 12 missing"
grep -Fq '      13) backend_status_menu ;;' xrayebator || fail "menu dispatch 13 missing"
grep -Fq 'awg_menu() {' xrayebator || fail "awg_menu definition missing"
grep -Fq 'backend_status_menu() {' xrayebator || fail "backend_status_menu definition missing"
pass "CLI dispatch and menu wiring present (12/13)"

echo ""
pass "amneziawg backend (slice 4): all checks green"
