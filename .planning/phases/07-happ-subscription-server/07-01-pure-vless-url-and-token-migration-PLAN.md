---
phase: 07-happ-subscription-server
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-C04
  - REQ-C10
  - REQ-C11

must_haves:
  truths:
    - "При source-инге xrayebator из другого скрипта (`source /usr/local/bin/xrayebator`) НЕ выполняется проверка root, НЕ загружаются ключи Reality, НЕ запускается main_menu — top-level guard `[[ ${BASH_SOURCE[0]} != ${0} ]] && return 0` (или эквивалентный двухветочный if-блок) гарантирует, что в источенном режиме в shell-окружение попадают только определения функций и константы (CONFIG_FILE, PROFILES_DIR, VLESS_DECRYPTION_FILE, VLESS_ENCRYPTION_FILE, цвета)"
    - "В xrayebator существует pure-функция `_generate_vless_url_pure profile_file` которая принимает путь к profile JSON, читает SERVER_IP/PUBLIC_KEY/short_id/SNI/transport/uuid/port/pq_enabled и возвращает полную vless:// строку через stdout (echo) — БЕЗ цветного вывода, БЕЗ qrencode, БЕЗ read-промптов, БЕЗ записи в файлы, exit-code 0 на успех / ≥1 на ошибку (отсутствует profile, неизвестный transport, отсутствует $VLESS_ENCRYPTION_FILE для PQ-профиля)"
    - "Существующая функция `generate_connection()` (xrayebator:2264) рефакторена: вся логика построения vless:// строки заменена единственным вызовом `vless_link=$(_generate_vless_url_pure \"$profile_file\")`. Все варианты транспорта (tcp/tcp-utls/tcp-xudp, tcp-mux, grpc, xhttp legacy, xhttp+PQ) поддерживаются pure-функцией ИДЕНТИЧНО прежнему `case` (по байтовому сравнению — string match)"
    - "В рефакторенной generate_connection() переменная pq_enabled объявляется ДО любого использования `case \"$transport\"` (структурный инвариант: lookup pq_enabled из jq идёт в самом начале функции, до ветвления по транспорту), чтобы блоки печати manual-параметров и совместимости (xrayebator:2353-2386) видели правильное значение независимо от того, какая ветка case сработала"
    - "Все существующие call sites `generate_connection` (xrayebator:2256 в create_profile success-screen, xrayebator:3355 в connect_profile_menu) продолжают работать — печатают ту же vless:// + qrencode + параметры"
    - "В каждом profile JSON присутствует поле `sub_token` (32 hex-символа из `openssl rand -hex 16`) — для свежесозданных профилей `create_profile()` его генерирует; для существующих v1.x/v2.x профилей миграция `.subscription_tokens_2026` через `run_migration` догенерирует его"
    - "Миграция `.subscription_tokens_2026` использует three-valued return контракт: `0` если хотя бы один profile JSON был изменён (необходим safe_restart_xray для marker — но мы НЕ перезапускаем Xray, поэтому migration возвращает `1`), `1` если все профили уже имели `sub_token` (только marker), `≥2` на ошибку записи. Migration НЕ трогает config.json (только profile JSONs) → возвращает `1`, marker ставится без рестарта"
    - "Bash-syntax: `bash -n xrayebator` проходит чисто; токен-формат: `^[a-f0-9]{32}$` валидируется на каждом сгенерированном токене перед записью в profile JSON"
  artifacts:
    - path: "xrayebator"
      provides: "Source-safety guard в самом верху (после shebang/комментариев, ДО первого top-level эффекта); pure-функция _generate_vless_url_pure(); рефакторенный generate_connection() который её зовёт; create_profile() пишет sub_token в новый profile JSON; функция _migrate_subscription_tokens_2026; регистрация миграции в main_menu()"
      contains: "_generate_vless_url_pure"
      min_lines: 3990
    - path: "/usr/local/etc/xray/profiles/<NAME>.json (после миграции/создания)"
      provides: "Поле sub_token: 32 lowercase-hex-символа"
      contains: "sub_token"
    - path: "/usr/local/etc/xray/.subscription_tokens_2026"
      provides: "Marker файл — миграция отработала; touch только при успехе"
      contains: ""
  key_links:
    - from: "Top of xrayebator (после shebang)"
      to: "rest of script (root check, key loading, main_menu)"
      via: "if [[ \"${BASH_SOURCE[0]}\" != \"${0}\" ]]; then return 0; fi  (или эквивалентный guard перед EUID check на стр.31)"
      pattern: "BASH_SOURCE.*!=.*\\$\\{?0\\}?"
    - from: "generate_connection() (xrayebator:2264)"
      to: "_generate_vless_url_pure()"
      via: "vless_link=$(_generate_vless_url_pure \"$profile_file\")"
      pattern: "_generate_vless_url_pure"
    - from: "create_profile() (xrayebator:1709)"
      to: "profile JSON .sub_token field"
      via: "openssl rand -hex 16 → jq_args/jq_expr добавляют sub_token"
      pattern: "sub_token.*openssl rand -hex 16"
    - from: "main_menu() migrations block (xrayebator:1528-1536)"
      to: "_migrate_subscription_tokens_2026"
      via: "run_migration \"subscription_tokens_2026\" \"...\" _migrate_subscription_tokens_2026"
      pattern: "run_migration.*subscription_tokens_2026"
