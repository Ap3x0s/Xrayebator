---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 02
type: execute
wave: 2
depends_on:
  - "06-01"
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-A04
  - REQ-A05
  - REQ-A06
  - REQ-A08

must_haves:
  truths:
    - "При создании XHTTP-профиля inbound в config.json имеет settings.decryption = содержимое $VLESS_DECRYPTION_FILE (строка mlkem768x25519plus.native...) — НЕ \"none\""
    - "vless:// URL для XHTTP+pq профилей содержит query-param encryption=<URL-encoded mlkem string>"
    - "В create_profile_menu() пункт #1 — XHTTP+Reality+VLESS Encryption native (PQ), пункт TCP+Vision сохранён как опциональный legacy выбор (REQ-A06)"
    - "Profile JSON для XHTTP+pq имеет schema_version: 2 и pq_enabled: true"
    - "Существующие inbound'ы в config.json НЕ модифицируются миграцией .xhttp_default_2026 — она затрагивает ТОЛЬКО default-template create_profile_menu (REQ-A08 strict)"
    - "Не-XHTTP transport'ы (tcp, tcp-mux, grpc, tcp-utls, tcp-xudp) продолжают работать с decryption: \"none\" — PQ не навязывается"
    - "bash -n xrayebator проходит, xray run -test -config config.json после создания PQ-профиля возвращает 'Configuration OK.'"
  artifacts:
    - path: "xrayebator"
      provides: "add_inbound() XHTTP-кейс с decryption из файла + generate_connection() XHTTP-кейс с encryption query-param + create_profile_menu() переупорядочен (XHTTP+pq #1) + create_profile() пишет schema_version:2/pq_enabled:true для xhttp + миграция .xhttp_default_2026 (no-op marker)"
      contains: "decryption.*VLESS_DECRYPTION"
    - path: "/usr/local/etc/xray/config.json (после создания PQ-профиля)"
      provides: "XHTTP inbound с decryption mlkem768x25519plus.<rest>"
      contains: "mlkem768x25519plus"
    - path: "/usr/local/etc/xray/profiles/<NAME>.json (PQ профиль)"
      provides: "schema_version:2, pq_enabled:true"
      contains: "pq_enabled"
  key_links:
    - from: "add_inbound() XHTTP branch"
      to: "$VLESS_DECRYPTION_FILE"
      via: "VLESS_DECRYPTION=$(cat $VLESS_DECRYPTION_FILE) → heredoc подстановка в settings.decryption"
      pattern: "VLESS_DECRYPTION=\\$\\(cat \"\\$VLESS_DECRYPTION_FILE\"\\)"
    - from: "generate_connection() XHTTP branch"
      to: "$VLESS_ENCRYPTION_FILE"
      via: "raw=$(cat ...) → encoded=$(jq -nr --arg enc \"$raw\" '$enc|@uri') → vless URL ?encryption=${encoded}"
      pattern: "@uri"
    - from: "create_profile_menu()"
      to: "create_profile() с transport=\"xhttp\""
      via: "case 1) → xhttp как PQ-default"
      pattern: "1\\) create_profile.*xhttp"
    - from: "main_menu() migrations block"
      to: "_migrate_xhttp_default_2026 (no-op return 1)"
      via: "run_migration \"xhttp_default_2026\" ..."
      pattern: "run_migration \"xhttp_default_2026\""
---

<objective>
Перевести XHTTP-инбаунды на post-quantum encryption: `add_inbound` для xhttp вписывает `decryption` из файла в `inbound.settings`, `generate_connection` добавляет `encryption=` query-param в vless:// URL, `create_profile_menu` ставит XHTTP+PQ на первое место с обновлённым описанием. Profile JSON для PQ-профилей получает `schema_version: 2` + `pq_enabled: true` — для будущего различения PQ/legacy в Plan 6.3 (upgrade button).

Миграция `.xhttp_default_2026` СТРОГО no-op для config.json: она лишь маркирует, что новый дефолт меню применён (поскольку дефолт зашит в код create_profile_menu, миграция выполняет роль анти-баннера "не показывать первый раз"). Существующие inbound'ы НЕ трогаем (REQ-A08 — explicit).

Purpose: Свежесозданные XHTTP-профили автоматически защищены ML-KEM-768 поверх Reality. Юзер видит PQ как рекомендуемый вариант. Существующие профили остаются нетронутыми (даунгрейд апгрейда — Plan 6.3).
Output:
- Изменённый xrayebator: add_inbound XHTTP-блок, generate_connection XHTTP-блок, create_profile_menu меню/case, create_profile добавляет schema_version+pq_enabled для xhttp, _migrate_xhttp_default_2026 no-op
- При создании XHTTP-профиля: inbound с PQ decryption + vless URL с PQ encryption + profile JSON v2
- Существующие inbound'ы в config.json — НЕ изменены
</objective>

