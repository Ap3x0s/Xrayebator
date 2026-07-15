#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = re.S) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return updated


CASCADE_BLOCK = r'''_cascade_print_status() {
  local upstream_file transport
  upstream_file=$(_cascade_config_file)
  if _cascade_enabled; then
    echo -e "${GREEN}Каскад: включен${NC}"
  else
    echo -e "${YELLOW}Каскад: выключен${NC}"
  fi
  if [[ -f "$upstream_file" ]]; then
    transport=$(jq -r '.transport // "tcp"' "$upstream_file" 2>/dev/null)
    echo -e "${CYAN}Upstream:${NC} $(jq -r '.address' "$upstream_file"):$(jq -r '.port' "$upstream_file") transport=${transport} sni=$(jq -r '.sni' "$upstream_file")"
  else
    echo -e "${YELLOW}Upstream не настроен${NC}"
  fi
}

_cascade_uri_decode() {
  local value="${1//+/ }"
  printf '%b' "${value//%/\\x}"
}

_cascade_parse_vless_uri() {
  local uri=$1
  if [[ "$uri" != vless://* ]]; then
    echo -e "${RED}✗ Ожидается ссылка vless://${NC}" >&2
    return 1
  fi

  local rest authority query uuid server address port
  rest="${uri#vless://}"
  rest="${rest%%#*}"
  if [[ "$rest" == *\?* ]]; then
    authority="${rest%%\?*}"
    query="${rest#*\?}"
  else
    authority="$rest"
    query=""
  fi

  if [[ "$authority" != *@* ]]; then
    echo -e "${RED}✗ В VLESS-ссылке отсутствует UUID или адрес${NC}" >&2
    return 1
  fi
  uuid="${authority%%@*}"
  server="${authority#*@}"

  if [[ "$server" =~ ^\[([^]]+)\]:([0-9]+)$ ]]; then
    address="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[2]}"
  elif [[ "$server" =~ ^(.+):([0-9]+)$ ]]; then
    address="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[2]}"
  else
    echo -e "${RED}✗ Не удалось разобрать host:port из VLESS-ссылки${NC}" >&2
    return 1
  fi

  declare -A params=()
  local pair key value
  local -a pairs=()
  IFS='&' read -r -a pairs <<< "$query"
  for pair in "${pairs[@]}"; do
    [[ -z "$pair" ]] && continue
    key=$(_cascade_uri_decode "${pair%%=*}")
    if [[ "$pair" == *=* ]]; then
      value=$(_cascade_uri_decode "${pair#*=}")
    else
      value=""
    fi
    params["$key"]="$value"
  done

  local encryption security transport sni fingerprint public_key short_id
  local flow packet_encoding xhttp_path xhttp_host xhttp_mode
  encryption="${params[encryption]:-none}"
  security="${params[security]:-}"
  transport="${params[type]:-tcp}"
  sni="${params[sni]:-${params[serverName]:-}}"
  fingerprint="${params[fp]:-firefox}"
  public_key="${params[pbk]:-${params[publicKey]:-}}"
  short_id="${params[sid]:-${params[shortId]:-}}"
  flow="${params[flow]:-}"
  packet_encoding="${params[packetEncoding]:-}"
  [[ -z "$packet_encoding" ]] && packet_encoding="${params[packetencoding]:-}"
  xhttp_path="${params[path]:-/}"
  xhttp_host="${params[host]:-}"
  [[ -z "$xhttp_host" ]] && xhttp_host="$sni"
  xhttp_mode="${params[mode]:-auto}"

  if [[ "$security" != "reality" ]]; then
    echo -e "${RED}✗ Каскад поддерживает только security=reality${NC}" >&2
    return 1
  fi
  if [[ "$encryption" != "none" ]]; then
    echo -e "${RED}✗ Каскад поддерживает только encryption=none${NC}" >&2
    return 1
  fi
  if [[ "$transport" != "tcp" && "$transport" != "xhttp" ]]; then
    echo -e "${RED}✗ Поддерживаются upstream type=tcp и type=xhttp${NC}" >&2
    return 1
  fi

  jq -n \
    --arg address "$address" \
    --argjson port "$port" \
    --arg uuid "$uuid" \
    --arg transport "$transport" \
    --arg sni "$sni" \
    --arg fingerprint "$fingerprint" \
    --arg public_key "$public_key" \
    --arg short_id "$short_id" \
    --arg flow "$flow" \
    --arg packet_encoding "$packet_encoding" \
    --arg xhttp_path "$xhttp_path" \
    --arg xhttp_host "$xhttp_host" \
    --arg xhttp_mode "$xhttp_mode" '
      {
        version: 2,
        tag: "cascade-upstream",
        address: $address,
        port: $port,
        uuid: $uuid,
        transport: $transport,
        sni: $sni,
        fingerprint: $fingerprint,
        public_key: $public_key,
        short_id: $short_id
      }
      + (if $transport == "tcp" then
          (if $flow == "" then {} else {flow: $flow} end)
          + (if $packet_encoding == "" then {} else {packet_encoding: $packet_encoding} end)
        else
          {
            xhttp_path: $xhttp_path,
            xhttp_host: $xhttp_host,
            xhttp_mode: $xhttp_mode
          }
        end)
    '
}

_cascade_validate_upstream_file() {
  local upstream_file=$1
  if ! jq -e . "$upstream_file" >/dev/null 2>&1; then
    echo -e "${RED}✗ Upstream JSON повреждён${NC}"
    return 1
  fi

  local address port uuid public_key short_id sni fingerprint transport flow packet_encoding
  local xhttp_path xhttp_host xhttp_mode
  address=$(jq -r '.address // empty' "$upstream_file")
  port=$(jq -r '.port // empty' "$upstream_file")
  uuid=$(jq -r '.uuid // empty' "$upstream_file")
  public_key=$(jq -r '.public_key // empty' "$upstream_file")
  short_id=$(jq -r '.short_id // ""' "$upstream_file")
  sni=$(jq -r '.sni // empty' "$upstream_file")
  fingerprint=$(jq -r '.fingerprint // "firefox"' "$upstream_file")
  transport=$(jq -r '.transport // "tcp"' "$upstream_file")
  flow=$(jq -r '.flow // ""' "$upstream_file")
  packet_encoding=$(jq -r '.packet_encoding // ""' "$upstream_file")
  xhttp_path=$(jq -r '.xhttp_path // "/"' "$upstream_file")
  xhttp_host=$(jq -r '.xhttp_host // .sni // empty' "$upstream_file")
  xhttp_mode=$(jq -r '.xhttp_mode // "auto"' "$upstream_file")

  if [[ -z "$address" || "$address" =~ ^(localhost$|0\.0\.0\.0$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1$) ]]; then
    echo -e "${RED}✗ Upstream address не должен быть локальным/private${NC}"
    return 1
  fi
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [[ $port -lt 1 ]] || [[ $port -gt 65535 ]]; then
    echo -e "${RED}✗ Некорректный порт${NC}"
    return 1
  fi
  if [[ ! "$uuid" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo -e "${RED}✗ Некорректный UUID${NC}"
    return 1
  fi
  if [[ ! "$public_key" =~ ^[A-Za-z0-9_-]{40,}$ ]]; then
    echo -e "${RED}✗ Некорректный Reality publicKey${NC}"
    return 1
  fi
  if [[ ! "$short_id" =~ ^[0-9a-fA-F]{0,16}$ ]] || (( ${#short_id} % 2 != 0 )); then
    echo -e "${RED}✗ Некорректный shortId${NC}"
    return 1
  fi
  if [[ -z "$sni" || ! "$sni" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    echo -e "${RED}✗ Некорректный SNI${NC}"
    return 1
  fi
  if [[ ! "$fingerprint" =~ ^(chrome|firefox|safari|ios|android|edge|qq|random|randomized)$ ]]; then
    echo -e "${RED}✗ Некорректный fingerprint${NC}"
    return 1
  fi
  if [[ "$transport" != "tcp" && "$transport" != "xhttp" ]]; then
    echo -e "${RED}✗ transport поддерживает только tcp или xhttp${NC}"
    return 1
  fi
  if [[ "$transport" == "tcp" ]]; then
    if [[ -n "$flow" && "$flow" != "xtls-rprx-vision" ]]; then
      echo -e "${RED}✗ Для TCP поддерживается только flow=xtls-rprx-vision или пустое значение${NC}"
      return 1
    fi
    if [[ -n "$packet_encoding" && "$packet_encoding" != "xudp" ]]; then
      echo -e "${RED}✗ packetEncoding поддерживает только xudp или пустое значение${NC}"
      return 1
    fi
  else
    if [[ "$xhttp_path" != /* ]]; then
      echo -e "${RED}✗ XHTTP path должен начинаться с /${NC}"
      return 1
    fi
    if [[ -z "$xhttp_host" || ! "$xhttp_host" =~ ^[a-zA-Z0-9.-]+$ ]]; then
      echo -e "${RED}✗ Некорректный XHTTP host${NC}"
      return 1
    fi
    if [[ ! "$xhttp_mode" =~ ^(auto|packet-up|stream-up|stream-one)$ ]]; then
      echo -e "${RED}✗ Некорректный XHTTP mode${NC}"
      return 1
    fi
  fi
}

_cascade_build_outbound_json() {
  local upstream_file=$1
  _cascade_validate_upstream_file "$upstream_file" || return 1

  jq -cn --slurpfile upstream "$upstream_file" '
    $upstream[0] as $u |
    ($u.transport // "tcp") as $transport |
    {
      tag: "cascade-upstream",
      protocol: "vless",
      settings: {
        vnext: [{
          address: $u.address,
          port: $u.port,
          users: [{
            id: $u.uuid,
            encryption: "none"
          }
          + (if (($u.flow // "") | length) == 0 then {} else {flow: $u.flow} end)
          + (if (($u.packet_encoding // "") | length) == 0 then {} else {packetEncoding: $u.packet_encoding} end)]
        }]
      },
      streamSettings: ({
        network: $transport,
        security: "reality",
        sockopt: {
          dialerProxy: "cascade-fragment"
        },
        realitySettings: {
          serverName: $u.sni,
          fingerprint: ($u.fingerprint // "firefox"),
          publicKey: $u.public_key,
          shortId: ($u.short_id // ""),
          spiderX: "/"
        }
      }
      + (if $transport == "tcp" then {
          sockopt: {
            dialerProxy: "cascade-fragment",
            tcpFastOpen: true,
            tcpNoDelay: true
          }
        } else {
          xhttpSettings: {
            path: ($u.xhttp_path // "/"),
            host: ($u.xhttp_host // $u.sni),
            mode: ($u.xhttp_mode // "auto")
          }
        } end))
    }
  '
}

_cascade_build_fragment_outbound_json() {
  jq -cn '{
    tag: "cascade-fragment",
    protocol: "freedom",
    settings: {
      fragment: {
        packets: "tlshello",
        length: "100-200",
        interval: "10-20"
      }
    }
  }'
}

_cascade_apply_current_upstream() {
  local reason=${1:-cascade_apply}
  local upstream_file outbound_json fragment_json address old_address had_active=false
  upstream_file=$(_cascade_config_file)
  [[ -f "$upstream_file" ]] || {
    echo -e "${RED}✗ Сначала настройте upstream-ноду${NC}"
    return 1
  }
  _cascade_validate_upstream_file "$upstream_file" || return 1
  outbound_json=$(_cascade_build_outbound_json "$upstream_file") || return 1
  fragment_json=$(_cascade_build_fragment_outbound_json) || return 1
  address=$(jq -r '.address' "$upstream_file")
  old_address=$(jq -r 'first(.outbounds[]? | select(.tag == "cascade-upstream") | .settings.vnext[0].address) // ""' "$CONFIG_FILE" 2>/dev/null)
  [[ -f "$CASCADE_ACTIVE_FILE" ]] && had_active=true

  backup_config "$reason" || return 1
  if ! safe_jq_write \
      --argjson outbound "$outbound_json" \
      --argjson fragment "$fragment_json" \
      --arg address "$address" \
      --arg old_address "$old_address" '
      def is_ip($a):
        (($a | test("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$")) or ($a | test(":")));
      def upstream_direct_rule:
        if is_ip($address) then
          {"type":"field","ip":[$address],"outboundTag":"direct"}
        else
          {"type":"field","domain":["domain:" + $address],"outboundTag":"direct"}
        end;
      def direct_rule_matches($a):
        if $a == "" then false
        elif is_ip($a) then (((.ip // []) | index($a)) != null)
        else (((.domain // []) | index("domain:" + $a)) != null)
        end;
      def upstream_direct_match:
        (.outboundTag == "direct" and (direct_rule_matches($address) or direct_rule_matches($old_address)));
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
      .routing.rules = [
        upstream_direct_rule,
        {"type":"field","network":"udp","port":443,"outboundTag":"block"}
      ] + .routing.rules + [
        {"type":"field","network":"tcp,udp","outboundTag":"cascade-upstream"}
      ]
    ' "$CONFIG_FILE"; then
    echo -e "${RED}✗ Не удалось применить cascade config${NC}"
    return 1
  fi

  fix_xray_permissions
  if safe_restart_xray; then
    touch "$CASCADE_ACTIVE_FILE"
    chown xray:xray "$CASCADE_ACTIVE_FILE" 2>/dev/null || true
    echo -e "${GREEN}✓ Активный каскад синхронизирован с upstream${NC}"
    return 0
  fi

  [[ "$had_active" == "true" ]] || rm -f "$CASCADE_ACTIVE_FILE"
  return 1
}

configure_cascade_upstream() {
  show_ascii
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}    НАСТРОЙКА ЗАРУБЕЖНОЙ UPSTREAM-НОДЫ        ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

  _cascade_ensure_dir
  echo -e "${CYAN} 1)${NC} Импортировать готовую vless:// ссылку ${GREEN}(рекомендуется)${NC}"
  echo -e "${CYAN} 2)${NC} Ввести параметры вручную"
  echo -e "${CYAN} 0)${NC} Назад"
  echo -n -e "${YELLOW}Выбор [1]: ${NC}"
  local method
  read -r method
  method=${method:-1}
  [[ "$method" == "0" ]] && return 0

  local upstream_file candidate previous cascade_was_enabled=false
  upstream_file=$(_cascade_config_file)
  candidate=$(mktemp /tmp/xrayebator-cascade.XXXXXX) || return 1
  previous=$(mktemp /tmp/xrayebator-cascade-prev.XXXXXX) || { rm -f "$candidate"; return 1; }
  if [[ -f "$upstream_file" ]]; then
    cp "$upstream_file" "$previous"
  else
    : > "$previous"
  fi
  _cascade_enabled && cascade_was_enabled=true

  if [[ "$method" == "1" ]]; then
    local uri
    echo -n -e "${YELLOW}VLESS URL: ${NC}"
    read -r uri
    if ! _cascade_parse_vless_uri "$uri" > "$candidate"; then
      rm -f "$candidate" "$previous"
      sleep 2
      return 1
    fi
  elif [[ "$method" == "2" ]]; then
    local address port uuid public_key short_id sni fingerprint transport
    local flow packet_encoding xhttp_path xhttp_host xhttp_mode
    echo -n -e "${YELLOW}Transport [tcp/xhttp, tcp]: ${NC}"
    read -r transport
    transport=${transport:-tcp}
    echo -n -e "${YELLOW}Host/IP зарубежной ноды: ${NC}"
    read -r address
    echo -n -e "${YELLOW}Port [443]: ${NC}"
    read -r port
    port=${port:-443}
    echo -n -e "${YELLOW}UUID клиента на зарубежной ноде: ${NC}"
    read -r uuid
    echo -n -e "${YELLOW}Reality publicKey зарубежной ноды: ${NC}"
    read -r public_key
    echo -n -e "${YELLOW}Reality shortId зарубежной ноды: ${NC}"
    read -r short_id
    echo -n -e "${YELLOW}SNI зарубежной ноды: ${NC}"
    read -r sni
    echo -n -e "${YELLOW}Fingerprint [firefox]: ${NC}"
    read -r fingerprint
    fingerprint=${fingerprint:-firefox}

    if [[ "$transport" == "tcp" ]]; then
      echo -n -e "${YELLOW}Flow [xtls-rprx-vision]: ${NC}"
      read -r flow
      flow=${flow:-xtls-rprx-vision}
      echo -n -e "${YELLOW}packetEncoding [пусто или xudp]: ${NC}"
      read -r packet_encoding
      jq -n \
        --arg address "$address" --argjson port "$port" --arg uuid "$uuid" \
        --arg public_key "$public_key" --arg short_id "$short_id" --arg sni "$sni" \
        --arg fingerprint "$fingerprint" --arg flow "$flow" --arg packet_encoding "$packet_encoding" '
          {version:2,tag:"cascade-upstream",address:$address,port:$port,uuid:$uuid,transport:"tcp",sni:$sni,fingerprint:$fingerprint,public_key:$public_key,short_id:$short_id}
          + (if $flow == "" then {} else {flow:$flow} end)
          + (if $packet_encoding == "" then {} else {packet_encoding:$packet_encoding} end)
        ' > "$candidate"
    elif [[ "$transport" == "xhttp" ]]; then
      echo -n -e "${YELLOW}XHTTP path [/]: ${NC}"
      read -r xhttp_path
      xhttp_path=${xhttp_path:-/}
      echo -n -e "${YELLOW}XHTTP host [$sni]: ${NC}"
      read -r xhttp_host
      xhttp_host=${xhttp_host:-$sni}
      echo -n -e "${YELLOW}XHTTP mode [auto]: ${NC}"
      read -r xhttp_mode
      xhttp_mode=${xhttp_mode:-auto}
      jq -n \
        --arg address "$address" --argjson port "$port" --arg uuid "$uuid" \
        --arg public_key "$public_key" --arg short_id "$short_id" --arg sni "$sni" \
        --arg fingerprint "$fingerprint" --arg xhttp_path "$xhttp_path" \
        --arg xhttp_host "$xhttp_host" --arg xhttp_mode "$xhttp_mode" '
          {version:2,tag:"cascade-upstream",address:$address,port:$port,uuid:$uuid,transport:"xhttp",sni:$sni,fingerprint:$fingerprint,public_key:$public_key,short_id:$short_id,xhttp_path:$xhttp_path,xhttp_host:$xhttp_host,xhttp_mode:$xhttp_mode}
        ' > "$candidate"
    else
      echo -e "${RED}✗ Поддерживаются tcp и xhttp${NC}"
      rm -f "$candidate" "$previous"
      return 1
    fi
  else
    echo -e "${RED}✗ Неверный выбор${NC}"
    rm -f "$candidate" "$previous"
    return 1
  fi

  if ! _cascade_validate_upstream_file "$candidate"; then
    rm -f "$candidate" "$previous"
    sleep 2
    return 1
  fi

  install -m 600 -o xray -g xray "$candidate" "$upstream_file"
  rm -f "$candidate"

  if [[ "$cascade_was_enabled" == "true" ]]; then
    echo -e "${CYAN}  → Каскад активен: применяю новую ноду без отдельного выключения/включения...${NC}"
    if ! _cascade_apply_current_upstream "cascade_reconfigure"; then
      if [[ -s "$previous" ]]; then
        install -m 600 -o xray -g xray "$previous" "$upstream_file"
      else
        rm -f "$upstream_file"
      fi
      rm -f "$previous"
      echo -e "${RED}✗ Новая нода не применена; upstream-файл восстановлен${NC}"
      return 1
    fi
  fi
  rm -f "$previous"

  echo -e "${GREEN}✓ Upstream сохранен: $upstream_file${NC}"
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"
  read -r _
}

enable_cascade_mode() {
  local upstream_file
  upstream_file=$(_cascade_config_file)
  if [[ ! -f "$upstream_file" ]]; then
    echo -e "${RED}✗ Сначала настройте upstream-ноду${NC}"
    sleep 2
    return 1
  fi

  echo -e "${YELLOW}Включить каскад: весь default tcp/udp трафик пойдет через cascade-upstream? (y/N): ${NC}"
  local confirm
  read -r confirm
  [[ "$confirm" =~ ^[yYдД]$ ]] || return 1

  _cascade_apply_current_upstream "cascade_enable" || return 1
  echo -e "${GREEN}✓ Каскад включен${NC}"
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"
  read -r _
}'''


