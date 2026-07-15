#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$REPO_ROOT/xrayebator"

fail() { echo "FAIL: $*" >&2; exit 1; }

TCP_URI='vless://11111111-1111-4111-8111-111111111111@edge.example.com:443?encryption=none&flow=xtls-rprx-vision&type=tcp&security=reality&sni=edge.example.com&fp=firefox&pbk=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN&sid=5dbabfc491c2371d#tcp'
XHTTP_URI='vless://22222222-2222-4222-8222-222222222222@xhttp.example.com:443?encryption=none&type=xhttp&path=%2Fapi%2Fv1&host=xhttp.example.com&mode=auto&security=reality&sni=xhttp.example.com&fp=firefox&pbk=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn&sid=#xhttp'

tcp_json=$(_cascade_parse_vless_uri "$TCP_URI")
jq -e '.transport == "tcp" and .flow == "xtls-rprx-vision" and .short_id == "5dbabfc491c2371d"' <<< "$tcp_json" >/dev/null || fail "TCP URI parsed incorrectly"

tcp_file=$(mktemp)
printf '%s\n' "$tcp_json" > "$tcp_file"
tcp_out=$(_cascade_build_outbound_json "$tcp_file")
jq -e '.streamSettings.network == "tcp" and .settings.vnext[0].users[0].flow == "xtls-rprx-vision"' <<< "$tcp_out" >/dev/null || fail "TCP outbound incorrect"

xhttp_json=$(_cascade_parse_vless_uri "$XHTTP_URI")
jq -e '.transport == "xhttp" and .xhttp_path == "/api/v1" and .xhttp_mode == "auto"' <<< "$xhttp_json" >/dev/null || fail "XHTTP URI parsed incorrectly"

xhttp_file=$(mktemp)
printf '%s\n' "$xhttp_json" > "$xhttp_file"
xhttp_out=$(_cascade_build_outbound_json "$xhttp_file")
jq -e '.streamSettings.network == "xhttp" and .streamSettings.xhttpSettings.path == "/api/v1" and (.settings.vnext[0].users[0] | has("flow") | not)' <<< "$xhttp_out" >/dev/null || fail "XHTTP outbound incorrect"

if _cascade_parse_vless_uri 'vless://11111111-1111-4111-8111-111111111111@example.com:443?encryption=none&type=grpc&security=reality&sni=example.com&pbk=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN' >/dev/null 2>&1; then
  fail "unsupported gRPC URI was accepted"
fi

grep -q '_cascade_apply_current_upstream "cascade_reconfigure"' "$REPO_ROOT/xrayebator" || fail "active cascade is not reapplied after reconfiguration"
grep -q -- '-format json -config "$CONFIG_FILE"' "$REPO_ROOT/xrayebator" || fail "explicit JSON validation format missing"

rm -f "$tcp_file" "$xhttp_file"
echo "PASS: cascade VLESS import and outbound generation"