---

<objective>
Подготовить foundation Phase 7: ввести source-safe guard в xrayebator (без него subhttp.sh не сможет безопасно source-ить скрипт), вытащить логику построения vless:// в pure-функцию (которую subhttp.sh из Plan 7.2 будет дёргать на каждый request), и догенерировать `sub_token` для всех существующих профилей.

Purpose: один профиль = одна subscription URL (REQ-C11 REVISED), а subscription URL = `https://<host>/sub/<sub_token>`. Без `sub_token` в profile JSON Plan 7.2/7.3 ничего отдать не смогут. Без source-safe guard subhttp.sh при попытке `source xrayebator` спровоцирует root-check exit, попытку загрузки ключей, и (если запущен из-под root) — войдёт в интерактивное main_menu. Без pure-функции subhttp.sh пришлось бы дублировать ~80 строк case-логики transport.

Output:
- Top-level guard в xrayebator (≤10 строк) — гарантирует, что source-инг даёт только функции/константы.
- Pure-функция `_generate_vless_url_pure profile_file` — никаких side-effects, чистый stdout.
- Рефакторенный `generate_connection()` — единственный консьюмер pure-функции в interactive flow (consistency check). pq_enabled lookup перенесён до `case "$transport"`.
- `create_profile()` записывает `sub_token` для каждого нового профиля (32-hex).
- Миграция `.subscription_tokens_2026` через `run_migration` — backfill для существующих профилей.
- Все существующие call sites `generate_connection` сохраняют поведение по байтовому сравнению vless:// строки (regression guard).
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
@.planning/phases/07-happ-subscription-server/07-AUDIT-NOTES.md

# Исходники для рефакторинга
@xrayebator
# Phase 6 SUMMARY (важен для понимания pq_enabled / schema_version: 2)
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-02-pq-profile-creation-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Source-safety guard в xrayebator (top-level)</name>
  <files>xrayebator</files>
  <action>
ВСТАВИТЬ guard-блок в xrayebator МЕЖДУ существующим объявлением констант (xrayebator:20-28, последняя — `ASCII_ART="$DATA_DIR/ascii_art.txt"`) и существующей проверкой root (xrayebator:30-35, начинается с `# Проверка прав root` / `if [[ $EUID -ne 0 ]]; then`).