DOWNLOAD_BLOCK = r'''  echo -e "${CYAN}Скачивание $TARGET_TAG...${NC}"
  if [[ -n "${XRAY_LOCAL_ZIP:-}" || -n "${XRAY_LOCAL_DGST:-}" ]]; then
    if [[ ! -f "${XRAY_LOCAL_ZIP:-}" || ! -f "${XRAY_LOCAL_DGST:-}" ]]; then
      echo -e "${RED}✗ XRAY_LOCAL_ZIP и XRAY_LOCAL_DGST должны указывать на существующие файлы${NC}"
      return 2
    fi
    cp "$XRAY_LOCAL_ZIP" "$ZIP_PATH"
    cp "$XRAY_LOCAL_DGST" "$DGST_PATH"
    echo -e "${GREEN}  ✓ Использованы локальные release-файлы${NC}"
  else
    local curl_args=(-fL --retry 5 --retry-delay 2 --retry-all-errors --connect-timeout 30 --max-time 600 --http1.1)
    [[ "${XRAY_FORCE_IPV4:-0}" == "1" ]] && curl_args+=(-4)
    [[ -n "${XRAY_DOWNLOAD_PROXY:-}" ]] && curl_args+=(--proxy "$XRAY_DOWNLOAD_PROXY")

    if ! curl "${curl_args[@]}" --progress-bar -o "$ZIP_PATH" "$ZIP_URL"; then
      echo -e "${RED}✗ Не удалось скачать $ZIP_URL${NC}"
      echo -e "${YELLOW}  Можно указать SOCKS/HTTP proxy через XRAY_DOWNLOAD_PROXY или локальные XRAY_LOCAL_ZIP/XRAY_LOCAL_DGST.${NC}"
      return 2
    fi

    if ! curl "${curl_args[@]}" -sS -o "$DGST_PATH" "$DGST_URL"; then
      echo -e "${RED}✗ Не удалось скачать .dgst (SHA-256 manifest обязателен)${NC}"
      echo -e "${YELLOW}  Проверка SHA не отключается; загрузите ZIP и .dgst через другой канал и передайте локальные пути.${NC}"
      return 2
    fi
  fi'''


