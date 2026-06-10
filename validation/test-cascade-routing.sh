#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

CONFIG_FILE="$WORKDIR/config.json"
UPSTREAM_FILE="$WORKDIR/cascade.json"

cat > "$CONFIG_FILE" <<'JSON'
{
  "routing": {
    "rules": [
      {"type":"field","domain":["domain:example.ru"],"outboundTag":"direct"},
      {"type":"field","network":"udp","port":443,"outboundTag":"block"},
      {"type":"field","network":"tcp,udp","outboundTag":"direct"},
      {"type":"field","network":"tcp,udp","outboundTag":"direct"}
    ]
  },
  "outbounds": [
    {"protocol":"freedom","settings":{"domainStrategy":"UseIPv4","fragment":{"packets":"tlshello"}},"tag":"direct"},
    {"protocol":"blackhole","tag":"block"}
  ]
}
JSON

cat > "$UPSTREAM_FILE" <<'JSON'
{
  "version": 1,
  "tag": "cascade-upstream",
  "address": "203.0.113.10",
  "port": 443,
  "uuid": "11111111-1111-4111-8111-111111111111",
  "transport": "tcp",
  "sni": "front.example.com",
  "fingerprint": "chrome",
  "public_key": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN",
  "short_id": "abcd1234",
  "flow": "xtls-rprx-vision"
}
JSON