Точная семантика (БЕЗ изменений отступов и кавычек — паттерн `^if \[\[ "\$\{BASH_SOURCE\[0\]\}" != "\$\{0\}" \]\]` будет grep-ваться в verify):
```
# ═══════════════════════════════════════════════════════════
# SOURCE-SAFETY GUARD (Phase 7, REQ-C10)
# ═══════════════════════════════════════════════════════════
# Если xrayebator source-ится из другого скрипта (subhttp.sh для HAPP subscription),
# мы НЕ должны выполнять root-check, загружать ключи Reality или входить в интерактивное
# main_menu — нужны только определения функций и констант.
# Тест: BASH_SOURCE[0] (путь к sourced-файлу) != ${0} (имя процесса) → значит source.
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0 2>/dev/null || exit 0
fi
```

ВАЖНО:
1. Guard ставится ДО `if [[ $EUID -ne 0 ]]` (строка 31) и ДО загрузки ключей (строки 38-50). Все константы пути (CONFIG_FILE, PROFILES_DIR, VLESS_*_FILE, цвета) объявлены ВЫШЕ guard'а — они нужны источащему скрипту.
2. `return 0 2>/dev/null || exit 0` — подстраховка: `return` валиден только если файл source-ится (когда в нашем тесте `BASH_SOURCE != $0` true, мы уже точно в sourced-режиме, но защищаем от edge-кейса с `bash -c`).
3. Не использовать `[[ "${0}" = "bash" ]]` или `[[ "${0##*/}" = "xrayebator" ]]` — оба ломаются на симлинке `/usr/local/bin/xrayebator`. Только сравнение `BASH_SOURCE[0]` vs `$0` устойчиво.
4. `set -e`/`set -u` НЕ добавляем — xrayebator на них не построен и mass-breakage не нужен.
5. Точная форма строки `if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then` ОБЯЗАТЕЛЬНА — verify ищет именно её через `grep -E '^if \[\[ "\$\{BASH_SOURCE\[0\]\}" != "\$\{0\}" \]\]'`.

Самопроверка после правки: `bash -c 'source ./xrayebator; declare -F generate_connection >/dev/null && echo OK'` должен напечатать `OK` БЕЗ запуска main_menu и БЕЗ exit 1 от EUID-check (запуск из-под non-root — но guard сработает раньше). Это test для verify-блока ниже.
  </action>
  <verify>
# (1) Bash syntax clean
bash -n xrayebator && \
# (2) Strict structural grep: guard-строка присутствует в каноничном виде.
# Это исключает ситуацию когда verify проходит только из-за того, что EUID-check тоже возвращает >0 на non-root.
[[ -n "$(grep -E '^if \[\[ "\$\{BASH_SOURCE\[0\]\}" != "\$\{0\}" \]\]' xrayebator | head -1)" ]] && \
# (3) Functional sanity: после source функция _generate_vless_url_pure доступна (значит body файла прошёл целиком, main_menu НЕ выполнилось).
bash -c 'source ./xrayebator >/dev/null 2>&1 && declare -F _generate_vless_url_pure >/dev/null && echo SOURCE_OK' | grep -q SOURCE_OK && \
# (4) Поведенческий тест: source из non-root БЕЗ exit от EUID-check, БЕЗ запуска main_menu, функции экспортированы.
bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F generate_connection >/dev/null && echo "GUARD_OK"' | grep -q GUARD_OK && \
echo "PASS: guard каноничен, функции экспортированы при source, main_menu не запущено"
  </verify>
  <done>
Sourcing xrayebator из другого скрипта НЕ выполняет EUID-check, НЕ загружает ключи, НЕ зовёт main_menu, но даёт доступ ко всем function-определениям и константам. Guard-строка точно соответствует каноничному виду (grep структурно подтверждает её присутствие). `bash -n xrayebator` проходит чисто.
  </done>
</task>

<task type="auto">
  <name>Task 2: Pure-функция _generate_vless_url_pure() + рефакторинг generate_connection()</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — Объявить НОВУЮ функцию `_generate_vless_url_pure()` в xrayebator (рядом с другими helper-ами раздела HELPER FUNCTIONS, например после `read_profile_transport_metadata` или перед `generate_connection`). Сигнатура:

```
# Pure VLESS URL builder (Phase 7, REQ-C10).
# НЕ печатает цветной TUI, НЕ читает stdin, НЕ пишет файлы, НЕ зовёт qrencode.
# stdout: ровно одна vless:// строка (без переноса) на success.
# return: 0 на успех; 1 если profile_file не существует / транспорт неизвестен / PQ-профиль без $VLESS_ENCRYPTION_FILE.
# Args: $1 = absolute path к profile JSON.
_generate_vless_url_pure() {
  local profile_file="$1"
  [[ -f "$profile_file" ]] || return 1

  local profile_name uuid transport port fingerprint sni
  profile_name=$(basename "$profile_file" .json)
  uuid=$(jq -r '.uuid' "$profile_file") || return 1
  transport=$(jq -r '.transport' "$profile_file") || return 1
  port=$(jq -r '.port' "$profile_file") || return 1
  fingerprint=$(jq -r '.fingerprint // "chrome"' "$profile_file")
  sni=$(jq -r '.sni // "www.ozon.ru"' "$profile_file")

  local server_ip clean_public_key
  server_ip=$(get_server_ip)
  clean_public_key=$(cat "$PUBLIC_KEY_FILE" 2>/dev/null) || return 1

  # Transport metadata (grpc service name / xhttp path) и url-encoded path
  local transport_metadata grpc_service_name xhttp_path encoded_xhttp_path
  transport_metadata=$(read_profile_transport_metadata "$profile_file")
  IFS='|' read -r grpc_service_name xhttp_path <<< "$transport_metadata"
  encoded_xhttp_path=$(jq -nr --arg path "$xhttp_path" '$path|@uri')

  # short_id — читаем из config.json по порту (зеркало логики generate_connection xrayebator:2283-2286)
  local short_id
  short_id=$(jq -r --argjson p "$port" \
    '.inbounds[] | select(.port == $p) | .streamSettings.realitySettings.shortIds[0]' \
    "$CONFIG_FILE" 2>/dev/null)
  [[ -z "$short_id" || "$short_id" == "null" ]] && short_id=""

  case "$transport" in
    tcp|tcp-utls|tcp-xudp)
      printf 'vless://%s@%s:%s?encryption=none&flow=xtls-rprx-vision&security=reality&sni=%s&fp=%s&pbk=%s&sid=%s&type=tcp&headerType=none#%s' \
        "$uuid" "$server_ip" "$port" "$sni" "$fingerprint" "$clean_public_key" "$short_id" "$profile_name"
      ;;
    tcp-mux)
      printf 'vless://%s@%s:%s?encryption=none&security=reality&sni=%s&fp=%s&pbk=%s&sid=%s&type=tcp&headerType=none#%s' \
        "$uuid" "$server_ip" "$port" "$sni" "$fingerprint" "$clean_public_key" "$short_id" "$profile_name"
      ;;
    grpc)
      printf 'vless://%s@%s:%s?encryption=none&security=reality&sni=%s&fp=%s&pbk=%s&sid=%s&type=grpc&serviceName=%s#%s' \
        "$uuid" "$server_ip" "$port" "$sni" "$fingerprint" "$clean_public_key" "$short_id" "$grpc_service_name" "$profile_name"
      ;;
    xhttp)
      local pq_enabled
      pq_enabled=$(jq -r '.pq_enabled // false' "$profile_file" 2>/dev/null)
      if [[ "$pq_enabled" == "true" ]]; then
        [[ -f "$VLESS_ENCRYPTION_FILE" ]] || return 1
        local raw_encryption encoded_encryption
        raw_encryption=$(cat "$VLESS_ENCRYPTION_FILE")
        encoded_encryption=$(jq -nr --arg enc "$raw_encryption" '$enc|@uri')
        printf 'vless://%s@%s:%s?encryption=%s&security=reality&sni=%s&fp=%s&pbk=%s&sid=%s&type=xhttp&path=%s&host=%s#%s' \
          "$uuid" "$server_ip" "$port" "$encoded_encryption" "$sni" "$fingerprint" "$clean_public_key" "$short_id" "$encoded_xhttp_path" "$sni" "$profile_name"
      else
        printf 'vless://%s@%s:%s?encryption=none&security=reality&sni=%s&fp=%s&pbk=%s&sid=%s&type=xhttp&path=%s&host=%s#%s' \
          "$uuid" "$server_ip" "$port" "$sni" "$fingerprint" "$clean_public_key" "$short_id" "$encoded_xhttp_path" "$sni" "$profile_name"
      fi
      ;;
    *)
      return 1
      ;;
  esac

  return 0
}
```