<execution_context>
@/home/kosya/.claude/get-shit-done/workflows/execute-plan.md
@/home/kosya/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-RESEARCH.md
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-01-pq-key-infrastructure-PLAN.md

# Codebase anchors
@CLAUDE.md
@xrayebator
</context>

<tasks>

<task type="auto">
  <name>Task 1: add_inbound() — XHTTP кейс пишет decryption из VLESS_DECRYPTION_FILE</name>
  <files>xrayebator</files>
  <action>
В функции `add_inbound()` (текущие строки 1609-1870) есть `case $transport in ... xhttp) ... esac` с heredoc XHTTPEOF (строки 1815-1859). Этот блок имеет hard-coded `"decryption": "none"`. Заменить на чтение из файла.

**ВАЖНО — два места правки в add_inbound():**

**Место 1: НАЧАЛО функции** (после блока `local short_id=$(openssl rand -hex 4)` строка 1617, ДО проверки `existing_tag` строка 1619). Добавить:

```bash
  # Phase 6 REQ-A04: для XHTTP-инбаундов читаем PQ decryption из файла.
  # Файл создан Plan 6.1 (install.sh при свежей установке ИЛИ миграция .mlkem_keys_generated).
  # Если файл отсутствует — это runtime-ошибка: миграция должна была сработать.
  local vless_decryption=""
  if [[ "$transport" == "xhttp" ]]; then
    if [[ ! -f "$VLESS_DECRYPTION_FILE" ]]; then
      echo -e "${RED}✗ PQ ключи отсутствуют: $VLESS_DECRYPTION_FILE${NC}"
      echo -e "${YELLOW}  Перезапустите xrayebator — миграция .mlkem_keys_generated должна сгенерировать ключи${NC}"
      echo -e "${YELLOW}  Если миграция падает — проверьте: sudo /usr/local/bin/xray version (нужен ≥ 25.3)${NC}"
      return 1
    fi
    vless_decryption=$(cat "$VLESS_DECRYPTION_FILE")
    if [[ ! "$vless_decryption" =~ ^mlkem768x25519plus\. ]]; then
      echo -e "${RED}✗ $VLESS_DECRYPTION_FILE содержит невалидную PQ строку${NC}"
      echo -e "${YELLOW}  Удалите файл и перезапустите xrayebator для регенерации${NC}"
      return 1
    fi
  fi
```

**Место 2: внутри case xhttp)** — заменить heredoc XHTTPEOF (текущие строки 1815-1859). Поменять `"decryption": "none"` на `"decryption": "$vless_decryption"`. ВЕСЬ остальной XHTTP heredoc — БЕЗ изменений (xmux block, realitySettings, sniffing, tag — всё остаётся как было после Phase 5).

Конкретно: строка `"decryption": "none"` (текущая 1823) → `"decryption": "$vless_decryption"`.

Heredoc подставляет `$vless_decryption` корректно (двойные кавычки в heredoc XHTTPEOF делают bash-интерполяцию). Strings типа `mlkem768x25519plus.native.0rtt.100-111-1111....` не содержат `$`, `\`, `` ` `` — безопасны для heredoc. JSON-валидность гарантирует safe_jq_write на строке 1863.

**ВАЖНО — также синхронизация СУЩЕСТВУЮЩИХ inbound'ов на том же порту:**

В блоке "Add client to existing inbound" (строки 1693-1722) — когда добавляется клиент в УЖЕ существующий xhttp-инбаунд — НЕ требуется менять decryption поля (оно остаётся таким, как было). Если существующий инбаунд имеет `decryption: "none"` — новый клиент будет отвергнут Xray (см. RESEARCH pattern 2: "когда decryption != none — все клиенты должны использовать шифрование, и наоборот"). Это OK для Phase 6.2: REQ-A08 явно говорит "не трогать существующие inbound'ы". Если оператор хочет добавить PQ-клиента на старый non-PQ XHTTP-порт — путь только через Plan 6.3 upgrade button. Документировать это поведение в комментарии к add_inbound:

В блоке `if [[ -n "$existing_tag" ]]; then` (строка 1620), сразу после строки `echo -e "${CYAN} → Добавление клиента в существующий inbound на порту $port${NC}"` (строка 1705), добавить:

```bash
    # Phase 6 note: decryption инбаунда НЕ меняется здесь.
    # Если existing inbound имеет decryption: "none", а транспорт xhttp — новый клиент
    # технически добавится в clients[], но его vless:// URL без encryption= НЕ будет работать.
    # Plan 6.3 даёт кнопку "Upgrade to post-quantum" для переключения профиля на PQ.
    # REQ-A08: миграции НЕ трогают существующие inbound'ы автоматически.
```

