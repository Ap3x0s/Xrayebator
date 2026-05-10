# Phase 6: Post-Quantum (VLESS Encryption + ML-KEM) — Research

**Researched:** 2026-05-10
**Domain:** Xray-core VLESS Encryption, ML-KEM-768, parallel inbound architecture, profile JSON schema v2
**Confidence:** MEDIUM-HIGH (core architecture verified; vlessenc parser contract superseded by FIELD UPDATE below)

---

## ⚠️ SCOPE UPDATE 2026-05-10 (post user review — must read before planning)

После презентации этого RESEARCH user принял следующие решения, применённые к REQUIREMENTS.md / ROADMAP.md / STATE.md:

- **REQ-A07 DROPPED.** Two-port pattern (`port_pq` + `port_legacy = port_pq + 1`), описанный ниже как primary recommendation, **НЕ принят**. Org fallback переезжает на уровень отдельных профилей: REQ-A06 уже даёт юзеру выбор PQ vs legacy при создании профиля через `create_profile_menu`. Если юзеру нужен legacy fallback — он создаёт отдельный legacy TCP+Vision профиль.
- **REQ-A09 REVISED → in-place replace.** Кнопка "Upgrade to post-quantum" теперь in-place заменяет transport+settings профиля на XHTTP+Reality+native (сохраняя UUID и порт). Legacy-клиенты этого профиля отвалятся — explicit warning перед apply.
- **REQ-C11 REVISED → одна vless:// строка на профиль** (не две). Phase 7 update.
- **Profile JSON schema v2 упрощается:** НЕ хранит `uuid_legacy` / `port_legacy` (REQ-A07 снят) — только флаг `pq_enabled` (или эквивалент в transport-блоке) для определения наличия `encryption=` в vless URL.
- **Complexity downgrade:** L → M.

## ⚠️ FIELD UPDATE 2026-05-10 (vlessenc parser — authoritative)

Field research on Xray 26.2.6 and official command docs supersede the older §10 parser assumptions below:

- `xray vlessenc` has usage `xray vlessenc`; do **not** pass `-mode native`.
- The command can emit both X25519-auth and ML-KEM-768-auth JSON-fragment pairs. Phase 6 needs the `Authentication: ML-KEM-768` section.
- Parse values with a section-aware awk pattern: enter section on `^Authentication: ML-KEM-768`, then read `^"decryption":` / `^"encryption":` using `awk -F'"' '{print $4}'`.
- `native` is embedded inside the generated value; the plan must not try to select it by CLI flag.
- Minimum version correction: `vlessenc` was added in Xray-core v25.9.5 (PR #5078), not 25.3. Since Phase 5 installs latest stable, fresh installs are fine; migration guards should check >=25.9.

**Что в этом файле остаётся актуальным:**
- §Standard Stack (vlessenc subcommand, файлы ключей, jq patterns)
- §Architecture Patterns: **только** `decryption` placement (`inbound.settings.decryption`, инбаунд-уровень) и схема профиля для **одного** PQ-инбаунда
- §Don't Hand-Roll, §Common Pitfalls, §Confidence Levels
- §Code Examples — только как historical scaffolding. Для vlessenc parser использовать FIELD UPDATE + 06-01 PLAN, а любые примеры с `-mode`/двумя ссылками/parallel-legacy игнорировать.
- §Per-Plan Guidance — **читать с коррекцией**: 6.2 без parallel-legacy инфраструктуры, 6.3 без add-parallel-pq логики
- §Verification Checks — **исключить** проверки на existence двух инбаундов / двух vless URL
- §Open Questions — parser checkpoint уже закрыт аудитом; остаётся только production smoke после реализации.

**Что игнорировать (obsolete):**
- Любые упоминания `port_legacy = port_pq + 1` / two-port pattern
- Profile JSON fields `uuid_legacy`, `port_legacy`, parallel inbound creation
- "`generate_connection` возвращает обе vless:// ссылки" — теперь одна
- Any `xray vlessenc -mode native` parser examples

---

## Summary

Phase 6 добавляет post-quantum шифрование поверх уже существующего XHTTP+Reality стека. Ключевые компоненты: `xray vlessenc` генерирует пару `decryption`/`encryption` строк в формате `mlkem768x25519plus.native.<ttl>.<padding>.<keys>...`, которые хранятся в двух файлах на сервере (chmod 600). `decryption` идет в `inbound.settings.decryption` (инбаунд-уровень, не клиент-уровень). `encryption` идет в VLESS URL как параметр `encryption=<url-encoded-value>` и в клиентский config.

Главная архитектурная проблема фазы — REQ-A07 требует "два инбаунда на одном порту". Прямого решения в Xray нет: два `InboundObject` с одним портом вызывают конфликт. Верифицированный рабочий паттерн — **XHTTP-инбаунд на обычном порту (например 443) + TCP+Vision-инбаунд на том же порту через fallback или на другом порту**. Для чистой реализации без nginx рекомендуется **два разных порта**: PQ-инбаунд на `port` и legacy-инбаунд на `port+1` (или другой случайный высокий порт). Profile JSON schema v2 хранит оба.

Матрица совместимости на 2026-05-10 изменилась по сравнению с SUMMARY.md от 2026-05-09: Shadowrocket **добавил** поддержку VLESS PQ encryption (App Store changelogs подтверждают). Hiddify пока не поддерживает (issue открыт 2026-03-09). sing-box не поддерживает. mihomo не поддерживает. v2rayN добавил в PR #7782 (август 2025).

**Primary recommendation:** XHTTP+Reality+PQ-инбаунд на основном порту, TCP+Vision-fallback-инбаунд на отдельном порту (port+1). Profile JSON schema_version: 2, хранит `uuid_pq`, `uuid_legacy`, `port_legacy`. `xray vlessenc` парсится аналогично `xray x25519` — по label-строкам.

---

## Standard Stack

### Core CLI subcommands

| Subcommand | Version | Purpose | Note |
|-----------|---------|---------|------|
| `xray vlessenc` | ≥25.3 | Генерирует decryption+encryption пару | Guaranteed Phase 5 |
| `xray uuid` | any | Генерирует UUID для legacy-клиента | Уже используется |
| `xray run -test -config` | any | Валидация config.json | В safe_restart_xray |
| `jq` | any | JSON mutation config.json и profiles | safe_jq_write |
| `openssl rand -hex` | any | Генерация shortIds, sub_token | Уже используется |

### File paths (Phase 6 adds)

```
/usr/local/etc/xray/.vless_decryption   # chmod 600, xray:xray
/usr/local/etc/xray/.vless_encryption   # chmod 600, xray:xray
```

Рядом с существующими:
```
/usr/local/etc/xray/.private_key        # chmod 600
/usr/local/etc/xray/.public_key         # chmod 644
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Два отдельных порта (pq + legacy) | nginx stream proxy на 443 | nginx сложнее, добавляет зависимость, нет в проекте |
| Два отдельных порта | Xray fallback mechanism | Fallback не работает между разными transport типами через Reality |
| schema_version: 2 | Опциональные поля без версионирования | Без версии сложнее читать старые профили в новом коде |

---

## Architecture Patterns

### Recommended Project Structure (new files/constants)

```
xrayebator (runtime script):
├── VLESS_DECRYPTION_FILE="/usr/local/etc/xray/.vless_decryption"
├── VLESS_ENCRYPTION_FILE="/usr/local/etc/xray/.vless_encryption"
├── generate_vless_keys()           # вызывает xray vlessenc
├── add_inbound_pq()                # XHTTP + decryption field
├── add_inbound_legacy()            # TCP+Vision на другом порту
├── create_profile_pq()             # создает profile schema v2
├── generate_connection_v2()        # возвращает ДВА vless:// URL
└── upgrade_profile_to_pq()         # per-profile upgrade button

install.sh:
└── После x25519 gen → generate_vless_keys()

Profiles dir:
└── /usr/local/etc/xray/profiles/NAME.json  (schema_version: 2)
```

### Pattern 1: `xray vlessenc` Output Format и Парсинг

**Статус:** MEDIUM confidence — прямой чтения исходника vlessenc.go не было, но логика выведена из:
- PR #5078 описывает output как "人类易读" (human-readable), аналогичный x25519/mlkem команд
- Issue #5586 показывает что `xray vlessenc` выводит две строки с label (аналогично `xray x25519` → "PrivateKey: ... Password: ...")
- Команда называется "Generate decryption/encryption **json** pair" — слово "json" в названии означает что OUTPUT предназначен для вставки в JSON (значения строк), НЕ что сам вывод команды JSON-объект
- PR #5078 описывает опции: `-key x25519/mlkem`, `-mode native/xorpub/random`, дефолт `x25519/random`

Предполагаемый формат вывода (по аналогии с x25519, MEDIUM confidence):
```
decryption: mlkem768x25519plus.native.600s.100-111-1111.75-0-111.50-0-3333.<x25519-private>.<mlkem-seed>
encryption: mlkem768x25519plus.native.0rtt.100-111-1111.75-0-111.50-0-3333.<x25519-password>.<mlkem-client>
```

**ВАЖНО для плана:** Необходимо верифицировать точный формат через `xray help vlessenc` или `xray vlessenc 2>&1` на реальном Xray ≥25.3. Добавить checkpoint в план 6.1.

**Рекомендуемый парсинг (защищенный, многоуровневый):**
```bash
generate_vless_keys() {
  local vlessenc_output
  vlessenc_output=$(/usr/local/bin/xray vlessenc -mode native 2>&1)
  local vlessenc_exit=$?

  if [[ $vlessenc_exit -ne 0 ]]; then
    echo -e "${RED}✗ xray vlessenc завершился с ошибкой (код $vlessenc_exit)${NC}"
    echo "Вывод: $vlessenc_output"
    return 2
  fi

  # Layer 1: field-name parsing (human-readable output аналогично xray x25519)
  local decryption encryption
  decryption=$(echo "$vlessenc_output" | awk -F': ' '/^decryption:/ || /^Decryption:/ {print $2; exit}' | tr -d '[:space:]')
  encryption=$(echo "$vlessenc_output"  | awk -F': ' '/^encryption:/ || /^Encryption:/ {print $2; exit}' | tr -d '[:space:]')

  # Layer 2: fallback — ищем строки начинающиеся с "mlkem768x25519plus"
  if [[ -z "$decryption" || -z "$encryption" ]]; then
    echo -e "${YELLOW}⚠ Field-based парсер не нашёл ключи, пробую mlkem-shape fallback${NC}"
    local candidates
    candidates=$(echo "$vlessenc_output" | grep -oE 'mlkem768x25519plus\.[a-zA-Z0-9./_+-]+')
    decryption=$(echo "$candidates" | sed -n '1p')
    encryption=$(echo "$candidates"  | sed -n '2p')
  fi

  # Layer 3: validate — обе строки должны начинаться с mlkem768x25519plus
  if [[ ! "$decryption" =~ ^mlkem768x25519plus\. ]] || \
     [[ ! "$encryption"  =~ ^mlkem768x25519plus\. ]]; then
    echo -e "${RED}✗ Не удалось получить корректные mlkem768x25519plus ключи${NC}"
    echo -e "${YELLOW}Убедитесь что Xray-core ≥ 25.3 установлен${NC}"
    echo "Вывод: $vlessenc_output"
    return 2
  fi

  # Store
  printf "%s" "$decryption" > "$VLESS_DECRYPTION_FILE"
  printf "%s" "$encryption"  > "$VLESS_ENCRYPTION_FILE"
  chmod 600 "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE"
  chown xray:xray "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE" 2>/dev/null || true

  echo -e "${GREEN}✓ VLESS Encryption ключи сгенерированы (mlkem768x25519plus.native)${NC}"
  return 0
}
```

### Pattern 2: Decryption Field Placement в Inbound JSON

**Статус:** HIGH confidence — подтверждено из Xray discussions #5372, #5716, official docs.

`decryption` живет в `inbound.settings.decryption` (инбаунд-уровень, заменяет "none"). Это НЕ поле клиента (`settings.clients[].decryption` не существует).

```json
{
  "settings": {
    "clients": [{"id": "UUID", "flow": "xtls-rprx-vision"}],
    "decryption": "mlkem768x25519plus.native.600s.100-111-1111.75-0-111.50-0-3333.<keys>"
  }
}
```

Когда `decryption` не "none" — Xray требует что ВСЕ клиенты на этом инбаунде используют шифрование. Это ключевое следствие для REQ-A07: PQ-инбаунд и legacy-инбаунд ДОЛЖНЫ быть на разных портах.

**jq mutation для add_inbound XHTTP+PQ:**
```bash
# $VLESS_DECRYPTION содержит значение из файла (без пробелов)
VLESS_DECRYPTION=$(cat "$VLESS_DECRYPTION_FILE")

inbound=$(cat << XHTTPEOF
{
  "listen": "0.0.0.0",
  "port": $port,
  "protocol": "vless",
  "settings": {
    "clients": [{"id": "$uuid", "flow": ""}],
    "decryption": "$VLESS_DECRYPTION"
  },
  "streamSettings": {
    "network": "xhttp",
    "security": "reality",
    "xhttpSettings": {
      "mode": "auto",
      "path": "$xhttp_path",
      "host": "$sni",
      "extra": {
        "xPaddingBytes": "100-1000",
        "xmux": {
          "maxConcurrency": "1-1",
          "hMaxRequestTimes": "600-900",
          "hMaxReusableSecs": "1800-3000",
          "hKeepAlivePeriod": 30
        },
        "noSSEHeader": true,
        "scMaxEachPostBytes": "1000000-2000000",
        "scMinPostsIntervalMs": "10-50"
      }
    },
    "realitySettings": {
      "show": false,
      "dest": "$sni:443",
      "xver": 0,
      "serverNames": ["$sni"],
      "privateKey": "$PRIVATE_KEY",
      "shortIds": ["$short_id"],
      "fingerprint": "$fingerprint"
    }
  },
  "sniffing": {"enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true},
  "tag": "inbound-$port"
}
XHTTPEOF
)

if ! safe_jq_write ".inbounds += [$inbound]" "$CONFIG_FILE"; then
  return 1
fi
```

### Pattern 3: Parallel Legacy Inbound (REQ-A07) — Два отдельных порта

**Статус:** HIGH confidence — два InboundObject с одним портом вызывают bind conflict. Верифицировано из:
- Xray issues #2108 ("I tried to have both xtls vision and reality as fallback on 443 port... it can't be happening")
- Discussion #2631 "reuse same port" — community consensus: нет нативной поддержки
- henrywithu.com guide: нужен nginx stream для двух протоколов на одном порту
- Discussion #4826: XHTTP за fallback от TCP+Vision работал частично, но "I can't establish the connection" — нестабильно

**Рекомендованный паттерн: два порта**

При создании нового XHTTP+PQ профиля:
- `port_pq` = случайный высокий порт (как сейчас генерируется) — XHTTP+PQ инбаунд
- `port_legacy` = `port_pq + 1` (или следующий свободный) — TCP+Vision инбаунд

Profile JSON schema v2:
```json
{
  "schema_version": 2,
  "name": "myprofile",
  "uuid_pq": "UUID-PQ",
  "uuid_legacy": "UUID-LEGACY",
  "transport": "xhttp",
  "port": 54321,
  "port_legacy": 54322,
  "fingerprint": "chrome",
  "sni": "www.ozon.ru",
  "xhttp_path": "/xhttppath",
  "pq_enabled": true,
  "created": "2026-05-10 12:00:00"
}
```

**jq mutation для добавления legacy inbound:**
```bash
# Legacy inbound — TCP+Vision без encryption, другой UUID и порт
local uuid_legacy
uuid_legacy=$(uuidgen)
local port_legacy
port_legacy=$((port_pq + 1))
# Убедиться что порт свободен
while jq -e --argjson p "$port_legacy" '.inbounds[] | select(.port == $p)' "$CONFIG_FILE" >/dev/null 2>&1; do
  ((port_legacy++))
done

local short_id_legacy
short_id_legacy=$(openssl rand -hex 4)

inbound_legacy=$(cat << LEGACYEOF
{
  "listen": "0.0.0.0",
  "port": $port_legacy,
  "protocol": "vless",
  "settings": {
    "clients": [{"id": "$uuid_legacy", "flow": "xtls-rprx-vision"}],
    "decryption": "none"
  },
  "streamSettings": {
    "network": "tcp",
    "security": "reality",
    "realitySettings": {
      "show": false,
      "dest": "$sni:443",
      "xver": 0,
      "serverNames": ["$sni"],
      "privateKey": "$PRIVATE_KEY",
      "shortIds": ["$short_id_legacy"],
      "fingerprint": "$fingerprint"
    }
  },
  "sniffing": {"enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true},
  "tag": "inbound-$port_legacy"
}
LEGACYEOF
)

if ! safe_jq_write ".inbounds += [$inbound_legacy]" "$CONFIG_FILE"; then
  return 1
fi
open_firewall_port "$port_legacy"
```

### Pattern 4: Profile JSON Schema v2 Migration

**Паттерн:** Читай `schema_version // 1`. Если 1 — profile v1, не имеет `uuid_pq`/`uuid_legacy`/`port_legacy`. Обратная совместимость: v1-профили читаются всеми функциями, просто без PQ.

```bash
get_profile_schema_version() {
  local profile_file="$1"
  jq -r '.schema_version // 1' "$profile_file" 2>/dev/null
}

is_pq_profile() {
  local profile_file="$1"
  local sv
  sv=$(get_profile_schema_version "$profile_file")
  [[ "$sv" -ge 2 ]] && jq -e '.pq_enabled == true' "$profile_file" >/dev/null 2>&1
}
```

Для upgrade существующего v1-профиля в v2 (REQ-A09):
```bash
safe_jq_write \
  --arg uuid_pq "$new_uuid_pq" \
  --argjson port_legacy "$new_port_legacy" \
  --arg uuid_legacy "$new_uuid_legacy" \
  '.schema_version = 2
   | .uuid_pq = $uuid_pq
   | .uuid_legacy = $uuid_legacy
   | .port_legacy = $port_legacy
   | .pq_enabled = true' \
  "$profile_file"
```

### Pattern 5: generate_connection для PQ-профилей

Функция `generate_connection_v2()` возвращает ДВА URL — для PQ и для legacy.

**VLESS URL с encryption параметром:**
```bash
generate_connection() {
  local profile_name=$1
  local profile_file="$PROFILES_DIR/$profile_name.json"
  local sv
  sv=$(get_profile_schema_version "$profile_file")

  if [[ "$sv" -ge 2 ]] && is_pq_profile "$profile_file"; then
    local uuid_pq uuid_legacy port_pq port_legacy
    uuid_pq=$(jq -r '.uuid_pq // .uuid' "$profile_file")
    uuid_legacy=$(jq -r '.uuid_legacy' "$profile_file")
    port_pq=$(jq -r '.port' "$profile_file")
    port_legacy=$(jq -r '.port_legacy' "$profile_file")
    # ... (остальные параметры)

    # encryption значение нужно URL-encode
    local raw_encryption
    raw_encryption=$(cat "$VLESS_ENCRYPTION_FILE")
    local encoded_encryption
    encoded_encryption=$(jq -nr --arg enc "$raw_encryption" '$enc|@uri')

    local vless_pq="vless://${uuid_pq}@${SERVER_IP}:${port_pq}?encryption=${encoded_encryption}&security=reality&sni=${sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id_pq}&type=xhttp&path=${encoded_xhttp_path}&host=${sni}#${profile_name}-PQ"

    local vless_legacy="vless://${uuid_legacy}@${SERVER_IP}:${port_legacy}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id_legacy}&type=tcp&headerType=none#${profile_name}-Legacy"

    echo -e "${GREEN}Post-Quantum (XHTTP+VLESS Encryption):${NC}"
    echo -e "${YELLOW}${vless_pq}${NC}"
    echo ""
    echo -e "${GREEN}Legacy Fallback (TCP+Vision, для старых клиентов):${NC}"
    echo -e "${YELLOW}${vless_legacy}${NC}"
    # QR для обоих
    qrencode -t ANSIUTF8 "$vless_pq"
    qrencode -t ANSIUTF8 "$vless_legacy"
  else
    # Вызов оригинальной логики для v1 профилей
    _generate_connection_v1 "$profile_name"
  fi
}
```

### Anti-Patterns to Avoid

- **Два InboundObject с одинаковым портом** — вызывает bind conflict при старте Xray
- **decryption в settings.clients[].decryption** — не существует, только settings.decryption на уровне инбаунда
- **Смешивать PQ и legacy клиентов в одном инбаунде** — когда decryption != "none", ВСЕ клиенты должны использовать шифрование
- **Хранить encryption-строку в config.json напрямую** — длинная строка, лучше читать из файла при каждом add_inbound
- **URL-encode encryption вручную через sed** — использовать `jq -nr '$enc|@uri'` (встроенный в jq)
- **Прямо интерполировать длинную encryption-строку в heredoc** — работает, но неудобно для тестирования

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-encoding encryption string | Ручной sed/tr | `jq -nr --arg enc "$val" '$enc\|@uri'` | Корректно обрабатывает все специальные символы в base64url |
| Парсинг vlessenc output | Position-based split | Трёхуровневый парсер (field-name → mlkem-shape → error) | Формат вывода менялся между версиями (прецедент: x25519 изменил в v25.8) |
| Валидация mlkem строки | Ручная проверка длины | `[[ "$val" =~ ^mlkem768x25519plus\. ]]` regex | Простая и стабильная проверка |
| Свободный порт для legacy | Ручной сканирование netstat | jq query на существующие инбаунды | Уже паттерн в codebase (build_transport_defaults) |
| Ротация ключей | Ручная замена строки | Формат decryption поддерживает конкатенацию: `old_val.new_x25519.new_mlkem` | Xray сам мультиплексирует |

**Key insight:** ML-KEM-768 — сложная PQ-математика (CRYSTALS-Kyber). Не реализовывать самостоятельно. Весь крипто — через `xray vlessenc`, парсим только вывод.

---

## Common Pitfalls

### Pitfall 1: Xray не стартует с двумя инбаундами на одном порту
**What goes wrong:** `safe_restart_xray` возвращает ошибку "address already in use" при попытке создать два инбаунда с одним портом.
**Why it happens:** Xray bind-ит порт на OS level. Два inbound с одним портом — прямой конфликт.
**How to avoid:** Всегда два разных порта. `port_legacy = port_pq + 1`, проверить что порт не занят через jq перед добавлением.
**Warning signs:** `xray run -test -config` отдаёт "address already in use" или "duplicate port".

### Pitfall 2: vlessenc output format regression
**What goes wrong:** Новая версия Xray изменила формат вывода (прецедент: x25519 изменил "Private key:" на "PrivateKey:" в v25.8).
**Why it happens:** Upstream команда Xray не считает CLI output частью стабильного API.
**How to avoid:** Трёхуровневый парсер (field-name + mlkem-shape fallback + validator). Добавить unit-test через `bash -c 'VLESSENC_OUT=$(/usr/local/bin/xray vlessenc); ...'` в verification шаге плана.
**Warning signs:** Файл `.vless_decryption` пустой или не начинается с "mlkem768x25519plus.".

### Pitfall 3: encryption string содержит символы требующие URL-encoding
**What goes wrong:** Прямая вставка encryption в VLESS URL ломает URL-парсинг клиента — точки, символы base64url `_` и `-` нужно правильно обработать.
**Why it happens:** VLESS encryption string содержит `.` (разделители) и base64url символы. `_` и `-` безопасны в query-string, но `.` в значении параметра требует encoding.
**How to avoid:** Всегда URL-encode через `jq -nr --arg enc "$raw" '$enc|@uri'`. Это добавит `%2E` для точек.
**Warning signs:** Клиент показывает connection error, хотя config.json правильный.

### Pitfall 4: xorpub скрытое меню открывает дыру через переменную окружения
**What goes wrong:** Если xorpub активируется через env var (XRAY_ADVANCED_MODE=xorpub), то systemd unit может неожиданно передать её.
**How to avoid:** Скрытое xorpub меню должно быть активировано только через конкретный hidden key в TUI (например ввод "xorpub" в поле выбора транспорта). Не через env var.

### Pitfall 5: migration .mlkem_keys_generated запускается до Phase 5 update
**What goes wrong:** Если пользователь запустил xrayebator после фазы 6 но не делал update Xray-core (фаза 5 ещё не выполнена), `xray vlessenc` не существует.
**Why it happens:** `xray vlessenc` доступен только с Xray-core ≥ 25.3.
**How to avoid:** В migration-функции: сначала проверить версию через `xray version | grep -oE '[0-9]+\.[0-9]+'`, если < 25.3 — вернуть код ≥2 с сообщением "Обновите Xray-core (меню 'Обновить Xray-core')".
**Pattern:**
```bash
_check_xray_version_pq() {
  local version
  version=$(/usr/local/bin/xray version 2>/dev/null | grep -oE 'Xray [0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+')
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)
  if [[ "$major" -lt 25 ]] || [[ "$major" -eq 25 && "$minor" -lt 3 ]]; then
    echo -e "${RED}✗ Xray-core $version < 25.3 — VLESS Encryption недоступен${NC}"
    echo -e "${YELLOW}Обновите Xray-core: главное меню → 'Обновить Xray-core'${NC}"
    return 2
  fi
}
```

### Pitfall 6: pq_banner_shown marker — двойной показ
**What goes wrong:** Если banner-функция вызывается до touch marker, и Xray restart завершился ошибкой — banner показывается снова при следующем запуске.
**How to avoid:** touch `.pq_banner_shown` сразу после показа (не зависит от restart). Banner — только UX, не требует restart.

### Pitfall 7: Profile file читается конкурентно при upgrade
**What goes wrong:** Если оператор запускает два xrayebator одновременно (маловероятно, но возможно) — два процесса могут записать несовместимые schema_version.
**Mitigation:** safe_jq_write использует атомарный `mv` — это встроенная защита. Не добавлять дополнительных локов.

---

## Code Examples

### 1. VLESS Encryption key generation (install.sh style)

```bash
# После генерации x25519 ключей, добавить:
VLESSENC_OUTPUT=$(/usr/local/bin/xray vlessenc -mode native 2>&1)
VLESSENC_EXIT=$?

if [[ $VLESSENC_EXIT -ne 0 ]]; then
  echo -e "${RED}✗ xray vlessenc не сработал (код $VLESSENC_EXIT)${NC}"
  echo "$VLESSENC_OUTPUT"
  exit 1
fi

VLESS_DECRYPTION=$(echo "$VLESSENC_OUTPUT" | awk -F': ' '/^[Dd]ecryption:/ {print $2; exit}' | tr -d '[:space:]')
VLESS_ENCRYPTION=$(echo "$VLESSENC_OUTPUT"  | awk -F': ' '/^[Ee]ncryption:/ {print $2; exit}'  | tr -d '[:space:]')

# Fallback: grep mlkem shape
if [[ ! "$VLESS_DECRYPTION" =~ ^mlkem768x25519plus\. ]]; then
  MLKEM_LINES=$(echo "$VLESSENC_OUTPUT" | grep 'mlkem768x25519plus\.')
  VLESS_DECRYPTION=$(echo "$MLKEM_LINES" | sed -n '1p' | tr -d '[:space:]')
  VLESS_ENCRYPTION=$(echo "$MLKEM_LINES"  | sed -n '2p' | tr -d '[:space:]')
fi

if [[ ! "$VLESS_DECRYPTION" =~ ^mlkem768x25519plus\. ]] || \
   [[ ! "$VLESS_ENCRYPTION"  =~ ^mlkem768x25519plus\. ]]; then
  echo -e "${RED}✗ Не удалось распарсить mlkem768x25519plus ключи${NC}"
  exit 1
fi

printf "%s" "$VLESS_DECRYPTION" > "$VLESS_DECRYPTION_FILE"
printf "%s" "$VLESS_ENCRYPTION"  > "$VLESS_ENCRYPTION_FILE"
chmod 600 "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE"
chown xray:xray "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE" 2>/dev/null || true
```

### 2. Migration .mlkem_keys_generated (с version-check)

```bash
_migrate_mlkem_keys() {
  # Проверить версию Xray
  local xray_ver
  xray_ver=$(/usr/local/bin/xray version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  local major minor
  major=$(echo "$xray_ver" | cut -d. -f1)
  minor=$(echo "$xray_ver" | cut -d. -f2)

  if [[ "$major" -lt 25 ]] || [[ "$major" -eq 25 && "$minor" -lt 3 ]]; then
    echo -e "${YELLOW}⚠ Xray-core $xray_ver < 25.3 — миграция mlkem_keys отложена${NC}"
    echo -e "${CYAN}Выполните: главное меню → Обновить Xray-core${NC}"
    return 2  # fail, не no-op — маркер не ставится
  fi

  # Уже есть?
  if [[ -f "$VLESS_DECRYPTION_FILE" ]] && [[ -f "$VLESS_ENCRYPTION_FILE" ]]; then
    return 1  # no-op, пометить как done без restart
  fi

  generate_vless_keys || return 2
  return 0  # changed, нужен restart (хотя сами ключи не требуют restart — только конфиг)
  # Точнее: нет изменений в config.json, но ключи созданы.
  # run_migration сделает restart при rc=0. Это лишний restart.
  # Лучше вернуть 1 (no-op/mark) — ключи не требуют reload Xray.
}
```

**Замечание:** Эта migration НЕ мутирует `config.json` — она только создаёт файлы ключей. Поэтому правильный return code — `1` (mark, no restart). Restart нужен только при add_inbound с decryption.

Итоговая логика:
```bash
_migrate_mlkem_keys() {
  # version check ...
  if [[ -f "$VLESS_DECRYPTION_FILE" ]] && [[ -f "$VLESS_ENCRYPTION_FILE" ]]; then
    return 1  # already done, no-op
  fi
  generate_vless_keys || return 2
  return 1  # no config change, just mark
}
```

### 3. Profile JSON schema v2 creation (в create_profile)

```bash
# При создании XHTTP+PQ профиля
local jq_args=(
  --arg name "$name"
  --arg uuid_pq "$uuid_pq"
  --arg uuid_legacy "$uuid_legacy"
  --arg transport "xhttp"
  --argjson port "$port_pq"
  --argjson port_legacy "$port_legacy"
  --arg fingerprint "$fingerprint"
  --arg sni "$sni"
  --arg xhttp_path "$xhttp_path"
  --arg created "$(date +%Y-%m-%d\ %H:%M:%S)"
)
jq -n "${jq_args[@]}" '{
  schema_version: 2,
  name: $name,
  uuid_pq: $uuid_pq,
  uuid_legacy: $uuid_legacy,
  transport: $transport,
  port: $port,
  port_legacy: $port_legacy,
  fingerprint: $fingerprint,
  sni: $sni,
  xhttp_path: $xhttp_path,
  pq_enabled: true,
  created: $created
}' > "$PROFILES_DIR/$name.json"
```

### 4. Backward-compatible profile reading

```bash
# В generate_connection() и display_profile_info():
get_primary_uuid() {
  local pf="$1"
  local sv
  sv=$(jq -r '.schema_version // 1' "$pf")
  if [[ "$sv" -ge 2 ]]; then
    jq -r '.uuid_pq // .uuid' "$pf"
  else
    jq -r '.uuid' "$pf"
  fi
}

get_primary_port() {
  local pf="$1"
  jq -r '.port' "$pf"  # port всегда primary port
}
```

### 5. VLESS URL с encryption (URL-encoded)

```bash
# Source: jq @uri filter для корректного URL-encoding
local raw_encryption
raw_encryption=$(cat "$VLESS_ENCRYPTION_FILE")
local encoded_encryption
encoded_encryption=$(jq -nr --arg enc "$raw_encryption" '$enc|@uri')

vless_pq="vless://${uuid_pq}@${SERVER_IP}:${port_pq}?encryption=${encoded_encryption}&security=reality&sni=${sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id}&type=xhttp&path=${encoded_path}&host=${sni}#${profile_name}-PQ"
```

### 6. Upgrade существующего профиля (REQ-A09)

```bash
upgrade_profile_to_pq() {
  local profile_name="$1"
  local profile_file="$PROFILES_DIR/$profile_name.json"

  # Проверить что профиль xhttp и ещё не PQ
  local sv transport
  sv=$(jq -r '.schema_version // 1' "$profile_file")
  transport=$(jq -r '.transport' "$profile_file")

  if [[ "$sv" -ge 2 ]] && jq -e '.pq_enabled == true' "$profile_file" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Профиль уже post-quantum${NC}"
    return 0
  fi

  # Warning
  echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║         UPGRADE К POST-QUANTUM ШИФРОВАНИЮ          ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
  echo -e "${RED}⚠ Текущие клиенты будут ОТКЛЮЧЕНЫ при применении!${NC}"
  echo -e "${CYAN}Создаётся параллельный PQ-инбаунд (новый UUID) + legacy сохраняется${NC}"
  echo -e "${CYAN}После upgrade нужно обновить данные у ВСЕХ клиентов${NC}"
  echo -n -e "${YELLOW}Продолжить? (y/N): ${NC}"
  read confirm
  [[ ! "$confirm" =~ ^[yYдД]$ ]] && return 0

  # Генерировать PQ uuid и порт
  local uuid_pq port_pq port sni fingerprint xhttp_path
  uuid_pq=$(uuidgen)
  port=$(jq -r '.port' "$profile_file")
  sni=$(jq -r '.sni' "$profile_file")
  fingerprint=$(jq -r '.fingerprint // "chrome"' "$profile_file")
  xhttp_path=$(jq -r '.xhttp_path // "/xhttp"' "$profile_file")

  # Для transport==xhttp: port_pq = новый порт (не занятый), legacy = старый port
  port_pq=$((port + 1))
  while jq -e --argjson p "$port_pq" '.inbounds[] | select(.port == $p)' "$CONFIG_FILE" >/dev/null 2>&1; do
    ((port_pq++))
  done

  local uuid_legacy short_id_legacy
  uuid_legacy=$(uuidgen)
  short_id_legacy=$(openssl rand -hex 4)

  # Создать PQ inbound (XHTTP+decryption) на port_pq
  # Создать legacy inbound (TCP+Vision) на port (старый порт)
  # ... (add_inbound calls)

  # Обновить profile JSON до schema v2
  safe_jq_write \
    --argjson schema_v 2 \
    --arg uuid_pq "$uuid_pq" \
    --arg uuid_legacy "$uuid_legacy" \
    --argjson port_pq "$port_pq" \
    --argjson port_legacy "$port" \
    '.schema_version = $schema_v
     | .uuid_pq = $uuid_pq
     | .uuid_legacy = $uuid_legacy
     | .port = $port_pq
     | .port_legacy = $port_legacy
     | .pq_enabled = true' \
    "$profile_file"

  safe_restart_xray
  open_firewall_port "$port_pq"
}
```

### 7. First-run banner (REQ-A10)

```bash
show_pq_banner() {
  [[ -f "/usr/local/etc/xray/.pq_banner_shown" ]] && return
  show_ascii
  echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${MAGENTA}║           POST-QUANTUM VPN: МАТРИЦА СОВМЕСТИМОСТИ           ║${NC}"
  echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}Новые профили теперь используют ML-KEM-768 post-quantum шифрование${NC}"
  echo -e "${CYAN}(mlkem768x25519plus.native поверх XHTTP+Reality)${NC}"
  echo ""
  echo -e "${BLUE}Поддержка клиентами (на 2026-05-10):${NC}"
  echo ""
  echo -e " ${GREEN}✓${NC} HAPP 2.10+          — полная поддержка (Xray 26.3.27)"
  echo -e " ${GREEN}✓${NC} v2rayN 6.x+         — добавлено в PR #7782 (август 2025)"
  echo -e " ${GREEN}✓${NC} v2rayNG 1.10+        — поддерживается"
  echo -e " ${GREEN}✓${NC} Shadowrocket (iOS)  — добавлено в последних версиях"
  echo -e " ${YELLOW}?${NC} Streisand (iOS)     — статус неизвестен, тест рекомендован"
  echo -e " ${RED}✗${NC} sing-box            — не поддерживает (issue #3599)"
  echo -e " ${RED}✗${NC} NekoBox/NekoRay     — не поддерживает (использует sing-box)"
  echo -e " ${RED}✗${NC} mihomo/Clash Meta   — не поддерживает (issue #2441)"
  echo -e " ${RED}✗${NC} Hiddify             — не поддерживает (issue #2046, открыт 2026-03)"
  echo ""
  echo -e "${YELLOW}Для каждого профиля создаётся Legacy Fallback (TCP+Vision)${NC}"
  echo -e "${YELLOW}— он работает со ВСЕМИ клиентами без PQ-поддержки.${NC}"
  echo ""
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"
  read
  touch "/usr/local/etc/xray/.pq_banner_shown"
  chown xray:xray "/usr/local/etc/xray/.pq_banner_shown" 2>/dev/null || true
}
```

### 8. xorpub hidden opt-in (скрытое меню)

```bash
# В create_profile_menu() — при вводе "xorpub" как выбора транспорта
# (обычный юзер никогда не наберёт это, т.к. в меню нет такого пункта)
case $route_choice in
  1) create_profile_pq "$profile_name" "xhttp" "native" ;;
  # ...
  xorpub)
    echo -e "${MAGENTA}[ADVANCED] xorpub mode активирован${NC}"
    echo -e "${YELLOW}⚠ xorpub = security theater в контексте Reality. Только для тестирования.${NC}"
    create_profile_pq "$profile_name" "xhttp" "xorpub"
    ;;
esac
```

---

## Per-Plan Guidance

### Plan 6.1 — PQ Key Infrastructure (REQ-A01, A02, A03)

**Entry points:**
1. `install.sh` — после строки 483 (после x25519 keygen) добавить вызов `generate_vless_keys_install`
2. `xrayebator` — строки 23-24 добавить константы `VLESS_DECRYPTION_FILE` и `VLESS_ENCRYPTION_FILE`
3. Новая migration-функция `_migrate_mlkem_keys` + вызов `run_migration "mlkem_keys_generated" "..." "_migrate_mlkem_keys"` в `main_menu()` (рядом с другими миграциями)

**Constraints:**
- `xray vlessenc -mode native` — ключевой флаг (не дефолтный random)
- chmod 600 на оба файла, chown xray:xray
- migration НЕ мутирует config.json → return 1 (no-op/mark), не 0

**Verification:**
```bash
# После plan 6.1:
cat /usr/local/etc/xray/.vless_decryption | grep -c 'mlkem768x25519plus'  # → 1
cat /usr/local/etc/xray/.vless_encryption  | grep -c 'mlkem768x25519plus'  # → 1
stat -c '%a' /usr/local/etc/xray/.vless_decryption  # → 600
stat -c '%U' /usr/local/etc/xray/.vless_decryption  # → xray
```

### Plan 6.2 — PQ Profile Creation + Parallel Legacy (REQ-A04–A08)

**Entry points:**
1. `add_inbound()` — добавить кейс для XHTTP+PQ (с `decryption` полем)
2. `create_profile()` — новая ветка для PQ-профиля (schema v2, два UUID, два порта)
3. `create_profile_menu()` — пересмотр опций: XHTTP+PQ как дефолт (#1), legacy TCP+Vision как #4
4. `generate_connection()` — добавить ветку для schema_version=2 (два URL)
5. Migration `_migrate_xhttp_default_2026` + `run_migration "xhttp_default_2026" "..." "_migrate_xhttp_default_2026"` — меняет ТОЛЬКО дефолты меню (не инбаунды)

**Key decisions:**
- PQ и Legacy — разные порты (port_pq vs port_pq+1)
- PQ inbound tag: `inbound-$port_pq` (стандартное именование)
- Legacy inbound tag: `inbound-$port_legacy`
- При удалении профиля: удалять ОБА инбаунда (по uuid_pq и uuid_legacy из profile v2)

**XHTTP+PQ node в delete_profile_menu:**
```bash
# Для schema_version == 2 профилей:
local port_legacy uuid_legacy
port_legacy=$(jq -r '.port_legacy // ""' "$profile_file")
uuid_legacy=$(jq -r '.uuid_legacy // ""' "$profile_file")

if [[ -n "$port_legacy" ]] && [[ -n "$uuid_legacy" ]]; then
  # Удалить legacy inbound (если нет других клиентов)
  local legacy_clients
  legacy_clients=$(jq -r --argjson p "$port_legacy" \
    '.inbounds[] | select(.port == $p) | .settings.clients | length' \
    "$CONFIG_FILE" 2>/dev/null)
  if [[ "$legacy_clients" -le 1 ]]; then
    safe_jq_write --argjson p "$port_legacy" 'del(.inbounds[] | select(.port == $p))' "$CONFIG_FILE"
    close_firewall_port "$port_legacy"
  fi
fi
```

**Verification (REQ-A04):**
```bash
# Проверить что XHTTP инбаунд имеет decryption != "none"
jq -r '.inbounds[] | select(.streamSettings.network == "xhttp") | .settings.decryption' \
  /usr/local/etc/xray/config.json | grep -v '"none"' | grep -c 'mlkem768x25519plus'
```

**Verification (REQ-A07):**
```bash
# Два инбаунда созданы с разными портами
jq '.inbounds | length' /usr/local/etc/xray/config.json  # было N, стало N+2
```

### Plan 6.3 — Per-Profile Upgrade Button + First-Run Banner (REQ-A09, A10)

**Entry points:**
1. `profile_menu()` / `manage_profile_menu()` — добавить пункт "Upgrade to post-quantum"
2. `main_menu()` — добавить вызов `show_pq_banner` в начале (после всех миграций)

**Constraints:**
- Banner показывается ОДИН раз, маркер `.pq_banner_shown` ставится после показа
- Upgrade НЕ удаляет старый legacy инбаунд — добавляет PQ параллельно
- Upgrade предупреждает об отключении клиентов (safe_restart_xray reconnects all)

**Migration REQ-A08 (_migrate_xhttp_default_2026):**
```bash
_migrate_xhttp_default_2026() {
  # Эта миграция НЕ трогает существующие инбаунды
  # Только обновляет DEFAULTS для create_profile_menu
  # Реализация: записать DEFAULT_TRANSPORT="xhttp-pq" в .xhttp_default_env
  # или просто touch маркер — логика дефолтов в create_profile_menu уже будет переписана кодом
  # Поэтому это no-op миграция (просто маркер)
  return 1  # no-op, mark done
}
```

---

## Verification Checks

```bash
# REQ-A01: ключевые файлы созданы install.sh
[[ -f /usr/local/etc/xray/.vless_decryption ]] && echo "OK: decryption file exists"
[[ -f /usr/local/etc/xray/.vless_encryption  ]] && echo "OK: encryption file exists"
cat /usr/local/etc/xray/.vless_decryption | grep -q 'mlkem768x25519plus' && echo "OK: decryption format"
stat -c '%a' /usr/local/etc/xray/.vless_decryption | grep -q '^600$' && echo "OK: chmod 600"

# REQ-A02: migration marker существует после xrayebator запуска
[[ -f /usr/local/etc/xray/.mlkem_keys_generated ]] && echo "OK: migration marker"

# REQ-A03: константы в xrayebator
grep -q 'VLESS_DECRYPTION_FILE' /usr/local/bin/xrayebator && echo "OK: constant declared"

# REQ-A04: XHTTP инбаунды используют PQ decryption
jq -e '.inbounds[] | select(.streamSettings.network == "xhttp") | select(.settings.decryption | startswith("mlkem768x25519plus"))' \
  /usr/local/etc/xray/config.json && echo "OK: PQ decryption in XHTTP inbound"

# REQ-A05: encryption в VLESS URL для PQ-профилей
# (тест вручную: generate_connection для PQ-профиля, убедиться что URL содержит encryption=mlkem...)

# REQ-A07: два инбаунда на разных портах для PQ-профиля
# После создания профиля:
PROFILE_PORT=$(jq -r '.port' /usr/local/etc/xray/profiles/TESTPROFILE.json)
LEGACY_PORT=$(jq -r '.port_legacy' /usr/local/etc/xray/profiles/TESTPROFILE.json)
[[ "$PROFILE_PORT" != "$LEGACY_PORT" ]] && echo "OK: different ports"
jq -e --argjson p "$PROFILE_PORT" '.inbounds[] | select(.port == $p)' /usr/local/etc/xray/config.json && echo "OK: PQ inbound exists"
jq -e --argjson p "$LEGACY_PORT" '.inbounds[] | select(.port == $p)' /usr/local/etc/xray/config.json && echo "OK: Legacy inbound exists"

# REQ-A09: кнопка upgrade в profile menu — ручной тест
# REQ-A10: banner отображается + marker создается — ручной тест

# Синтаксис:
bash -n /usr/local/bin/xrayebator && echo "OK: bash -n passes"

# Config валидность после миграций:
xray run -test -config /usr/local/etc/xray/config.json && echo "OK: config valid"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `decryption: "none"` в XHTTP | `decryption: "mlkem768x25519plus.native.600s.<keys>"` | Xray 25.3 (2025-03) | PQ шифрование поверх XHTTP |
| Один инбаунд, один UUID | Два инбаунда, два UUID (PQ + legacy) | Phase 6 (2026-05) | Backward compat без downgrade |
| Profile JSON schema v1 (uuid, transport, port) | Schema v2 (uuid_pq, uuid_legacy, port, port_legacy) | Phase 6 (2026-05) | Хранит оба профиля |
| `encryption=none` в VLESS URL | `encryption=<url-encoded mlkem string>` | Xray 25.3 | Клиент использует PQ |

**Deprecated/outdated:**
- `xray mlkem768` (ручная генерация ML-KEM ключей): заменён на `xray vlessenc` который делает всё автоматически
- `decryption: "none"` для XHTTP-инбаундов с PQ: заменён на mlkem-строку
- `random` mode: не рекомендован (конфликтует с Vision-padding)

---

## Open Questions / Checkpoints

1. **Точный stdout формат `xray vlessenc`**
   - Что знаем: команда существует ≥25.3, генерирует decryption/encryption строки
   - Что неясно: точные метки строк ("decryption:" vs "Decryption:" vs JSON-ключи)
   - Рекомендация: **Checkpoint в плане 6.1** — исполнитель должен запустить `xray vlessenc 2>&1` на тестовом сервере с Xray 25.3+ и записать точный вывод перед реализацией парсера. Текущий парсер (три уровня) покрывает наиболее вероятные варианты.

2. **`encryption=` в VLESS URL: URL-encoding обязателен?**
   - Что знаем: строка содержит `.` — точки в query-string values безопасны без encoding, но `-` и `_` тоже безопасны. Base64 символы `+` и `=` требуют encoding.
   - Рекомендация: использовать `@uri` jq filter для полного URL-encoding — перебезопасно, но гарантированно корректно.

3. **Хранение encryption строки: глобально для всех профилей или per-profile?**
   - Текущее решение: один глобальный файл `.vless_encryption` (аналогично x25519 ключам)
   - Риск: ротация ключей затронет все профили одновременно. Приемлемо для single-operator.
   - Рекомендация: один глобальный файл для Phase 6, per-profile ротация — defer to v2.1.

4. **Streisand iOS поддержка VLESS encryption**
   - Что знаем: App Store page не упоминает PQ encryption, только "VLESS(Reality)"
   - Рекомендация: В banner пометить как `?` (неизвестно), до получения подтверждения от тестирования.

---

## Sources

### Primary (HIGH confidence)
- Xray-core Discussion #5372 — конфиг vlessenc+vision+xhttp: `decryption` в `settings.decryption` (инбаунд-уровень)
- Xray-core Discussion #5716 — XHTTP+Reality+decryption конфиг (подтверждает placement)
- Xray-core PR #5078 — `vlessenc` command options: `-key x25519/mlkem`, `-mode native/xorpub/random`, дефолт `x25519/random`; human-readable output
- Xray-core Issue #5586 — vlessenc в списке команд без JSON-флага; Feature Request для `--json` подтверждает что текущий вывод НЕ JSON
- Xray-core Issue #2441 (mihomo) — показывает реальный encryption string: `mlkem768x25519plus.native.0rtt.100-111-1111.75-0-111.50-0-3333.<base64keys>`
- Xray-core Issue #2108 — два Reality инбаунда на одном порту не работают
- henrywithu.com (2025-09) — единственный верифицированный паттерн TCP+XHTTP на 443: через nginx stream
- Discussion #4826 — XHTTP за TCP+Vision fallback работает нестабильно
- xraycore.org/misc/vless-encryption — decryption format для key rotation: `mlkem768x25519plus.native.600s..old.new`
- Shadowrocket App Store changelog — подтверждает "Add support for VLESS Post-Quantum encryption"
- sing-box issue #3599 — не поддерживает mlkem768x25519plus (открыт 2025-12)
- Hiddify issue #2046 — не поддерживает VLESS encryption (открыт 2026-03-09)
- v2rayN PR/commit 310d266 — "Add VLESS encryption support (#7782)" (2025-08)
- install.sh строки 421-483 — паттерн парсинга `xray x25519` (Layer 1: field-name, Layer 2: base64 shape, Layer 3: validate)

### Secondary (MEDIUM confidence)
- xraycore.org FAQ page — decryption/encryption string format `mlkem768x25519plus.{mode}.{rtt}.{padding}.{keys}...`
- Telegram Project X Channel — decryption/encryption TTL semantics: 600s = сервер держит сессию 600 секунд (0-RTT на клиенте)
- xtls.github.io инбаунд VLESS docs — подтверждает decryption field placement

### Tertiary (LOW confidence)
- NekoBox/NekoRay VLESS encryption — предположительно не поддерживает (использует sing-box backend), не верифицировано напрямую
- Streisand VLESS PQ encryption status — App Store page не упоминает, статус неизвестен

---

## Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| `decryption` field placement (settings, not clients) | HIGH | Верифицировано Discussion #5372, #5716 |
| mlkem768x25519plus string format | HIGH | Реальный пример из mihomo issue #2441 |
| Нельзя иметь два инбаунда на одном порту | HIGH | Issue #2108, Discussion #2631, henrywithu guide |
| `xray vlessenc -mode native` генерирует "native" mode | HIGH | PR #5078 (-mode флаг) |
| vlessenc stdout имеет label-строки (не JSON) | MEDIUM | Косвенно из Issue #5586; паттерн аналогичен x25519 |
| `encryption=` в VLESS URL format | MEDIUM | Прецедент из существующих URLs; требует URL-encoding |
| Shadowrocket поддерживает PQ | MEDIUM | App Store changelog подтверждает, но версия не указана |
| Hiddify НЕ поддерживает PQ | HIGH | Issue #2046 открыт 2026-03-09 |
| sing-box НЕ поддерживает PQ | HIGH | Issue #3599 декабрь 2025 |
| v2rayN поддерживает PQ | MEDIUM | PR #7782 (август 2025), требует проверки версии |

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days) — клиентская матрица меняется быстро; Shadowrocket/Hiddify статус пересматривать ежемесячно