КРИТИЧНО — байтовое соответствие старой логике `generate_connection` (xrayebator:2293-2329):
- Порядок query-params, разделитель `&`, ключи `encryption/flow/security/sni/fp/pbk/sid/type/headerType/serviceName/path/host` СОВПАДАЮТ. Любое расхождение порядка ломает регрессию.
- `printf` без `\n` в конце — pure-функция возвращает СТРОКУ (без trailing newline). Если нужен newline, вызывающий пусть `echo` через подстановку.
- Используем `printf`, не `echo -e`, чтобы избежать интерпретации `\` в SNI/path/uuid.

ШАГ 2 — Рефакторинг `generate_connection()` (xrayebator:2264-2389). Из всего блока удаляем case `transport` (строки ~2293-2329) и заменяем на:
```
local vless_link
vless_link=$(_generate_vless_url_pure "$profile_file") || {
  echo -e "${RED}✗ Не удалось построить vless:// URL для профиля $profile_name${NC}"
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"
  read
  return 1
}
```

ШАГ 3 (ОБЯЗАТЕЛЬНО — структурный инвариант для verify-теста M7):
Объявление `pq_enabled` (xrayebator:2308-2310) переносим ВВЕРХ функции — ДО `case "$transport"`/case-замены/блоков печати manual-параметров. Конкретно: сразу после `local profile_file=...` и базового чтения метаданных профиля (uuid/transport/port/etc.) добавить:
```
local pq_enabled
pq_enabled=$(jq -r '.pq_enabled // false' "$profile_file" 2>/dev/null)
```
Это ОБЯЗАТЕЛЬНО потому что:
- блоки печати (xrayebator:2353-2386) используют `pq_enabled` для подсказок про encryption=mlkem;
- если оставить старый порядок (объявление внутри case xhttp), для tcp/grpc/tcp-mux профилей `pq_enabled` будет undefined и блок печати сломается;
- verify-тест ниже структурно проверяет: `awk '/^generate_connection\(\)/,/^}$/' xrayebator | grep -n -E 'pq_enabled=|case "\$transport"'` — номер строки `pq_enabled=` ОБЯЗАН быть МЕНЬШЕ номера строки `case "$transport"`.

Всё, что после построения vless_link (echo, qrencode, параметры для ручной настройки) — оставляем как есть, поскольку оно использует ПЕРЕМЕННЫЕ (`uuid`, `port`, `transport`, `current_sni`, `pq_enabled` etc), которые объявлены выше в `generate_connection()` И НЕ зависят от `_generate_vless_url_pure()`.

САНИТИ-ПРОВЕРКА перед коммитом:
- Создать временный profile JSON с tcp/tcp-utls/tcp-xudp/tcp-mux/grpc/xhttp(legacy)/xhttp(PQ) и сравнить вывод старой и новой логики через `diff <(generate_connection_legacy ...) <(generate_connection_new ...)` ИЛИ через unit-style проверку pure-функции:
  ```
  source ./xrayebator
  url=$(_generate_vless_url_pure /tmp/test_profile.json)
  echo "$url" | grep -q '^vless://[a-f0-9-]\+@.*:443?' && echo OK
  ```
  Минимально проверить хотя бы tcp + xhttp_pq на смоук-кейсе.

ВАЖНО про call sites:
- xrayebator:2256 (`generate_connection "$profile_name"` — внутри `create_profile`) и xrayebator:3355 (`generate_connection "$selected"` — внутри `connect_profile_menu`) НЕ ТРОГАЕМ. Они продолжают работать через рефакторенный `generate_connection`, который теперь делегирует pure-функции.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "^_generate_vless_url_pure()" xrayebator && \
grep -q "vless_link=\$(_generate_vless_url_pure" xrayebator && \
# Структурная проверка: pure-функция действительно объявлена ДО generate_connection
[[ $(grep -n "^_generate_vless_url_pure()" xrayebator | head -1 | cut -d: -f1) -lt $(grep -n "^generate_connection()" xrayebator | head -1 | cut -d: -f1) ]] && \
# M7: pq_enabled lookup ДО case "$transport" внутри generate_connection().
# Извлекаем тело generate_connection через awk, нумеруем строки, ищем линии с pq_enabled= и case "$transport"
# и убеждаемся, что pq_enabled= идёт раньше (меньший номер строки). Если хоть одна из строк не найдена — fail.
PQ_LINE=$(awk '/^generate_connection\(\)/,/^}$/' xrayebator | grep -n -E 'pq_enabled=' | head -1 | cut -d: -f1) && \
CASE_LINE=$(awk '/^generate_connection\(\)/,/^}$/' xrayebator | grep -n -E 'case "\$transport"' | head -1 | cut -d: -f1) && \
[[ -n "$PQ_LINE" ]] && [[ -n "$CASE_LINE" ]] && [[ "$PQ_LINE" -lt "$CASE_LINE" ]] && \
echo "PASS: pure-функция определена и используется; pq_enabled lookup идёт ДО case \"\$transport\""
  </verify>
  <done>
В xrayebator существует `_generate_vless_url_pure()` без side-effects. `generate_connection()` рефакторен так, что построение vless_link идёт через единственный вызов pure-функции. Объявление `pq_enabled` перенесено ВЫШЕ `case "$transport"` внутри generate_connection (структурно подтверждено awk+grep тестом). Все 7 транспортных кейсов (tcp/tcp-utls/tcp-xudp/tcp-mux/grpc/xhttp-legacy/xhttp-PQ) работают идентично прежней логике (по байтовому сравнению query-string). bash -n проходит.
  </done>
</task>

<task type="auto">
  <name>Task 3: sub_token в create_profile() + миграция .subscription_tokens_2026</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — В `create_profile()` (xrayebator:1709-1847) добавить генерацию `sub_token` и запись в profile JSON.

Локация: после строки `local uuid=$(uuidgen)` (xrayebator:1717) добавить:
```
local sub_token
sub_token=$(openssl rand -hex 16)
# Sanity: ровно 32 hex-символа (REQ-C04 strict format).
if [[ ! "$sub_token" =~ ^[a-f0-9]{32}$ ]]; then
  echo -e "${RED}✗ Не удалось сгенерировать sub_token (openssl?)${NC}"
  return 1