ПОЧЕМУ НЕ дёргать `update_all_profiles_on_port` для PQ: эта функция (строка 440) синхронизирует profile JSONs между собой по SNI/fingerprint/etc, но не модифицирует inbound в config.json. Decryption — поле инбаунда, не профиля. Не наша забота здесь.
  </action>
  <verify>
```bash
# 1. Syntax
bash -n xrayebator && echo "OK syntax"

# 2. XHTTP heredoc больше НЕ имеет hard-coded decryption: "none"
awk '/case \$transport in/,/esac/' xrayebator | grep -A 30 'xhttp)' | grep -q '"decryption": "none"' && echo "FAIL: xhttp heredoc still has decryption: none" || echo "OK xhttp heredoc cleaned"

# 3. XHTTP heredoc подставляет $vless_decryption
awk '/xhttp)/,/XHTTPEOF$/' xrayebator | grep -q '"decryption": "\$vless_decryption"' && echo "OK xhttp uses vless_decryption variable"

# 4. Pre-check ключей в начале функции
grep -A 30 '^add_inbound() {' xrayebator | grep -q 'VLESS_DECRYPTION_FILE' && echo "OK pre-check inserted"
grep -A 30 '^add_inbound() {' xrayebator | grep -q 'mlkem768x25519plus' && echo "OK shape validation inserted"

# 5. Не-xhttp кейсы НЕ затронуты
awk '/case \$transport in/,/esac/' xrayebator | grep -A 30 'tcp-mux)' | grep -q '"decryption": "none"' && echo "OK tcp-mux preserved decryption: none"
awk '/case \$transport in/,/esac/' xrayebator | grep -A 30 'grpc)' | grep -q '"decryption": "none"' && echo "OK grpc preserved decryption: none"
awk '/case \$transport in/,/esac/' xrayebator | grep -A 30 '^    tcp\|tcp\\\\|tcp-utls\\\\|tcp-xudp)' | grep -q '"decryption": "none"' && echo "OK tcp/utls/xudp preserved decryption: none"
```
  </verify>
  <done>
- bash -n проходит
- В add_inbound() для transport=xhttp inbound JSON содержит `"decryption": "$vless_decryption"` где $vless_decryption — строка из файла VLESS_DECRYPTION_FILE
- Pre-check файла VLESS_DECRYPTION_FILE: если файл отсутствует ИЛИ строка не начинается с `mlkem768x25519plus.` — вернуть 1 с понятным error message
- Для tcp, tcp-mux, tcp-utls, tcp-xudp, grpc — `decryption: "none"` СОХРАНЁН (PQ только для xhttp)
- При добавлении нового клиента в УЖЕ существующий xhttp-инбаунд — decryption инбаунда НЕ перезаписывается (это REQ-A08 boundary)
- Тестовое создание PQ-профиля → `xray run -test -config /usr/local/etc/xray/config.json` → "Configuration OK."
  </done>
</task>

<task type="auto">
  <name>Task 2: generate_connection() — XHTTP кейс добавляет encryption= query-param + create_profile пишет schema_version:2/pq_enabled:true для xhttp</name>
  <files>xrayebator</files>
  <action>
**Часть А: generate_connection() — XHTTP-ветка с encryption query-param**

В `generate_connection()` (строки 1996-2090) внутри `case $transport in ... xhttp) ... esac` (строка 2038-2041) текущая реализация:

```bash
    xhttp)
      vless_link="vless://${uuid}@${SERVER_IP}:${port}?encryption=none&security=reality&sni=${current_sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id}&type=xhttp&path=${encoded_xhttp_path}&host=${current_sni}#${profile_name}"
      ;;
```

Заменить на блок, который проверяет `pq_enabled` в profile JSON. Если `pq_enabled == true` (новый PQ-профиль) — собрать URL с PQ encryption param. Если нет (legacy XHTTP-профиль до Phase 6) — старая логика с `encryption=none`.

