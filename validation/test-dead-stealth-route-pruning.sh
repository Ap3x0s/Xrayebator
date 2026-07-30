#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

WORKDIR=$(mktemp -d /tmp/xrayebator-stealth-prune.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"

CONFIG_FILE="$WORKDIR/config.json"
PROFILES_DIR="$WORKDIR/profiles"
mkdir -p "$PROFILES_DIR"

jq -n '{
  inbounds: [
    {
      port:45001,
      settings:{clients:[{id:"uuid-a"},{id:"uuid-b"},{id:"foreign"}]},
      tag:"shared-stealth"
    },
    {
      port:45002,
      settings:{clients:[{id:"uuid-a"}]},
      tag:"only-stealth"
    },
    {
      port:46001,
      settings:{clients:[{id:"uuid-a"},{id:"uuid-b"}]},
      tag:"keep"
    }
  ]
}' > "$CONFIG_FILE"

jq -n '{
  uuid:"uuid-a",
  transport:"tcp",
  port:46001,
  fingerprint:"firefox",
  sni:"keep.example",
  routes:[
    {label:"keep-a",transport:"tcp",port:46001,fingerprint:"firefox",sni:"keep.example",pq_enabled:false},
    {label:"tcp-stealth-8443",transport:"tcp",port:45001,fingerprint:"firefox",sni:"dead.example",pq_enabled:false},
    {label:"tcp-stealth-2053",transport:"tcp",port:45002,fingerprint:"firefox",sni:"dead.example",pq_enabled:false}
  ]
}' > "$PROFILES_DIR/a.json"

jq -n '{
  uuid:"uuid-b",
  transport:"tcp",
  port:46001,
  fingerprint:"firefox",
  sni:"keep.example",
  routes:[
    {label:"keep-b",transport:"tcp",port:46001,fingerprint:"firefox",sni:"keep.example",pq_enabled:false},
    {label:"tcp-stealth-8443",transport:"tcp",port:45001,fingerprint:"firefox",sni:"dead.example",pq_enabled:false}
  ]
}' > "$PROFILES_DIR/b.json"

_migrate_dead_stealth_routes_2026 ||
  fail "dead stealth migration did not report a change"

jq -e '
  all(.routes[]; .label != "tcp-stealth-8443" and .label != "tcp-stealth-2053") and
  (.routes | length) == 1 and
  .port == 46001 and
  .transport == "tcp"
' "$PROFILES_DIR/a.json" >/dev/null ||
  fail "profile a still contains dead stealth routes or has a broken top-level mirror"
jq -e '
  all(.routes[]; .label != "tcp-stealth-8443" and .label != "tcp-stealth-2053") and
  (.routes | length) == 1
' "$PROFILES_DIR/b.json" >/dev/null ||
  fail "profile b still contains dead stealth routes"

jq -e '
  any(.inbounds[]; .port == 45001 and .settings.clients == [{id:"foreign"}]) and
  ([.inbounds[] | select(.port == 45002)] | length) == 0 and
  any(.inbounds[]; .port == 46001 and (.settings.clients | length) == 2)
' "$CONFIG_FILE" >/dev/null ||
  fail "migration removed a foreign client or damaged a live inbound"

second_rc=0
_migrate_dead_stealth_routes_2026 || second_rc=$?
[[ "$second_rc" -eq 1 ]] ||
  fail "second migration run must be a no-op, got $second_rc"

echo "PASS: dead tcp-stealth routes are pruned without deleting foreign clients"
