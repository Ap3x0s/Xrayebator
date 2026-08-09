#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

WORKDIR=$(mktemp -d /tmp/xrayebator-xhttp-repair.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"

CONFIG_FILE="$WORKDIR/config.json"
PROFILES_DIR="$WORKDIR/profiles"
mkdir -p "$PROFILES_DIR"

jq -n '{
  inbounds: [
    {
      port: 41001,
      protocol: "vless",
      settings: {
        clients: [{id: "11111111-2222-3333-4444-555555555555", flow: ""}],
        decryption: "none"
      },
      streamSettings: {
        network: "xhttp",
        xhttpSettings: {path: "", host: "www.ozon.ru"}
      }
    },
    {
      port: 41002,
      protocol: "vless",
      settings: {
        clients: [{id: "11111111-2222-3333-4444-555555555555", flow: ""}],
        decryption: "none"
      },
      streamSettings: {
        network: "xhttp",
        xhttpSettings: {path: "/already-live", host: "www.ozon.ru"}
      }
    },
    {
      port: 41003,
      protocol: "vless",
      settings: {
        clients: [
          {id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", flow: ""},
          {id: "ffffffff-1111-2222-3333-444444444444", flow: ""}
        ],
        decryption: "none"
      },
      streamSettings: {
        network: "xhttp",
        xhttpSettings: {path: "", host: "www.ozon.ru"}
      }
    }
  ]
}' > "$CONFIG_FILE"

jq -n '{
  name: "sample",
  uuid: "11111111-2222-3333-4444-555555555555",
  routes: [
    {
      label: "repair",
      transport: "xhttp",
      port: 41001,
      xhttp_path: "/restore-me"
    },
    {
      label: "preserve",
      transport: "xhttp",
      port: 41002,
      xhttp_path: "/profile-stale"
    }
  ]
}' > "$PROFILES_DIR/sample.json"

jq -n '{
  name: "ambiguous-a",
  uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  transport: "xhttp",
  port: 41003,
  xhttp_path: "/first"
}' > "$PROFILES_DIR/ambiguous-a.json"

jq -n '{
  name: "ambiguous-b",
  uuid: "ffffffff-1111-2222-3333-444444444444",
  transport: "xhttp",
  port: 41003,
  xhttp_path: "/second"
}' > "$PROFILES_DIR/ambiguous-b.json"

_migrate_xhttp_route_path_repair_2026 \
  || fail "repair migration did not report a config change"

[[ "$(jq -r '.inbounds[] | select(.port == 41001) | .streamSettings.xhttpSettings.path' "$CONFIG_FILE")" == "/restore-me" ]] \
  || fail "empty XHTTP path was not restored from profile metadata"
[[ "$(jq -r '.inbounds[] | select(.port == 41002) | .streamSettings.xhttpSettings.path' "$CONFIG_FILE")" == "/already-live" ]] \
  || fail "migration overwrote an existing live XHTTP path"
[[ "$(jq -r '.inbounds[] | select(.port == 41003) | .streamSettings.xhttpSettings.path' "$CONFIG_FILE")" == "" ]] \
  || fail "migration guessed a path for ambiguous shared inbound"

second_rc=0
_migrate_xhttp_route_path_repair_2026 || second_rc=$?
[[ "$second_rc" -eq 1 ]] || fail "idempotent second run must return no-op, got $second_rc"

echo "PASS: lost XHTTP route paths are repaired conservatively"