```bash
    xhttp)
      # Phase 6 REQ-A05: проверяем флаг pq_enabled из profile JSON.
      # PQ-профили (созданные Plan 6.2 или upgraded Plan 6.3) имеют schema_version: 2 + pq_enabled: true.
      local pq_enabled
      pq_enabled=$(jq -r '.pq_enabled // false' "$profile_file" 2>/dev/null)

      if [[ "$pq_enabled" == "true" ]]; then
        # PQ-режим: encryption= берём из $VLESS_ENCRYPTION_FILE и URL-encode через jq @uri.
        # @uri корректно обработает точки/base64-символы (research §5 «Don't Hand-Roll»).
        if [[ ! -f "$VLESS_ENCRYPTION_FILE" ]]; then
          echo -e "${RED}✗ $VLESS_ENCRYPTION_FILE отсутствует — vless:// невозможен для PQ-профиля${NC}"
          echo -e "${YELLOW}  Перезапустите xrayebator (миграция .mlkem_keys_generated)${NC}"
          return 1
        fi
        local raw_encryption encoded_encryption
        raw_encryption=$(cat "$VLESS_ENCRYPTION_FILE")
        encoded_encryption=$(jq -nr --arg enc "$raw_encryption" '$enc|@uri')
        vless_link="vless://${uuid}@${SERVER_IP}:${port}?encryption=${encoded_encryption}&security=reality&sni=${current_sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id}&type=xhttp&path=${encoded_xhttp_path}&host=${current_sni}#${profile_name}"
      else
        # Legacy XHTTP без PQ (профили до Phase 6 — миграция .xhttp_default_2026 их НЕ трогает per REQ-A08).
        vless_link="vless://${uuid}@${SERVER_IP}:${port}?encryption=none&security=reality&sni=${current_sni}&fp=${fingerprint}&pbk=${clean_public_key}&sid=${short_id}&type=xhttp&path=${encoded_xhttp_path}&host=${current_sni}#${profile_name}"
      fi
      ;;
```

Также обновить нижний блок «Параметры для ручной настройки» (строки 2078-2086 для xhttp) — добавить отображение PQ-режима, если pq_enabled:

После строки `echo -e "${CYAN}Host:${NC} $current_sni"` (~строка 2080), вставить:

```bash
    if [[ "$pq_enabled" == "true" ]]; then
      echo -e "${CYAN}Encryption:${NC} ${MAGENTA}mlkem768x25519plus.native (Post-Quantum)${NC}"
      echo -e "${YELLOW}ℹ Клиенты должны поддерживать VLESS PQ encryption:${NC}"
      echo -e "  ${GREEN}✓${NC} HAPP 2.10+, v2rayNG 1.10+, v2rayN PR#7782+, Shadowrocket (новые версии)"
      echo -e "  ${RED}✗${NC} sing-box, NekoBox, Hiddify, mihomo (создайте отдельный legacy TCP+Vision профиль)"
    fi
```

ПОЧЕМУ менять "Encryption: none" сверху на "Encryption: mlkem...native" не надо: текущая строка 2066 (`echo -e "${CYAN}Encryption:${NC} none"`) — общая для всех transport'ов. Для xhttp+pq она уже устарела. Заменить на conditional:

Найти строку 2066 `echo -e "${CYAN}Encryption:${NC} none"` и заменить на:

```bash
  # Phase 6: Encryption строка зависит от pq_enabled (только для XHTTP)
  if [[ "$transport" == "xhttp" ]] && [[ "${pq_enabled:-false}" == "true" ]]; then
    echo -e "${CYAN}Encryption:${NC} ${MAGENTA}mlkem768x25519plus.native${NC}"
  else
    echo -e "${CYAN}Encryption:${NC} none"
  fi
```

(переменная `pq_enabled` уже определена в xhttp-кейсе case-блока выше; для других транспортов default через `:-false` даст none).

⚠ Implementation note (M4): НЕ поднимать `local pq_enabled` на верх `generate_connection()` — оставить scoped внутри `xhttp)` case-ветки. `${pq_enabled:-false}` корректно даёт `false` для tcp/grpc/tcp-mux/tcp-utls/tcp-xudp веток, где переменная не объявлена. Если в будущем включится `set -u` и появятся ошибки unbound variable — исправлять через `${pq_enabled:-false}` в point-of-use, не через хостинг `local` объявления.

**Часть Б: create_profile() — добавить schema_version:2 + pq_enabled:true для xhttp**

В `create_profile()` (строки 1494-1606) есть jq_args/jq_expr блок (строки 1548-1566), который собирает profile JSON. Для XHTTP сейчас добавляется только `xhttp_path`. Расширить — при `transport == "xhttp"` добавить `schema_version: 2` и `pq_enabled: true`.

Заменить блок (строки 1557-1566):

```bash
  local jq_expr='{name: $name, uuid: $uuid, transport: $transport, port: $port, fingerprint: $fingerprint, sni: $sni'
  if [[ "$transport" == "grpc" ]]; then
    jq_args+=(--arg grpc_service_name "$grpc_service_name")
    jq_expr+=', grpc_service_name: $grpc_service_name'
  elif [[ "$transport" == "xhttp" ]]; then
    jq_args+=(--arg xhttp_path "$xhttp_path")
    jq_expr+=', xhttp_path: $xhttp_path'
    # Phase 6 REQ-A04/A05: новый XHTTP-профиль = PQ.
    # schema_version: 2 + pq_enabled: true — generate_connection и upgrade_button (Plan 6.3) различают это.
    jq_args+=(--argjson schema_v 2 --argjson pq_enabled true)
    jq_expr+=', schema_version: $schema_v, pq_enabled: $pq_enabled'
  fi
  jq_expr+=', created: $created}'
  jq -n "${jq_args[@]}" "$jq_expr" > "$PROFILES_DIR/$name.json"
```

