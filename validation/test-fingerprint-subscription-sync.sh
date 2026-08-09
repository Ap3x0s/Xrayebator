#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

WORKDIR=$(mktemp -d /tmp/xrayebator-fingerprint-sync.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"

CONFIG_FILE="$WORKDIR/config.json"
PROFILES_DIR="$WORKDIR/profiles"
PRIVATE_KEY_FILE="$WORKDIR/private.key"
PUBLIC_KEY_FILE="$WORKDIR/public.key"
VLESS_ENCRYPTION_FILE="$WORKDIR/vless-encryption"
XRAYEBATOR_SERVER_ADDR_OVERRIDE="203.0.113.10"

mkdir -p "$PROFILES_DIR"
printf '%s' 'private-test-key' > "$PRIVATE_KEY_FILE"
printf '%s' 'public-test-key' > "$PUBLIC_KEY_FILE"
printf '%s' 'mlkem768x25519plus.native.test' > "$VLESS_ENCRYPTION_FILE"

[[ "$DEFAULT_CLIENT_FINGERPRINT" == "firefox" ]] \
  || fail "default client fingerprint must be firefox"
! grep -Fq '.streamSettings.realitySettings.fingerprint' "$REPO_ROOT/xrayebator" \
  || fail "fingerprint must not be read from Reality server state"
! grep -Fq '"fingerprint": "$fingerprint"' "$REPO_ROOT/xrayebator" \
  || fail "fingerprint must not be written to Reality server templates"

jq -n '{
  inbounds: [
    {
      port: 12345,
      protocol: "vless",
      settings: {
        clients: [{id: "11111111-2222-3333-4444-555555555555", flow: "xtls-rprx-vision"}],
        decryption: "none"
      },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          privateKey: "private-test-key",
          shortIds: ["abcd1234"],
          serverNames: ["www.ozon.ru"],
          fingerprint: "chrome"
        }
      }
    },
    {
      port: 12346,
      protocol: "vless",
      settings: {
        clients: [{id: "11111111-2222-3333-4444-555555555555", flow: ""}],
        decryption: "none"
      },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          privateKey: "private-test-key",
          shortIds: ["beef5678"],
          serverNames: ["www.ozon.ru"],
          fingerprint: "chrome"
        }
      }
    },
    {
      port: 12347,
      protocol: "vless",
      settings: {
        clients: [{id: "66666666-7777-8888-9999-000000000000", flow: "xtls-rprx-vision"}],
        decryption: "none"
      },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          privateKey: "private-test-key",
          shortIds: ["cafe9876"],
          serverNames: ["www.ozon.ru"]
        }
      }
    }
  ]
}' > "$CONFIG_FILE"

jq -n '{
  name: "sample",
  uuid: "11111111-2222-3333-4444-555555555555",
  port: 12345,
  fingerprint: "chrome",
  sub_token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  routes: [
    {
      label: "tcp-vision",
      transport: "tcp",
      port: 12345,
      sni: "www.ozon.ru",
      fingerprint: "chrome"
    },
    {
      label: "tcp-mux",
      transport: "tcp-mux",
      port: 12346,
      sni: "www.ozon.ru",
      fingerprint: "safari"
    }
  ]
}' > "$PROFILES_DIR/sample.json"

jq -n '{
  name: "default",
  uuid: "66666666-7777-8888-9999-000000000000",
  port: 12347,
  transport: "tcp",
  sni: "www.ozon.ru"
}' > "$PROFILES_DIR/default.json"

default_url=$(_generate_vless_url_pure "$PROFILES_DIR/default.json") \
  || fail "default fingerprint URL generation failed"
[[ "$default_url" == *"&fp=firefox&"* ]] \
  || fail "missing fingerprint does not fall back to firefox"

_remove_ignored_reality_server_fingerprints "$CONFIG_FILE" \
  || fail "legacy server-side fingerprints were not removed"
! jq -e 'any(.inbounds[]?; ((.streamSettings.realitySettings? // {}) | has("fingerprint")))' \
  "$CONFIG_FILE" >/dev/null \
  || fail "server-side fingerprint survived cleanup"

_migrate_profile_fingerprints_to_firefox \
  || fail "legacy Chrome profile values were not migrated"
[[ "$(jq -r '.fingerprint' "$PROFILES_DIR/sample.json")" == "firefox" ]] \
  || fail "top-level Chrome fingerprint was not migrated"
[[ "$(jq -r '.routes[0].fingerprint' "$PROFILES_DIR/sample.json")" == "firefox" ]] \
  || fail "route Chrome fingerprint was not migrated"
[[ "$(jq -r '.routes[1].fingerprint' "$PROFILES_DIR/sample.json")" == "safari" ]] \
  || fail "explicit non-Chrome fingerprint was overwritten"

config_before=$(sha256sum "$CONFIG_FILE" | awk '{print $1}')
update_profile_fingerprint "$PROFILES_DIR/sample.json" 1 edge \
  || fail "selected route fingerprint update failed"
config_after=$(sha256sum "$CONFIG_FILE" | awk '{print $1}')

[[ "$config_before" == "$config_after" ]] \
  || fail "client fingerprint update modified server config"
[[ "$(jq -r '.routes[0].fingerprint' "$PROFILES_DIR/sample.json")" == "firefox" ]] \
  || fail "unselected route fingerprint changed"
[[ "$(jq -r '.routes[1].fingerprint' "$PROFILES_DIR/sample.json")" == "edge" ]] \
  || fail "selected route fingerprint was not stored"
[[ "$(jq -r '.fingerprint' "$PROFILES_DIR/sample.json")" == "firefox" ]] \
  || fail "non-primary update changed the top-level mirror"

route_url=$(_generate_vless_url_pure "$PROFILES_DIR/sample.json" 1) \
  || fail "subscription route generation failed"
[[ "$route_url" == *"&fp=edge&"* ]] \
  || fail "subscription URL does not contain the updated fingerprint"

update_profile_fingerprint "$PROFILES_DIR/sample.json" 0 safari \
  || fail "primary route fingerprint update failed"
[[ "$(jq -r '.fingerprint' "$PROFILES_DIR/sample.json")" == "safari" ]] \
  || fail "primary route did not update the legacy top-level mirror"

profile_before=$(sha256sum "$PROFILES_DIR/sample.json" | awk '{print $1}')
if update_profile_fingerprint "$PROFILES_DIR/sample.json" 9 firefox 2>/dev/null; then
  fail "missing route update unexpectedly succeeded"
fi
profile_after=$(sha256sum "$PROFILES_DIR/sample.json" | awk '{print $1}')
[[ "$profile_before" == "$profile_after" ]] \
  || fail "failed route update modified the profile"

echo "PASS: client-only fingerprint updates reach subscription URLs"