BBR_BLOCK = r'''# [8/10] Опциональная настройка TCP
  echo -e "${BLUE}[8/10]${NC} ${YELLOW}Настройка TCP congestion control...${NC}"
  TCP_TUNING_MODE="${XRAY_TCP_TUNING:-ask}"
  if [[ "$TCP_TUNING_MODE" == "ask" ]]; then
    if [[ -t 0 ]]; then
      echo -e "${CYAN} 1)${NC} Не менять системные TCP-настройки ${GREEN}(рекомендуется)${NC}"
      echo -e "${CYAN} 2)${NC} Включить только BBR + fq"
      echo -e "${CYAN} 3)${NC} Применить расширенный TCP-тюнинг"
      echo -n -e "${YELLOW}Выбор [1]: ${NC}"
      read -r tcp_choice
      case "${tcp_choice:-1}" in
        2) TCP_TUNING_MODE="bbr" ;;
        3) TCP_TUNING_MODE="extended" ;;
        *) TCP_TUNING_MODE="none" ;;
      esac
    else
      TCP_TUNING_MODE="none"
    fi
  fi

  case "$TCP_TUNING_MODE" in
    none|skip)
      echo -e "${CYAN}✓ Системные TCP-настройки оставлены без изменений${NC}\n"
      ;;
    bbr|minimal)
      cat > /etc/sysctl.d/99-xrayebator-tcp.conf <<'EOF'
# Xrayebator minimal TCP tuning
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
      sysctl --system > /dev/null 2>&1 || true
      echo -e "${GREEN}✓ Включены BBR + fq${NC}\n"
      ;;
    extended)
      cat > /etc/sysctl.d/99-xrayebator-tcp.conf <<'EOF'
# Xrayebator extended TCP tuning
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.ipv4.tcp_fastopen=3
net.ipv4.tcp_slow_start_after_idle=0
net.ipv4.tcp_notsent_lowat=16384
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=1048576
net.core.wmem_default=1048576
net.ipv4.ip_local_port_range=1024 65535
net.ipv4.tcp_max_tw_buckets=2000000
net.ipv4.tcp_fin_timeout=10
net.ipv4.tcp_keepalive_time=600
net.ipv4.tcp_keepalive_intvl=30
net.ipv4.tcp_keepalive_probes=3
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_syncookies=1
net.core.netdev_max_backlog=16384
net.ipv4.tcp_max_syn_backlog=8192
EOF
      sysctl --system > /dev/null 2>&1 || true
      echo -e "${GREEN}✓ Применён расширенный TCP-тюнинг${NC}\n"
      ;;
    *)
      echo -e "${YELLOW}⚠ Неизвестный XRAY_TCP_TUNING=$TCP_TUNING_MODE; настройки пропущены${NC}\n"
      ;;
  esac

  # [9/10] Загрузка данных'''