outbound_json=$(jq -cn \
  --arg address "$(jq -r '.address' "$UPSTREAM_FILE")" \
  --argjson port "$(jq -r '.port' "$UPSTREAM_FILE")" \
  --arg uuid "$(jq -r '.uuid' "$UPSTREAM_FILE")" \
  --arg sni "$(jq -r '.sni' "$UPSTREAM_FILE")" \
  --arg fp "$(jq -r '.fingerprint' "$UPSTREAM_FILE")" \
  --arg public_key "$(jq -r '.public_key' "$UPSTREAM_FILE")" \
  --arg short_id "$(jq -r '.short_id' "$UPSTREAM_FILE")" \
  --arg flow "$(jq -r '.flow' "$UPSTREAM_FILE")" \
  --arg packet_encoding "$(jq -r '.packet_encoding // empty' "$UPSTREAM_FILE")" '
  {
    tag: "cascade-upstream",
    protocol: "vless",
    settings: {
      vnext: [{
        address: $address,
        port: $port,
        users: [{
          id: $uuid,
          encryption: "none",
          flow: $flow
        } + (if $packet_encoding == "" then {} else {packetEncoding: $packet_encoding} end)]
      }]
    },
    streamSettings: {
      network: "tcp",
      security: "reality",
      sockopt: {
        dialerProxy: "cascade-fragment",
        tcpFastOpen: true,
        tcpNoDelay: true
      },
      realitySettings: {
        serverName: $sni,
        fingerprint: $fp,
        publicKey: $public_key,
        shortId: $short_id,
        spiderX: "/"
      }
    }
  }')

fragment_json=$(jq -cn '{
  tag: "cascade-fragment",
  protocol: "freedom",
  settings: {
    fragment: {
      packets: "tlshello",
      length: "100-200",
      interval: "10-20"
    }
  }
}')

jq --argjson outbound "$outbound_json" --argjson fragment "$fragment_json" --arg address "203.0.113.10" '
  def upstream_direct_rule:
    if ($address | test("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$")) then
      {"type":"field","ip":[$address],"outboundTag":"direct"}
    else
      {"type":"field","domain":["domain:" + $address],"outboundTag":"direct"}
    end;
  def quic_block_rule:
    {"type":"field","network":"udp","port":443,"outboundTag":"block"};
  def upstream_direct_match:
    (.outboundTag == "direct" and (
      (((.domain // []) | index("domain:" + $address)) != null) or
      (((.ip // []) | index($address)) != null)
    ));
  def quic_block_match:
    (.type == "field" and (.network // "") == "udp" and ((.port | tostring) == "443") and .outboundTag == "block");
  def catch_all:
    (.type == "field" and (.network // "") == "tcp,udp"
     and (.domain // null) == null and (.ip // null) == null and (.port // null) == null);
  .outbounds = ((.outbounds // []) | map(select(.tag != "cascade-upstream" and .tag != "cascade-fragment"))) |
  .outbounds += [$fragment, $outbound] |
  .routing.rules = [
    .routing.rules[]?
    | select((upstream_direct_match or quic_block_match or catch_all) | not)
  ] |
  .routing.rules = [upstream_direct_rule, quic_block_rule] + .routing.rules + [{"type":"field","network":"tcp,udp","outboundTag":"cascade-upstream"}]
' "$CONFIG_FILE" > "$WORKDIR/enabled.json"

jq -e '.outbounds[] | select(.tag == "cascade-upstream" and .protocol == "vless")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "cascade outbound missing"
jq -e '.outbounds[] | select(.tag == "cascade-fragment" and .protocol == "freedom" and .settings.fragment.packets == "tlshello")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "cascade fragment outbound missing"
jq -e '.outbounds[] | select(.tag == "cascade-upstream").streamSettings.sockopt | select(.dialerProxy == "cascade-fragment" and .tcpFastOpen == true and .tcpNoDelay == true)' "$WORKDIR/enabled.json" >/dev/null \
  || fail "cascade outbound does not use cascade-fragment dialerProxy"
! jq -e '.outbounds[] | select(.tag == "cascade-upstream").settings.vnext[0].users[0].packetEncoding' "$WORKDIR/enabled.json" >/dev/null \
  || fail "plain tcp upstream unexpectedly has packetEncoding"
jq -e '.outbounds[] | select(.tag == "direct" and .settings.fragment.packets == "tlshello")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "direct outbound was clobbered"
jq -e '.routing.rules[0] | select(.outboundTag == "direct" and .ip[0] == "203.0.113.10")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "upstream direct IP exception missing"
jq -e '.routing.rules[1] | select(.network == "udp" and (.port|tostring) == "443" and .outboundTag == "block")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "udp/443 block rule missing before cascade catch-all"
jq -e '.routing.rules[] | select(.network == "tcp,udp" and .outboundTag == "cascade-upstream")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "catch-all was not switched to cascade"
[[ "$(jq '[.routing.rules[] | select(.network == "tcp,udp" and (.domain // null) == null and (.ip // null) == null and (.port // null) == null)] | length' "$WORKDIR/enabled.json")" == "1" ]] \
  || fail "catch-all rules were not normalized"
jq -e '.routing.rules[] | select(.domain[0] == "domain:example.ru" and .outboundTag == "direct")' "$WORKDIR/enabled.json" >/dev/null \
  || fail "existing bypass direct rule was not preserved"

jq '
  def quic_block_match:
    (.type == "field" and (.network // "") == "udp" and ((.port | tostring) == "443") and .outboundTag == "block");
  def catch_all:
    (.type == "field" and (.network // "") == "tcp,udp"
     and (.domain // null) == null and (.ip // null) == null and (.port // null) == null);
  .outbounds = ((.outbounds // []) | map(select(.tag != "cascade-upstream" and .tag != "cascade-fragment"))) |
  .routing.rules = [.routing.rules[]? | select(quic_block_match | not)] |
  (.routing.rules[]? | select(catch_all) | .outboundTag) = "direct"
' "$WORKDIR/enabled.json" > "$WORKDIR/disabled.json"

! jq -e '.outbounds[]? | select(.tag == "cascade-upstream")' "$WORKDIR/disabled.json" >/dev/null \
  || fail "cascade outbound still present after disable"
! jq -e '.outbounds[]? | select(.tag == "cascade-fragment")' "$WORKDIR/disabled.json" >/dev/null \
  || fail "cascade fragment still present after disable"
jq -e '.routing.rules[] | select(.network == "tcp,udp" and .outboundTag == "direct")' "$WORKDIR/disabled.json" >/dev/null \
  || fail "catch-all was not restored to direct"
! jq -e '.routing.rules[] | select(.network == "udp" and (.port|tostring) == "443" and .outboundTag == "block")' "$WORKDIR/disabled.json" >/dev/null \
  || fail "udp/443 block rule still present after disable"

echo "OK: cascade routing jq mutations"