ПОЧЕМУ только для xhttp: research §"⚠ SCOPE UPDATE" явно зафиксировал — schema v2 содержит ТОЛЬКО pq_enabled-флаг (нет uuid_legacy/port_legacy — REQ-A07 dropped). Для tcp/tcp-mux/grpc схема остаётся v1 (поле schema_version отсутствует).

ПОЧЕМУ `--argjson` (не `--arg`): для bool/int — иначе jq экранирует в строку.
  </action>
  <verify>
```bash
# 1. Syntax
bash -n xrayebator && echo "OK syntax"

# 2. xhttp ветка generate_connection имеет PQ branch
grep -A 30 '    xhttp)$' xrayebator | head -30 | grep -q 'pq_enabled' && echo "OK pq_enabled branching in generate_connection"
grep -A 30 '    xhttp)$' xrayebator | head -30 | grep -q '@uri' && echo "OK @uri URL encoding used"
grep -A 30 '    xhttp)$' xrayebator | head -30 | grep -q 'VLESS_ENCRYPTION_FILE' && encoding_var_present=1
echo "VLESS_ENCRYPTION_FILE referenced in xhttp branch: ${encoding_var_present:-NO}"

# 3. Encryption display в нижнем блоке conditional (не hard-coded "none")
grep -B 1 -A 6 '${CYAN}Encryption:${NC} none' xrayebator | head -10
# Должен быть либо conditional с pq_enabled, либо старая строка должна быть в else-ветке conditional

# 4. create_profile добавляет schema_version и pq_enabled для xhttp
grep -A 10 'transport" == "xhttp"' xrayebator | head -15 | grep -q 'schema_version' && echo "OK schema_version added"
grep -A 10 'transport" == "xhttp"' xrayebator | head -15 | grep -q 'pq_enabled' && echo "OK pq_enabled added"
grep -A 15 'transport" == "xhttp"' xrayebator | head -20 | grep -q '\-\-argjson schema_v 2' && echo "OK argjson used (not arg)"

# 5. Manual end-to-end (требует Plan 6.1 done на тест-машине):
# Создать тестовый xhttp профиль через xrayebator (меню 1, выбор xhttp)
# Затем:
# jq '.pq_enabled, .schema_version' /usr/local/etc/xray/profiles/<имя>.json
# → true и 2
# generate_connection даёт vless URL с encryption=mlkem768x25519plus...
```
  </verify>
  <done>