TEST_CASCADE = r'''#!/usr/bin/env bash
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
'''


TEST_INSTALLER = r'''#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }

for file in xrayebator install.sh update.sh; do
  path="$REPO_ROOT/$file"
  grep -q 'XRAY_LOCAL_ZIP' "$path" || fail "$file: local ZIP fallback missing"
  grep -q 'XRAY_LOCAL_DGST' "$path" || fail "$file: local digest fallback missing"
  grep -q 'XRAY_DOWNLOAD_PROXY' "$path" || fail "$file: proxy fallback missing"
  grep -q -- '--retry-all-errors' "$path" || fail "$file: retry-all-errors missing"
  grep -q -- '--http1.1' "$path" || fail "$file: HTTP/1.1 fallback missing"
done

grep -q 'XRAY_TCP_TUNING' "$REPO_ROOT/install.sh" || fail "optional TCP tuning selector missing"
grep -q '/etc/sysctl.d/99-xrayebator-tcp.conf' "$REPO_ROOT/install.sh" || fail "sysctl.d config missing"
if grep -q 'cat >> /etc/sysctl.conf' "$REPO_ROOT/install.sh"; then
  fail "installer still appends global tuning directly to /etc/sysctl.conf"
fi

echo "PASS: installer network fallbacks and optional TCP tuning"
'''