fi
```

Затем в блоке `jq_args` (xrayebator:1763-1772) добавить `--arg sub_token "$sub_token"` в массив аргументов, и в `jq_expr` (xrayebator:1772-1784) добавить `, sub_token: $sub_token` ПЕРЕД закрытием объекта (`+ ', created: $created}'`).

Итоговая `jq_expr` для xhttp-профиля будет содержать:
```
{name: $name, uuid: $uuid, transport: $transport, port: $port, fingerprint: $fingerprint, sni: $sni, xhttp_path: $xhttp_path, schema_version: $schema_v, pq_enabled: $pq_enabled, sub_token: $sub_token, created: $created}
```

ШАГ 2 — Объявить функцию `_migrate_subscription_tokens_2026()` (рядом с другими `_migrate_*` функциями, например рядом с `_migrate_xhttp_default_2026` xrayebator:1080-...). Контракт three-valued return (как в run_migration):

```
# Phase 7 REQ-C04: догенерируем sub_token для существующих профилей,
# созданных до Phase 7 (нет поля .sub_token).
# Return: 0 = были изменения (но нам не нужен restart Xray, см. ниже),
#         1 = всё уже было (no-op),
#         ≥2 = жёсткая ошибка записи.
# Внимание: эта миграция ТОЛЬКО profile JSONs, config.json НЕ трогается.
# safe_restart_xray в run_migration вызывается только при return 0 — но он БЕЗВРЕДЕН для нас
# (Xray перезапустится за ~3с, клиенты переподключатся). Альтернатива — вернуть 1 даже
# при изменениях, чтобы пропустить рестарт. Выбираем return 1 даже при изменениях
# (раз config.json не тронут — рестарт лишний). Marker всё равно ставится.
_migrate_subscription_tokens_2026() {
  local changed=0
  local profile_file
  for profile_file in "$PROFILES_DIR"/*.json; do
    [[ ! -f "$profile_file" ]] && continue
    local existing
    existing=$(jq -r '.sub_token // ""' "$profile_file" 2>/dev/null)
    if [[ -n "$existing" ]] && [[ "$existing" =~ ^[a-f0-9]{32}$ ]]; then
      continue   # уже есть валидный 32-hex
    fi
    local new_token
    new_token=$(openssl rand -hex 16)
    if [[ ! "$new_token" =~ ^[a-f0-9]{32}$ ]]; then
      echo -e "${RED}  ✗ openssl rand вернул некорректный токен для $(basename "$profile_file")${NC}"
      return 2
    fi
    if ! safe_jq_write --arg t "$new_token" '.sub_token = $t' "$profile_file"; then
      echo -e "${RED}  ✗ safe_jq_write failed для $profile_file${NC}"
      return 2
    fi
    chown xray:xray "$profile_file" 2>/dev/null || true
    chmod 644 "$profile_file" 2>/dev/null || true
    echo -e "${GREEN}  ✓ sub_token сгенерирован для $(basename "$profile_file" .json)${NC}"
    changed=1
  done
  # Возвращаем 1 даже при изменениях — config.json НЕ модифицирован, рестарт Xray не нужен.
  # run_migration на rc=1 ставит marker и не делает safe_restart_xray. Это и нужно.
  if [[ $changed -eq 1 ]]; then
    echo -e "${CYAN}  → sub_token backfill завершён (рестарт Xray не требуется)${NC}"
  fi
  return 1
}
```

ШАГ 3 — Зарегистрировать миграцию в `main_menu()` (xrayebator:1528-1536). Добавить НОВУЮ строку в блок миграций (после `_migrate_xhttp_default_2026` строки 1536):
```
run_migration "subscription_tokens_2026"             "Subscription tokens (Phase 7) для существующих профилей" _migrate_subscription_tokens_2026 || ((migration_failures++))
```

КРИТИЧНО:
- `safe_jq_write` доступен ТОЛЬКО внутри xrayebator (НЕ в install.sh — см. CLAUDE.md). Здесь мы внутри xrayebator, так что используем его.
- `chmod 644` + `chown xray:xray` для profile JSON — соответствует существующей практике (`fix_xray_permissions` нормализует это).
- НЕ регенерировать `sub_token` для профилей, у которых он уже есть. Иначе после revoke (Plan 7.3) запуск xrayebator случайно перегенерирует токены — это поломает revoke-семантику.
- НЕ трогать config.json — миграция работает только с `/usr/local/etc/xray/profiles/*.json`.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "sub_token=\$(openssl rand -hex 16)" xrayebator && \
grep -q "_migrate_subscription_tokens_2026()" xrayebator && \
grep -q 'run_migration "subscription_tokens_2026"' xrayebator && \
# sanity: jq_expr содержит sub_token в записи нового профиля
grep -q "sub_token: \$sub_token" xrayebator && \
echo "PASS: sub_token присутствует в create_profile + миграция зарегистрирована"
  </verify>
  <done>
`create_profile()` генерирует и сохраняет 32-hex `sub_token` в каждом новом profile JSON. Функция `_migrate_subscription_tokens_2026` объявлена, использует `safe_jq_write`, валидирует regex `^[a-f0-9]{32}$`, не трогает config.json и возвращает 1 (no restart нужен). Миграция зарегистрирована в `main_menu()` через `run_migration`. `bash -n xrayebator` проходит.
  </done>
</task>

</tasks>

<verification>
1. `bash -n xrayebator` — синтаксис чист.
2. Source-test: `bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F _generate_vless_url_pure generate_connection _migrate_subscription_tokens_2026 && declare -p VLESS_DECRYPTION_FILE VLESS_ENCRYPTION_FILE CONFIG_FILE PROFILES_DIR' | grep -q '_generate_vless_url_pure' && echo OK_SOURCE`.
3. Token-format: `for i in 1 2 3 4 5; do openssl rand -hex 16 | grep -Eq '^[a-f0-9]{32}$' || echo FAIL; done` — 0 FAIL.
4. Регистрация миграции: `grep -c run_migration xrayebator` — было 9, стало 10.
5. Pure function regression — мини-фикстура: создать `/tmp/test_profile_xhttp_pq.json` с `{"uuid":"00000000-0000-0000-0000-000000000000","transport":"xhttp","port":443,"fingerprint":"chrome","sni":"www.ozon.ru","xhttp_path":"/xhttp","pq_enabled":true,"schema_version":2}` и проверить, что `_generate_vless_url_pure` возвращает строку, начинающуюся с `vless://00000000-0000-0000-0000-000000000000@` и содержащую `encryption=mlkem768x25519plus.` (URL-encoded). Если `$VLESS_ENCRYPTION_FILE` отсутствует — функция возвращает rc=1.
6. Источенный режим: `wc -l xrayebator` ≥ 3990 (после добавления guard + pure-функции + sub_token block + миграции).
</verification>

<success_criteria>
- Source-safety guard в xrayebator (REQ-C10 предусловие): `bash -c 'source ./xrayebator'` не падает на root-check, не зовёт main_menu, экспортирует функции. Каноничная форма guard-строки `if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then` структурно подтверждена grep'ом.
- Pure-функция `_generate_vless_url_pure` определена и используется в `generate_connection`. Все транспорты работают (tcp/tcp-utls/tcp-xudp/tcp-mux/grpc/xhttp-legacy/xhttp-PQ).
- `pq_enabled` lookup в generate_connection() идёт ДО `case "$transport"` (структурный инвариант, проверен awk+grep).
- Поле `sub_token` (32-hex regex) присутствует во всех profile JSON: новых (через `create_profile`) и существующих (через миграцию `.subscription_tokens_2026`).
- Миграция использует `run_migration`, three-valued return (1 = mark only, без рестарта Xray), `safe_jq_write` для записи.
- `bash -n xrayebator` проходит чисто.
- Существующие call sites `generate_connection` (create_profile success-screen + connect_profile_menu) продолжают работать без regressions.
</success_criteria>

<output>
После завершения создать `.planning/phases/07-happ-subscription-server/07-01-pure-vless-url-and-token-migration-SUMMARY.md` по шаблону `~/.claude/get-shit-done/templates/summary.md`. В summary указать:
- Файл xrayebator: точные диапазоны строк, где вставлены guard / pure-функция / sub_token block / миграция.
- Команда smoke-теста pure-функции на временном profile JSON.
- Подтверждение, что `bash -c 'source ./xrayebator; declare -F _generate_vless_url_pure'` работает из-под non-root без main_menu.
- Подтверждение что pq_enabled lookup в generate_connection() предшествует case "$transport".
</output>
</content>
</invoke>