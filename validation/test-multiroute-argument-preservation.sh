#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "✗ $*" >&2
  exit 1
}

echo "Проверка аргументов multi-route inbound"

WORKDIR=$(mktemp -d /tmp/xrayebator-multiroute.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"

PROFILES_DIR="$WORKDIR/profiles"
CONFIG_FILE="$WORKDIR/config.json"
CAPTURE_FILE="$WORKDIR/add-inbound.args"
mkdir -p "$PROFILES_DIR"
printf '{"inbounds":[]}\n' > "$CONFIG_FILE"

_default_sni_for_transport() {
  case "$1" in
    grpc) echo "www.cloudflare.com" ;;
    tcp-xudp) echo "api-maps.yandex.ru" ;;
    *) echo "www.ozon.ru" ;;
  esac
}

build_transport_defaults() {
  case "$1" in
    xhttp)
      if [[ ! -f "$WORKDIR/xhttp-seen" ]]; then
        touch "$WORKDIR/xhttp-seen"
        echo "41001||/xhttp-legacy-test"
      else
        echo "41002||/xhttp-pq-test"
      fi
      ;;
    tcp-mux) echo "41003||" ;;
    grpc) echo "41004|grpc-test|" ;;
    tcp) echo "41005||" ;;
    tcp-utls) echo "41006||" ;;
    tcp-xudp) echo "41007||" ;;
    *) return 1 ;;
  esac
}

backup_config() {
  return 0
}

add_inbound() {
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" >> "$CAPTURE_FILE"
}

safe_restart_xray() {
  return 0
}

fix_xray_permissions() {
  return 0
}

set +e
create_profile_all_routes "sample" "no_pause" "hide_subscription" >/dev/null
create_rc=$?
set -e
[[ "$create_rc" -eq 0 ]] || fail "multi-route profile creation returned $create_rc"

legacy=$(awk -F '|' '$2 == "xhttp" && $3 == "41001" {print $6 "|" $7 "|" $8}' "$CAPTURE_FILE")
pq=$(awk -F '|' '$2 == "xhttp" && $3 == "41002" {print $6 "|" $7 "|" $8}' "$CAPTURE_FILE")
grpc=$(awk -F '|' '$2 == "grpc" {print $6 "|" $7 "|" $8}' "$CAPTURE_FILE")

[[ "$legacy" == "|/xhttp-legacy-test|false" ]] \
  || fail "legacy XHTTP path shifted into grpc_service_name: $legacy"
[[ "$pq" == "|/xhttp-pq-test|true" ]] \
  || fail "PQ XHTTP path shifted into grpc_service_name: $pq"
[[ "$grpc" == "grpc-test||false" ]] \
  || fail "gRPC service name was not preserved: $grpc"

echo "PASS: empty route metadata fields preserve their argument positions"