- bash -n проходит
- generate_connection для xhttp ветви имеет ровно ДВА варианта: pq_enabled=true → URL с `encryption=<URL-encoded mlkem>`, иначе → URL с `encryption=none`
- URL-кодирование через `jq -nr --arg enc "$raw" '$enc|@uri'` (research mandate, см. Don't Hand-Roll)
- Нижний информационный блок "Encryption:" conditionally показывает либо "mlkem768x25519plus.native" либо "none"
- create_profile для transport=xhttp добавляет в profile JSON поля `schema_version: 2` (число) + `pq_enabled: true` (bool) через `--argjson`
- Не-xhttp transport'ы НЕ получают эти поля (jq_expr branch only for xhttp)
- Тестовый XHTTP профиль на dev-VPS: profile JSON содержит `pq_enabled: true`, generate_connection выдаёт vless:// с encryption=mlkem768x25519plus...
  </done>
</task>

<task type="auto">
  <name>Task 3: create_profile_menu reorder + миграция .xhttp_default_2026 (no-op)</name>
  <files>xrayebator</files>
  <action>
**Часть А: create_profile_menu() — переупорядочить меню (XHTTP+PQ как #1, обновить описание)**

В `create_profile_menu()` (строки 1415-1491) текущий пункт #1 = "VLESS + XHTTP + Reality (РЕКОМЕНДУЕТСЯ)". Это уже XHTTP, но описание устарело — нужно подчеркнуть post-quantum + добавить компат-предупреждение.

Заменить блок текущих строк 1445-1449 (описание пункта 1):

```bash
  echo -e "${CYAN} 1)${NC} VLESS + XHTTP + Reality + ${MAGENTA}Post-Quantum (mlkem768x25519plus.native)${NC} ${GREEN}— РЕКОМЕНДУЕТСЯ${NC}"
  echo -e "    ${GREEN}✓${NC} ML-KEM-768 защита от harvest-now-decrypt-later атак"
  echo -e "    ${GREEN}✓${NC} Самый ровный вариант под ТСПУ-2026: мобильные сети и домашние ISP"
  echo -e "    ${GREEN}✓${NC} Path и порт генерируются случайно, host берётся из текущего SNI"
  echo -e "    ${YELLOW}⚠${NC} Клиент должен поддерживать VLESS PQ encryption:"
  echo -e "       ${GREEN}✓${NC} HAPP 2.10+, v2rayNG 1.10+, v2rayN PR#7782+, Shadowrocket (последние версии)"
  echo -e "       ${RED}✗${NC} sing-box, NekoBox, Hiddify, mihomo — для них выберите пункт 4 (TCP+Vision legacy)"
```

Все остальные пункты меню (2-6) — БЕЗ изменений. Пункт 4 (VLESS + TCP + Reality + Vision) — это REQ-A06 explicit legacy выбор, остаётся доступным как "fallback для старых клиентов".

В блок case (строки 1481-1490) — case 1 уже вызывает `create_profile "$profile_name" "xhttp" "" "chrome"` и через Task 2 этот create_profile сделает PQ-профиль (т.к. для xhttp добавляется pq_enabled:true). НИЧЕГО не менять в case-вызовах.

ПОЧЕМУ не добавляем «hidden xorpub option»: research §«⚠ SCOPE UPDATE» оставил xorpub как Claude's discretion. Researcher §"Code Examples" #8 предлагал ввод "xorpub" как hidden case. Это можно ДОБАВИТЬ как отдельный case в case-блоке (после `0)` `*)`):

```bash
  case $route_choice in
    1) create_profile "$profile_name" "xhttp" "" "chrome" ;;
    2) create_profile "$profile_name" "tcp-mux" "" "chrome" ;;
    3) create_profile "$profile_name" "grpc" "" "chrome" ;;
    4) create_profile "$profile_name" "tcp" "" "chrome" ;;
    5) create_profile "$profile_name" "tcp-utls" "" "firefox" ;;
    6) create_profile "$profile_name" "tcp-xudp" "" "chrome" "api-maps.yandex.ru" ;;
    xorpub)
      # Hidden advanced opt-in (research §«Code Examples» #8 / D1 second-opinion).
      # xorpub mode = security theater в контексте Reality (codex+kimi подтвердили 2026-05-09).
      # Доступен ТОЛЬКО через ввод буквенного "xorpub" в TUI (обычный юзер не наберёт).
      echo -e "${MAGENTA}[ADVANCED] xorpub режим выбран${NC}"
      echo -e "${YELLOW}⚠ xorpub = security theater для Reality. Только для отладки/тестирования.${NC}"
      echo -e "${YELLOW}  Plan 6.2 не реализует отдельный xorpub-параметр vlessenc — профиль будет создан${NC}"
      echo -e "${YELLOW}  с дефолтным native ключом. xorpub-генерация — backlog (defer to v2.1).${NC}"
      sleep 3
      create_profile "$profile_name" "xhttp" "" "chrome"
      ;;
    0) return ;;
    *) echo -e "${RED}Неверный выбор${NC}"; sleep 2; return ;;
  esac
```

ПОЧЕМУ НЕ внедряем настоящий xorpub: для этого нужен повторный вызов `xray vlessenc -mode xorpub` + per-profile хранение xorpub-ключей. Это масштаб отдельного плана. Hidden case оставлен как future-flag, фактически ведёт на native (с пользовательским warning, что фича частично).

**Часть Б: Миграция _migrate_xhttp_default_2026 (no-op marker)**

Добавить функцию РЯДОМ с _migrate_mlkem_keys (после _migrate_mlkem_keys, до main_menu). Зарегистрировать в main_menu после `mlkem_keys_generated` registration.

```bash
# Phase 6 REQ-A08: маркер «новый дефолт create_profile_menu применён».
# СТРОГО no-op для config.json — REQ-A08 явно запрещает трогать существующие inbound'ы.
# Дефолт create_profile_menu (XHTTP+PQ как #1) зашит в код Task 3А — миграция здесь
# нужна только чтобы не показывать first-run-баннер ещё раз (Plan 6.3 повторно использует
# тот же паттерн pq_banner_shown).
# Возвращает 1 (no-op/mark) — run_migration ставит маркер без safe_restart_xray.
_migrate_xhttp_default_2026() {
  echo -e "${CYAN}Маркируем default-template create_profile_menu как XHTTP+PQ...${NC}"
  echo -e "${GREEN}✓ Default template обновлён в коде (REQ-A08: existing inbounds не тронуты)${NC}"
  return 1
}
```

В main_menu (после строки регистрации `mlkem_keys_generated` из Plan 6.1):

```bash
  run_migration "xhttp_default_2026"                   "XHTTP+PQ как дефолтный пресет создания профиля" _migrate_xhttp_default_2026 || ((migration_failures++))
```

ПОЧЕМУ ПОСЛЕ mlkem_keys_generated: семантическая зависимость — обновить дефолт меню имеет смысл только когда ключи уже могут быть прочитаны.

ПОЧЕМУ это no-op: REQ-A08 strict — миграция НЕ должна добавлять `decryption: mlkem...` в существующие XHTTP-инбаунды. Изменение дефолта применяется к НОВЫМ профилям через create_profile_menu (Task 3А), которое работает только при создании. Миграция — лишь технический marker для отслеживания "Phase 6.2 раскатан".
  </action>
  <verify>
```bash
# 1. Syntax
bash -n xrayebator && echo "OK syntax"

# 2. Меню обновлено: пункт 1 содержит "Post-Quantum"
grep -A 8 'echo -e "${CYAN} 1)' xrayebator | grep -q "Post-Quantum" && echo "OK menu item 1 mentions PQ"
grep -A 8 'echo -e "${CYAN} 1)' xrayebator | grep -q "mlkem768x25519plus" && echo "OK menu item 1 names algorithm"

# 3. Случай xorpub присутствует (hidden flag)
grep -q '    xorpub)$' xrayebator && echo "OK hidden xorpub case present"

# 4. Пункт 4 (legacy TCP+Vision) НЕ удалён
grep -q "VLESS + TCP + Reality + Vision" xrayebator && echo "OK legacy TCP+Vision option kept (REQ-A06)"

# 5. Миграция _migrate_xhttp_default_2026 определена и возвращает 1
grep -q '^_migrate_xhttp_default_2026() {' xrayebator && echo "OK migration fn defined"
grep -A 5 '^_migrate_xhttp_default_2026() {' xrayebator | grep -q '^  return 1$' && echo "OK returns 1 (no-op/mark)"

# 6. Регистрация в main_menu ПОСЛЕ mlkem_keys_generated, ДО aggregate-report
awk '
  /run_migration "mlkem_keys_generated"/{m=NR}
  /run_migration "xhttp_default_2026"/{x=NR}
  /if \[\[ \$migration_failures -gt 0 \]\]/{a=NR; exit}
  END{
    if(m && x && a && m < x && x < a) print "OK registration order: mlkem<xhttp_default<aggregate";
    else print "FAIL order: mlkem="m" xhttp="x" agg="a
  }
' xrayebator

# 7. Миграция НЕ мутирует config.json: проверить что в теле _migrate_xhttp_default_2026 нет safe_jq_write
grep -A 5 '^_migrate_xhttp_default_2026() {' xrayebator | grep -q 'safe_jq_write' && echo "FAIL: должен быть no-op без safe_jq_write" || echo "OK no config mutation"
```
  </verify>
  <done>
- bash -n проходит
- create_profile_menu пункт #1 текстуально промаркирован как Post-Quantum (mlkem768x25519plus) с предупреждением о клиентской совместимости
- Пункт #4 "VLESS + TCP + Reality + Vision" сохранён как явный legacy выбор (REQ-A06)
- Hidden case `xorpub` добавлен (advanced opt-in, ведёт на native с warning)
- Функция _migrate_xhttp_default_2026 определена, возвращает `1`, НЕ мутирует config.json (REQ-A08)
- Миграция зарегистрирована в main_menu в порядке: mlkem_keys_generated → xhttp_default_2026 → aggregate-report
- На v2.0-апгрейде: запуск xrayebator → видно `[migration] XHTTP+PQ как дефолтный пресет... ✓ Nothing to migrate: xhttp_default_2026` (без restart)
- На v2.0+: маркер `/usr/local/etc/xray/.xhttp_default_2026` создан после первого запуска
- jq query на любой существующий config.json: НИ ОДИН inbound НЕ должен получить новое поле decryption после запуска миграции (РОВНО то же содержимое до и после, кроме маркер-файла)
  </done>
</task>

</tasks>

<verification>
**Sanity checks (после всех 3 задач, на тестовой VPS):**

```bash
bash -n xrayebator

# Polluted state: config.json до Plan 6.2 (один XHTTP inbound с decryption: "none")
EXISTING_INBOUNDS_BEFORE=$(jq '.inbounds | length' /usr/local/etc/xray/config.json)
EXISTING_DECR_BEFORE=$(jq -c '.inbounds[] | {port, decryption: .settings.decryption}' /usr/local/etc/xray/config.json)

# Запустить xrayebator → пройти все миграции (mlkem_keys_generated, xhttp_default_2026)
sudo xrayebator
# В главном меню: 0 (выход)

# Проверить REQ-A08: существующие inbound'ы НЕ изменены
EXISTING_INBOUNDS_AFTER=$(jq '.inbounds | length' /usr/local/etc/xray/config.json)
EXISTING_DECR_AFTER=$(jq -c '.inbounds[] | {port, decryption: .settings.decryption}' /usr/local/etc/xray/config.json)
[[ "$EXISTING_INBOUNDS_BEFORE" == "$EXISTING_INBOUNDS_AFTER" ]] && echo "OK inbound count unchanged"
[[ "$EXISTING_DECR_BEFORE" == "$EXISTING_DECR_AFTER" ]] && echo "OK existing decryption fields unchanged"

# Создать ТЕСТОВЫЙ PQ-профиль
sudo xrayebator
# Меню → 1 (Создать профиль) → имя "test_pq" → 1 (XHTTP+PQ) → подтвердить
# → выход

# Проверить REQ-A04: новый XHTTP inbound имеет PQ decryption
NEW_PORT=$(jq -r '.port' /usr/local/etc/xray/profiles/test_pq.json)
jq -e --argjson p "$NEW_PORT" '.inbounds[] | select(.port == $p) | .settings.decryption | startswith("mlkem768x25519plus.native")' /usr/local/etc/xray/config.json && echo "OK REQ-A04 PQ decryption in new inbound"

# Проверить REQ-A05: vless URL содержит encryption=mlkem...
sudo xrayebator
# Меню → 3 (Подключиться по профилю) → выбрать test_pq → визуально проверить URL содержит encryption=mlkem768x25519plus.native
# (URL-encoded точки = %2E ОК, главное чтобы префикс "encryption=mlkem" был)

# Проверить profile JSON v2
jq '.schema_version, .pq_enabled' /usr/local/etc/xray/profiles/test_pq.json
# → 2
# → true

# Проверить, что Xray стартует с новым PQ-инбаундом
sudo xray run -test -config /usr/local/etc/xray/config.json | grep -qx "Configuration OK." && echo "OK config valid"
sudo systemctl is-active --quiet xray && echo "OK xray running"

# Cleanup тестового профиля
sudo xrayebator   # → 2 (Удалить профиль) → test_pq → y
```
</verification>

<success_criteria>
1. **REQ-A04:** add_inbound() для transport="xhttp" вписывает в `inbound.settings.decryption` строку из $VLESS_DECRYPTION_FILE (mlkem768x25519plus.native...). Mode по умолчанию = native (через xrayebator используется ключ, сгенерированный install.sh с `-mode native`). Не-XHTTP transport'ы продолжают использовать `decryption: "none"`.

2. **REQ-A05:** generate_connection() для XHTTP-профилей с `pq_enabled: true` добавляет в vless:// URL параметр `encryption=<URL-encoded mlkem string>` через `jq -nr '$enc|@uri'`. Legacy XHTTP-профили (без pq_enabled) сохраняют `encryption=none`.

3. **REQ-A06:** create_profile_menu() пункт #1 — XHTTP+PQ (с явным предупреждением о клиентской компат-матрице). Пункт #4 — TCP+Vision legacy — сохранён как opt-in для несовместимых клиентов.

4. **REQ-A08 strict:** Миграция `.xhttp_default_2026` НЕ модифицирует существующие inbound'ы в config.json. Тест: jq-снимок `.inbounds[] | {port, decryption}` ДО и ПОСЛЕ запуска миграции — байтовое равенство.

5. **Schema v2:** Profile JSON для новых XHTTP-профилей содержит `schema_version: 2` (число) и `pq_enabled: true` (bool). Plan 6.3 будет использовать pq_enabled для отображения upgrade-кнопки.

6. **bash -n + Configuration OK:** xrayebator проходит синтакс, config.json после создания PQ-профиля проходит `xray run -test`.

7. **Backward compat:** Существующие profile JSON v1 (без `pq_enabled`) читаются `jq -r '.pq_enabled // false'` как `false` → generate_connection выбирает legacy-ветку → URL без PQ. Никаких разрушений старых профилей.
</success_criteria>

<output>
После завершения создать `.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-02-pq-profile-creation-SUMMARY.md`:
- add_inbound XHTTP-кейс: что было vs что стало
- generate_connection XHTTP-кейс: PQ vs legacy ветви
- create_profile_menu: новый пункт #1 + сохранённый legacy #4 + hidden xorpub case
- Миграция _migrate_xhttp_default_2026: no-op (REQ-A08 boundary)
- Backward compat: profile v1 → читаются без проблем (pq_enabled // false)
- Подтверждённое REQ-A08: тестовый jq-снимок до/после миграции — без разницы
- Следующий шаг: Plan 6.3 использует pq_enabled для upgrade-кнопки и first-run banner
</output>
