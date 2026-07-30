#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Sourced mode registers functions without root checks or interactive dispatch.
# Override the production writer so the migration can run on a temporary file.
# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"
safe_jq_write() {
  local filter="$1" file="$2" tmp
  tmp=$(mktemp)
  jq "$filter" "$file" > "$tmp" && mv "$tmp" "$file"
}

WORKDIR=$(mktemp -d /tmp/xrayebator-udp443-migration.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT
CONFIG_FILE="$WORKDIR/config.json"

cat > "$CONFIG_FILE" <<'JSON'
{
  "routing": {
    "rules": [
      {"type":"field","network":"udp","port":443,"outboundTag":"block"},
      {"type":"field","network":"udp","port":443,"inboundTag":["custom"],"outboundTag":"block"},
      {"type":"field","network":"tcp,udp","outboundTag":"direct"}
    ]
  }
}
JSON

migrate_legacy_managed_udp443_block_v3 \
  || fail "legacy rule migration failed"

! jq -e '.routing.rules[] | select(. == {"type":"field","network":"udp","port":443,"outboundTag":"block"})' "$CONFIG_FILE" >/dev/null \
  || fail "historical bare UDP/443 block was not removed"
jq -e '.routing.rules[] | select(.inboundTag == ["custom"] and .network == "udp" and .port == 443 and .outboundTag == "block")' "$CONFIG_FILE" >/dev/null \
  || fail "operator-scoped UDP/443 rule was removed"
jq -e '.routing.rules[] | select(.network == "tcp,udp" and .outboundTag == "direct")' "$CONFIG_FILE" >/dev/null \
  || fail "unrelated routing rule was changed"

second_rc=0
migrate_legacy_managed_udp443_block_v3 >/dev/null || second_rc=$?
[[ "$second_rc" -eq 1 ]] || fail "second migration run must be a no-op"

install_update_matches=$(rg -n \
  'QUIC_RULE|quic_block_(rule|match)|"network"[[:space:]]*:[[:space:]]*"udp"[^}]*"port"[[:space:]]*:[[:space:]]*443[^}]*"outboundTag"[[:space:]]*:[[:space:]]*"block"' \
  install.sh update.sh || true)
[[ -z "$install_update_matches" ]] \
  || fail "fresh install/update still creates an UDP/443 block: $install_update_matches"

cascade_block=$(sed -n '/^_cascade_apply_current_upstream() {$/,/^configure_cascade_upstream() {$/p' xrayebator)
disable_block=$(sed -n '/^disable_cascade_mode() {$/,/^cascade_mode_menu() {$/p' xrayebator)
! grep -Eq 'quic_block|network.*udp.*port.*443|port.*443.*outboundTag.*block' <<< "$cascade_block$disable_block" \
  || fail "cascade still creates or removes an UDP/443 block"

grep -q 'run_migration "legacy_udp443_block_removed_v3"' xrayebator \
  || fail "legacy UDP/443 cleanup is not marker-backed"

grep -q '^# XRAYEBATOR v3\.0 ' xrayebator \
  || fail "xrayebator runtime version is not 3.0"
grep -q '^# XRAYEBATOR INSTALLER v3\.0$' install.sh \
  || fail "installer version is not 3.0"
grep -q '^# XRAYEBATOR UPDATE SCRIPT v3\.0$' update.sh \
  || fail "updater version is not 3.0"
if rg -n '\bv2\.0\b|HAPP 2\.10\+' --glob '!gui/**' . >/dev/null; then
  fail "stale Xrayebator 2.0/HAPP 2.10 release text remains"
fi

for localized_doc in \
  README.md README.ru.md README.zh-CN.md \
  docs/troubleshooting.md docs/ru/troubleshooting.md docs/zh-CN/troubleshooting.md; do
  grep -q '3\.3\.6' "$localized_doc" \
    || fail "$localized_doc does not require current HAPP"
  grep -q '10808' "$localized_doc" \
    || fail "$localized_doc does not explain the main HAPP core check"
done

echo "PASS: legacy UDP/443 block is removed once and never re-created"