def patch_downloads(path: Path) -> None:
    text = path.read_text()
    pattern = r'''  echo -e "\$\{CYAN\}Скачивание \$TARGET_TAG\.\.\.\$\{NC\}"
  if ! curl -fL --progress-bar --connect-timeout 30 --max-time 300 \\
       -o "\$ZIP_PATH" "\$ZIP_URL"; then
    echo -e "\$\{RED\}✗ Не удалось скачать \$ZIP_URL\$\{NC\}"
    return 2
  fi

  if ! curl -fsSL --connect-timeout 10 --max-time 30 \\
       -o "\$DGST_PATH" "\$DGST_URL"; then
    echo -e "\$\{RED\}✗ Не удалось скачать \.dgst \(SHA-256 manifest обязателен\)\$\{NC\}"
    return 2
  fi'''
    text = replace_once(text, pattern, DOWNLOAD_BLOCK, f"download block in {path.name}")
    path.write_text(text)


def main() -> None:
    xrayebator = ROOT / "xrayebator"
    text = xrayebator.read_text()
    text = replace_once(
        text,
        r'_cascade_print_status\(\) \{.*?\n\}\n\ndisable_cascade_mode\(\) \{',
        CASCADE_BLOCK + '\n\ndisable_cascade_mode() {',
        "cascade implementation",
    )
    text = text.replace(
        '/usr/local/bin/xray run -test -config "$CONFIG_FILE"',
        '/usr/local/bin/xray run -test -format json -config "$CONFIG_FILE"',
    )
    xrayebator.write_text(text)

    for name in ("xrayebator", "install.sh", "update.sh"):
        patch_downloads(ROOT / name)

    install = ROOT / "install.sh"
    install_text = install.read_text()
    install_text = replace_once(
        install_text,
        r'# \[8/10\] Настройка BBR TCP Congestion Control.*?# \[9/10\] Загрузка данных',
        BBR_BLOCK,
        "optional TCP tuning",
    )
    install.write_text(install_text)

    readme = ROOT / "README.md"
    readme_text = readme.read_text()
    old = 'Поддерживаемый MVP upstream: VLESS Reality over TCP Vision/XUDP. Для включения нужны `address`, `port`, `uuid`, `publicKey`, `shortId`, `SNI`, `fingerprint`.'
    new = ('Поддерживаемые upstream: VLESS Reality over TCP (включая Vision/XUDP) и XHTTP. '
           'Меню принимает готовую `vless://` ссылку и автоматически переносит transport-specific параметры. '
           'Если каскад уже активен, смена upstream атомарно пересобирает outbound/routing и перезапускает Xray; '
           'отдельно выключать и включать каскад больше не требуется.')
    if old not in readme_text:
        raise RuntimeError("README cascade paragraph not found")
    readme_text = readme_text.replace(old, new)
    marker = '### Каскад / upstream-ноды\n'
    if marker in readme_text and 'XRAY_LOCAL_ZIP' not in readme_text:
        download_docs = '''\n### Установка Xray-core при недоступном GitHub Releases\n\nЗагрузчик повторяет запросы и поддерживает принудительный IPv4/HTTP proxy или SOCKS proxy:\n\n```bash\nXRAY_FORCE_IPV4=1 XRAY_DOWNLOAD_PROXY=socks5h://127.0.0.1:1080 bash install.sh\n```\n\nТакже можно заранее скачать официальный ZIP и `.dgst`, после чего передать локальные пути. SHA-256 остаётся обязательным:\n\n```bash\nXRAY_LOCAL_ZIP=/tmp/Xray-linux-64.zip \\\nXRAY_LOCAL_DGST=/tmp/Xray-linux-64.zip.dgst \\\nXRAY_TCP_TUNING=none bash install.sh\n```\n\n`XRAY_TCP_TUNING` принимает `none` (по умолчанию), `bbr` или `extended`. Без явного выбора установщик не меняет системные TCP-параметры.\n\n'''
        readme_text = readme_text.replace(marker, download_docs + marker)
    readme.write_text(readme_text)

    (ROOT / "validation/test-cascade-upstream-import.sh").write_text(TEST_CASCADE)
    (ROOT / "validation/test-installer-network-fallbacks.sh").write_text(TEST_INSTALLER)


if __name__ == "__main__":
    main()
