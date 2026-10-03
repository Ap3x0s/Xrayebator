#!/usr/bin/env bash
# Тест backend Hysteria 2 — срез 2 (2026-10-04).
# Функционально проверяются чистые функции (render server.yaml / systemd-unit,
# arch-маппинг, TLS-детект без LE-маркеров), интеграция с реестром и
# hysteria2-status. Полный install/uninstall с сетью, openssl и systemd
# покрывается живым спайком на VPS (срез 7) — CI лишён этих условий.
set -u
cd "$(dirname "$0")/.."

fail() { echo "✗ $1"; exit 1; }
pass() { echo "✓ $1"; }

command -v jq >/dev/null 2>&1 || fail "jq required (CI installs it)"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
export BACKENDS_ROOT="$TMP_ROOT/xrayebator-backends"
export LOCK_FILE="$TMP_ROOT/xrayebator.lock"

# shellcheck disable=SC1091
source ./xrayebator || fail "source ./xrayebator failed"

# 1) render server.yaml
yaml="$TMP_ROOT/server.yaml"
_hysteria2_render_server_yaml "$yaml" 443 "/opt/c.pem" "/opt/k.pem" || fail "render yaml"
grep -q '^listen: :443$' "$yaml" || fail "yaml listen"
grep -q '^  cert: /opt/c.pem$' "$yaml" || fail "yaml cert"
grep -q '^  key: /opt/k.pem$' "$yaml" || fail "yaml key"
grep -q '^  type: userpass$' "$yaml" || fail "yaml auth type"
grep -q '^  users: {}$' "$yaml" || fail "yaml users empty map"
grep -q '^  type: 404$' "$yaml" || fail "yaml masquerade 404"
pass "server.yaml rendered with expected structure"

# 2) render systemd-unit: модель безопасности как у xray.service
unit="$TMP_ROOT/hysteria-server.service"
_hysteria2_render_unit "$unit" || fail "render unit"
grep -q '^User=hysteria$' "$unit" || fail "unit User"
grep -qF 'ExecStart=/usr/local/bin/hysteria server -c /usr/local/etc/xrayebator/backends/hysteria/server.yaml' "$unit" || fail "unit ExecStart"
grep -q '^AmbientCapabilities=CAP_NET_BIND_SERVICE$' "$unit" || fail "unit AmbientCapabilities"
grep -q '^CapabilityBoundingSet=CAP_NET_BIND_SERVICE$' "$unit" || fail "unit CapabilityBoundingSet"
grep -q '^NoNewPrivileges=true$' "$unit" || fail "unit NoNewPrivileges"
grep -q '^Restart=on-failure$' "$unit" || fail "unit Restart"
pass "systemd unit rendered (dedicated user + CAP_NET_BIND_SERVICE + auto-restart)"

# 3) arch-маппинг
arch=$(_hysteria2_asset_arch) || fail "asset arch"
case "$arch" in amd64|arm64|arm|386) ;; *) fail "unexpected arch: $arch" ;; esac
pass "asset arch resolves: $arch"

# 4) TLS-детект в чистой среде (нет маркеров подписки) → selfsigned
[[ "$(_hysteria2_tls_mode_detect)" == "selfsigned" ]] || fail "tls detect expected selfsigned"
pass "tls mode defaults to selfsigned without subscription markers"

# 5) реестр + hysteria2-status JSON
_backend_set hysteria2 '(.hysteria2.installed) = true' || fail "set installed"
_backend_set hysteria2 '(.hysteria2.version) = $v' --arg v "v2.12.3" || fail "set version"
_backend_set hysteria2 '(.hysteria2.port) = $p' --argjson p 443 || fail "set port"
_backend_set hysteria2 '(.hysteria2.unit) = $u' --arg u "hysteria-server.service" || fail "set unit"
_backend_set hysteria2 '(.hysteria2.tls_mode) = $m' --arg m "selfsigned" || fail "set tls"
status="$(hysteria2_status_command)" || fail "hysteria2_status_command"
jq -e '.ok == true and
       .backend.installed == true and
       .backend.version == "v2.12.3" and
       .backend.port == 443 and
       (.binary == "absent" or .binary == "present")' <<<"$status" >/dev/null \
  || fail "status JSON shape: $status"
pass "hysteria2-status JSON shape correct"

# 6) uninstall при отсутствии установки → rc 2 (wrapper переводит в already:true)
safe_jq_write --arg t hysteria2 'del(.[$t])' "$BACKENDS_REGISTRY_FILE" || fail "registry del"
rc=0; _hysteria2_uninstall >/dev/null 2>&1 || rc=$?
[[ "$rc" == "2" ]] || fail "uninstall rc=$rc on not-installed (expected 2)"
pass "uninstall is a safe no-op (rc 2) when not installed"

# 7) статика: CLI-диспетчер и меню
grep -Fq '    hysteria2-install)' xrayebator || fail "dispatch hysteria2-install missing"
grep -Fq '    hysteria2-uninstall)' xrayebator || fail "dispatch hysteria2-uninstall missing"
grep -Fq '    hysteria2-status)' xrayebator || fail "dispatch hysteria2-status missing"
grep -Fq '      11) hysteria2_menu ;;' xrayebator || fail "menu dispatch 11 missing"
grep -Fq 'hysteria2_menu() {' xrayebator || fail "hysteria2_menu definition missing"
pass "CLI dispatch and menu wiring present"

echo ""
pass "hysteria2 backend (slice 2): all checks green"
