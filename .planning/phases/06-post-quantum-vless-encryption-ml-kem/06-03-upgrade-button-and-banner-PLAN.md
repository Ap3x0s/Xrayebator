---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 03
type: execute
wave: 3
depends_on:
  - "06-02"
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-A09
  - REQ-A10

must_haves:
  truths:
    - "В главном меню появляется отдельный пункт ‘Обновить профиль до post-quantum (PQ)’ — он показывает список профилей и для выбранного non-PQ профиля выполняет IN-PLACE замену транспорта на XHTTP+Reality+VLESS Encryption native, СОХРАНЯЯ существующие UUID и port"
    - "Перед апгрейдом пользователю показывается ЯВНОЕ предупреждение: ‘Старая vless:// ссылка перестанет работать. Все клиенты, подключённые к этому профилю, потеряют связь и должны быть переимпортированы (или для них нужно создать отдельный legacy-профиль)’ — и требуется явное подтверждение y/Y/д/Д"
    - "После подтверждения: profile JSON получает schema_version:2, pq_enabled:true, transport:‘xhttp’; config.json inbound на этом порту перезаписывается на XHTTP+Reality+pq (decryption из $VLESS_DECRYPTION_FILE); safe_restart_xray() вызывается; на успехе — выводится новая vless:// ссылка с encryption= query-param"
    - "Если на порту были другие профили (sharing inbound) — пользователь предупреждается ОТДЕЛЬНО: ‘ВСЕ профили на порту $port будут переведены на XHTTP+PQ (общий inbound). Затронуты: $list’ — апгрейд либо отменяется, либо все профили на порту получают pq_enabled:true в их JSON"
    - "На shared inbound операция МАССОВАЯ и НЕОБРАТИМАЯ — все TCP+Vision профили на этом порту тоже становятся XHTTP+PQ (теряют flow=xtls-rprx-vision), их транспорт принудительно меняется на xhttp, их vless:// URL становится невалидным; для каждого профиля нужно переимпортировать клиента с новым URL; путь обратно — ТОЛЬКО через ручное пересоздание профиля"
    - "Профили, уже имеющие pq_enabled=true, исключены из списка (или показаны как ‘уже PQ’ без возможности повторного апгрейда)"
    - "Первый запуск main_menu после установки v2.0 (отсутствует marker .pq_banner_shown) показывает баннер post-quantum: краткое объяснение PQ + матрица совместимости клиентов на 2026-05-10 (✓ HAPP 2.10+, v2rayNG 1.10+, v2rayN PR #7782, Shadowrocket App Store 2026-05-10; ✗ sing-box, Hiddify, mihomo, NekoBox; ? Streisand) + рекомендация: ‘Если ваш клиент в строке ✗ — создайте отдельный legacy TCP+Vision профиль через пункт меню «Создать профиль»’; затем touch /usr/local/etc/xray/.pq_banner_shown"
    - "Баннер показывается ровно ОДИН раз — последующие запуски main_menu не выводят его (marker check)"
    - "bash -n xrayebator проходит; xray run -test -config config.json после апгрейда профиля возвращает ‘Configuration OK.’; после рестарта Xray слушает старый port с новыми XHTTP+PQ настройками"
  artifacts:
    - path: "xrayebator"
      provides: "upgrade_profile_to_pq_menu() function + регистрация пункта в main_menu (новый case) + show_pq_banner_once() + touch marker .pq_banner_shown"
      contains: "upgrade_profile_to_pq_menu"
    - path: "/usr/local/etc/xray/profiles/<NAME>.json (после апгрейда)"
      provides: "schema_version:2, pq_enabled:true, transport:‘xhttp’, port=прежний, uuid=прежний"
      contains: "pq_enabled"
    - path: "/usr/local/etc/xray/config.json (после апгрейда)"
      provides: "inbound на порту $port имеет network:‘xhttp’, security:‘reality’, settings.decryption=mlkem768x25519plus.<rest>; clients[].id и port НЕ изменены"
      contains: "mlkem768x25519plus"
    - path: "/usr/local/etc/xray/.pq_banner_shown"
      provides: "Marker — баннер уже показан, повторно не показывать"
      contains: ""
  key_links:
    - from: "main_menu() новый пункт меню (например 8)"
      to: "upgrade_profile_to_pq_menu()"
      via: "case 8) upgrade_profile_to_pq_menu ;;"
      pattern: "8\\) upgrade_profile_to_pq_menu"
    - from: "upgrade_profile_to_pq_menu()"
      to: "safe_jq_write на profile JSON + safe_jq_write на config.json inbound + safe_restart_xray"
      via: "после confirmation: jq операции in-place + рестарт"
      pattern: "safe_jq_write.*pq_enabled.*true"
    - from: "upgrade_profile_to_pq_menu() XHTTP-write блок"
      to: "$VLESS_DECRYPTION_FILE"
      via: "VLESS_DECRYPTION=$(cat \"$VLESS_DECRYPTION_FILE\") → подстановка в settings.decryption нового inbound shape"
      pattern: "VLESS_DECRYPTION=\\$\\(cat \"\\$VLESS_DECRYPTION_FILE\"\\)"
    - from: "main_menu() prologue (до while loop)"
      to: "show_pq_banner_once()"
      via: "вызов после миграций, до фикса permissions"
      pattern: "show_pq_banner_once"
    - from: "show_pq_banner_once()"
      to: "/usr/local/etc/xray/.pq_banner_shown"
      via: "[[ -f ... ]] && return 0; иначе print + touch"
      pattern: "\\.pq_banner_shown"
    - from: "upgrade_profile_to_pq_menu() output"
      to: "generate_connection() (новый PQ vless:// URL с ?encryption=)"
      via: "после рестарта вызов generate_connection \"$selected\" для показа новой ссылки"
      pattern: "generate_connection.*\\$selected"
---

<objective>
Дать пользователю явный механизм перевода СУЩЕСТВУЮЩЕГО профиля на post-quantum encryption БЕЗ ручного пересоздания: новый пункт главного меню ‘Обновить профиль до post-quantum (PQ)’ — IN-PLACE заменяет transport профиля на XHTTP+Reality+VLESS Encryption native, СОХРАНЯЯ UUID и port (REVISED REQ-A09: НЕ создаём параллельный inbound, НЕ меняем порт). Дополнительно — первый запуск v2.0 показывает one-shot баннер с PQ-объяснением, актуальной (2026-05-10) матрицей совместимости клиентов и рекомендацией для пользователей не-PQ клиентов создать отдельный legacy профиль.

Purpose: Закрыть UX-петлю Phase 6. Plan 6.1 положил инфраструктуру (vlessenc-keys), Plan 6.2 сделал PQ дефолтом для НОВЫХ XHTTP-профилей. Plan 6.3 даёт явный путь миграции для legacy профилей + информирует пользователя про несовместимости клиентов (предотвращает поддержку-вопросы вида ‘почему мой sing-box не подключается’).

Output:
- В `xrayebator`: функция `upgrade_profile_to_pq_menu()`, регистрация в `main_menu()`, функция `show_pq_banner_once()` + её вызов в начале `main_menu()`, маркер `.pq_banner_shown`.
- На сервере (после exec пути): обновлённые profile JSON (`schema_version:2, pq_enabled:true`), обновлённый inbound в `config.json` (XHTTP+PQ на исходном порту), маркер `.pq_banner_shown`.

CRITICAL constraints (from STATE.md 2026-05-10):
- REQ-A09 REVISED: in-place replace, НЕ parallel inbound, port и UUID СОХРАНЯЮТСЯ.
- НЕ добавляем поля `uuid_legacy` / `port_legacy` в profile JSON (REQ-A07 dropped).
- Legacy backward compat: profile без `pq_enabled` (или `pq_enabled:false`) остаётся валидным — `jq -r '.pq_enabled // false'`.
- Баннер ОДНОРАЗОВЫЙ через marker `.pq_banner_shown`.
</objective>

<execution_context>
@/home/kosya/.claude/get-shit-done/workflows/execute-plan.md
@/home/kosya/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-RESEARCH.md
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-01-pq-key-infrastructure-PLAN.md
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-02-pq-profile-creation-PLAN.md

# Source-code reference (Plan 6.3 строится поверх артефактов 6.1/6.2)
@xrayebator
</context>

<tasks>

<task type="auto">
  <name>Task 1: Функция upgrade_profile_to_pq_menu() — IN-PLACE апгрейд профиля до XHTTP+PQ (REQ-A09 REVISED) [внутренне разбита на три фазы 1a/1b/1c для checkpoint-recoverability]</name>
  <files>xrayebator</files>
  <action>
M3 split note: эта задача внутренне делится на три последовательные фазы. Каждая фаза — атомарный шаг, который можно прервать без поломки сервера. Если 1b упадёт — 1a уже валиден (UI собрал данные); если 1c упадёт — config.json и Xray уже на новом PQ-инбаунде, восстановить можно вручную обновив profile JSON. Реализовать ВСЁ в одной функции `upgrade_profile_to_pq_menu()`, но разбить тело на три помеченных секции `# === Phase 1a UI ===`, `# === Phase 1b MUTATION ===`, `# === Phase 1c POST-MUTATION ===`. После каждой фазы — явный echo прогресса для оператора.

Phases:
- **1a (UI/validation):** show_ascii + ML-KEM keys pre-check + список профилей с PQ-фильтром + selection input + extraction (port, uuid, sni, fingerprint, short_id из inbound) + shared-inbound detection + полное warning UI + явное y/Y/д/Д подтверждение. Output: validated `$pname`, `$port`, `$uuid`, `$sni`, `$fingerprint`, `$short_id`, `$profiles_on_port[]`, user `confirmed=yes`. Если confirmed=no — return без мутаций.
- **1b (mutation):** backup_config → читаем `$VLESS_DECRYPTION` → строим new_inbound heredoc UPGEOF (XHTTP+PQ) → если shared, пересобираем clients[] из всех profile JSON на порту → safe_jq_write atomic del-by-port + append → safe_restart_xray (с auto-rollback на failure). Output: config.json содержит новый XHTTP+PQ inbound на $port, Xray слушает с новой конфигурацией. ❗ Если safe_restart_xray fails — config откатывается автоматически, profile JSON ещё НЕ менялся → return.
- **1c (post-mutation):** loop по `$profiles_on_port[]` — safe_jq_write transport=xhttp + schema_version=2 + pq_enabled=true + xhttp_path → fix_xray_permissions → generate_connection "$selected" для показа новой vless:// + QR. Output: profile JSONs синхронизированы со state'ом config.json, оператор видит новую ссылку.

Future refactor opportunity (не делать в этом плане): извлечь helper `_build_xhttp_pq_inbound()` который принимает port/sni/fingerprint/short_id/uuid_list и возвращает inbound heredoc — переиспользуем из add_inbound (Plan 6.2 Task 1, место heredoc XHTTPEOF). Сейчас оставляем дублирование heredoc для скорости итерации; вынос — задача Phase 7 рефакторинга.

Создать новую функцию `upgrade_profile_to_pq_menu()` РЯДОМ с другими per-profile меню (`change_sni_menu`, `change_fingerprint_menu`, `change_port_menu`) — поместить ПОСЛЕ `change_port_menu()` (примерно строка ~2700+, перед `adguard_home_menu`). Зарегистрировать в `main_menu()` как новый пункт.

ШАГ 1 — Регистрация в main_menu():
В блоке `case $choice in` (строки ~1400-1410 после Plan 6.2) ДОБАВИТЬ ПОСЛЕ существующего пункта `7) adguard_home_menu`:
- В text-блоке меню (строки ~1392-1395) добавить:
  ```bash
  echo -e "${MAGENTA} POST-QUANTUM ENCRYPTION:${NC}"
  echo -e "${CYAN} 8)${NC} Обновить профиль до post-quantum (PQ XHTTP+Reality)"
  echo ""
  ```
- В `case $choice in`: добавить `8) upgrade_profile_to_pq_menu ;;`
- ВАЖНО: пункт `0) exit` остаётся последним.

ШАГ 2 — Функция upgrade_profile_to_pq_menu():

```bash
upgrade_profile_to_pq_menu() {
  # === Phase 1a: UI / VALIDATION ===
  # Цель: собрать и провалидировать все входные данные ДО любых мутаций.
  # Если оператор прерывает (Ctrl+C / выбор 0 / "n" в подтверждении) — НИЧЕГО не изменено.
  show_ascii
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}   ОБНОВЛЕНИЕ ПРОФИЛЯ ДО POST-QUANTUM         ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

  # Pre-check: ключи vlessenc должны существовать (Plan 6.1 marker)
  if [[ ! -f "$VLESS_DECRYPTION_FILE" ]] || [[ ! -f "$VLESS_ENCRYPTION_FILE" ]]; then
    echo -e "${RED}✗ ML-KEM ключи не найдены ($VLESS_DECRYPTION_FILE).${NC}"
    echo -e "${YELLOW}  Запустите xrayebator update — миграция .mlkem_keys_generated должна сгенерировать ключи.${NC}"
    echo -n -e "${YELLOW}Нажмите Enter для возврата...${NC}"; read
    return
  fi

  # Список ВСЕХ профилей с пометкой PQ-статуса
  local profiles=($(ls -1 "$PROFILES_DIR" 2>/dev/null | sed 's/.json//'))
  if [[ ${#profiles[@]} -eq 0 ]]; then
    echo -e "${RED}✗ Нет созданных профилей${NC}"
    echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"; read
    return
  fi

  echo -e "${YELLOW}Выберите профиль для перевода на post-quantum:${NC}\n"
  local i=1
  local upgradeable=()
  for profile in "${profiles[@]}"; do
    local pq=$(jq -r '.pq_enabled // false' "$PROFILES_DIR/$profile.json" 2>/dev/null)
    local transport=$(jq -r '.transport // "tcp"' "$PROFILES_DIR/$profile.json" 2>/dev/null)
    local port=$(jq -r '.port' "$PROFILES_DIR/$profile.json" 2>/dev/null)
    if [[ "$pq" == "true" ]]; then
      echo -e "${CYAN} —)${NC} $profile ${BLUE}[порт:$port,$transport]${NC} ${GREEN}[уже PQ]${NC}"
    else
      echo -e "${CYAN} $i)${NC} $profile ${BLUE}[порт:$port,$transport]${NC} ${YELLOW}[legacy]${NC}"
      upgradeable+=("$profile")
      ((i++))
    fi
  done
  echo -e "${CYAN} 0)${NC} Назад\n"

  if [[ ${#upgradeable[@]} -eq 0 ]]; then
    echo -e "${GREEN}✓ Все профили уже используют post-quantum encryption.${NC}"
    echo -n -e "${YELLOW}Нажмите Enter для возврата...${NC}"; read
    return
  fi

  echo -n -e "${YELLOW}Выберите профиль (1-${#upgradeable[@]}, 0 — назад): ${NC}"
  read choice
  if [[ "$choice" == "0" ]]; then return; fi
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ $choice -lt 1 ]] || [[ $choice -gt ${#upgradeable[@]} ]]; then
    echo -e "${RED}✗ Неверный выбор${NC}"; sleep 2; return
  fi

  local selected="${upgradeable[$((choice-1))]}"
  local pfile="$PROFILES_DIR/$selected.json"
  local port=$(jq -r '.port' "$pfile")
  local uuid=$(jq -r '.uuid' "$pfile")
  local sni=$(jq -r '.sni // "www.ozon.ru"' "$pfile")
  local fingerprint=$(jq -r '.fingerprint // "chrome"' "$pfile")
  local old_transport=$(jq -r '.transport // "tcp"' "$pfile")

  # H1 fix: short_id ЧИТАЕМ ИЗ СУЩЕСТВУЮЩЕГО INBOUND (config.json), НЕ из profile JSON.
  # create_profile() в xrayebator (~строки 1548-1566) НИКОГДА не сохраняет short_id в profile JSON
  # (поля: name/uuid/transport/port/fingerprint/sni/grpc_service_name/xhttp_path/created).
  # Если на shared inbound сгенерировать новый short_id — Reality порвёт ВСЕ остальные клиенты на порту.
  # Зеркалим логику generate_connection() (xrayebator:2015-2018): берём первый shortIds[0] из инбаунда.
  local short_id
  short_id=$(jq -r --argjson p "$port" \
    '.inbounds[] | select(.port == $p) | .streamSettings.realitySettings.shortIds[0]' \
    "$CONFIG_FILE" 2>/dev/null)
  if [[ -z "$short_id" || "$short_id" == "null" ]]; then
    # Inbound не содержит shortIds (corrupted/legacy без Reality?) — генерируем как last resort.
    # На shared inbound этот fallback ОБЫЧНО НЕ срабатывает: Phase 1 install.sh всегда пишет shortIds.
    short_id=$(openssl rand -hex 8)
  fi

  # CRITICAL: проверка shared inbound — если на порту другие профили, ВСЕ они уйдут в PQ
  local profiles_on_port=($(get_profiles_on_port "$port"))
  echo ""
  echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║                  ⚠ ВНИМАНИЕ                                  ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}Профиль: ${MAGENTA}$selected${NC} ${BLUE}(порт $port, транспорт $old_transport → xhttp+pq)${NC}"
  echo ""
  echo -e "${YELLOW}После апгрейда:${NC}"
  echo -e "  ${RED}• Старая vless:// ссылка ПЕРЕСТАНЕТ РАБОТАТЬ${NC}"
  echo -e "  ${RED}• Все клиенты, подключённые к этому профилю, потеряют связь${NC}"
  echo -e "  ${RED}• Их нужно переимпортировать с новой vless:// (или создать отдельный legacy-профиль через ‘Создать профиль’)${NC}"
  echo -e "  ${YELLOW}• UUID и порт сохранятся: $uuid / $port${NC}"
  echo ""
  if [[ ${#profiles_on_port[@]} -gt 1 ]]; then
    echo -e "${RED}⚠ На порту $port размещён ОБЩИЙ inbound — операция МАССОВАЯ и НЕОБРАТИМАЯ:${NC}"
    echo -e "  ${RED}• ВСЕ перечисленные ниже профили будут переведены на XHTTP+PQ${NC}"
    echo -e "  ${RED}• TCP+Vision профили на этом порту потеряют flow=xtls-rprx-vision${NC}"
    echo -e "  ${RED}• Транспорт принудительно меняется tcp/grpc → xhttp в profile JSON${NC}"
    echo -e "  ${RED}• Каждому из этих профилей нужно переимпортировать клиента с НОВОЙ vless:// ссылкой${NC}"
    echo -e "  ${RED}• Путь обратно (XHTTP+PQ → TCP+Vision) ТОЛЬКО через ручное пересоздание профиля${NC}"
    echo ""
    echo -e "${YELLOW}Затронутые профили на порту $port:${NC}"
    for p in "${profiles_on_port[@]}"; do
      echo -e "  ${CYAN}•${NC} $p"
    done
    echo ""
  fi
  echo -n -e "${YELLOW}Подтвердите апгрейд (y/N): ${NC}"
  read confirm
  if [[ ! "$confirm" =~ ^[yYдД]$ ]]; then
    echo -e "${YELLOW}Апгрейд отменён.${NC}"; sleep 2; return
  fi

  # === Phase 1b: MUTATION ===
  # Цель: атомарно заменить inbound на XHTTP+PQ + рестартнуть Xray.
  # Все мутации защищены backup + safe_jq_write + safe_restart_xray (auto-rollback).
  # Если safe_restart_xray fails — config откачен, Xray работает на старой конфигурации,
  # profile JSON ещё НЕ менялся (Phase 1c не достигнута) — состояние согласовано.
  echo -e "${CYAN}→ Phase 1b: бэкап и замена inbound в config.json${NC}"
  # === IN-PLACE замена inbound в config.json ===
  # Шаг A: бэкап (на случай ошибки)
  backup_config "upgrade_profile_pq_$selected"

  # Шаг B: читаем содержимое decryption ОДИН раз
  local VLESS_DECRYPTION
  VLESS_DECRYPTION=$(cat "$VLESS_DECRYPTION_FILE")
  if [[ -z "$VLESS_DECRYPTION" ]]; then
    echo -e "${RED}✗ $VLESS_DECRYPTION_FILE пуст — апгрейд прерван${NC}"; sleep 2; return
  fi

  # Шаг C: сгенерировать XHTTP path (как делает add_inbound) — простой случайный
  local xhttp_path="/$(openssl rand -hex 8)"
  local PRIVATE_KEY=$(cat "$PRIVATE_KEY_FILE")

  # Шаг D: REPLACE inbound с port=$port на новый XHTTP+pq shape (с СОХРАНЁННЫМ uuid)
  # Используем jq path-assignment (НЕ object merge — иначе clobber freedom outbound и т.п.)
  # Стратегия: удалить старый inbound с этим port + добавить новый.
  local new_inbound
  new_inbound=$(cat << UPGEOF
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
UPGEOF
)
  # ВАЖНО: если на порту были другие профили, их UUID должны быть в clients[]. Собираем их.
  if [[ ${#profiles_on_port[@]} -gt 1 ]]; then
    # Собрать массив clients из всех profile JSON на этом порту
    local clients_json="["
    local first=1
    for p in "${profiles_on_port[@]}"; do
      local pu=$(jq -r '.uuid' "$PROFILES_DIR/$p.json")
      if [[ $first -eq 1 ]]; then first=0; else clients_json+=","; fi
      clients_json+="{\"id\":\"$pu\",\"flow\":\"\"}"
    done
    clients_json+="]"
    # Подменить settings.clients в new_inbound через jq
    new_inbound=$(echo "$new_inbound" | jq --argjson c "$clients_json" '.settings.clients = $c')
  fi

  # Шаг E: атомарная замена — del + append
  if ! safe_jq_write --argjson port "$port" --argjson new_in "$new_inbound" \
    '(.inbounds |= map(select(.port != $port))) | .inbounds += [$new_in]' \
    "$CONFIG_FILE"; then
    echo -e "${RED}✗ Ошибка обновления config.json${NC}"; sleep 2; return
  fi

  # === Phase 1c: POST-MUTATION ===
  # Цель: синхронизировать profile JSON со state'ом config.json + показать новую ссылку.
  # Достигается ТОЛЬКО если Phase 1b прошла полностью (config.json обновлён + Xray рестартнул).
  # Если safe_jq_write на profile JSON фейлится — config.json уже на новом inbound, оператор
  # увидит ошибку и сможет исправить profile JSON вручную (jq + safe_jq_write helper).
  echo -e "${CYAN}→ Phase 1c: синхронизация profile JSON и вывод новой vless:// ссылки${NC}"
  # Шаг F: обновить profile JSON (selected И всех на порту, если shared)
  # H1 fix: НЕ записываем short_id в profile JSON. Schema v1 не имела этого поля,
  # schema v2 НЕ должна вводить новое поле без явного решения. short_id живёт в
  # config.json:.inbounds[].streamSettings.realitySettings.shortIds[0] — один источник истины.
  # generate_connection() читает оттуда же (xrayebator:2015-2018), profile JSON хранит только
  # user-facing метаданные (uuid, port, transport, sni, fingerprint, xhttp_path, schema_version, pq_enabled).
  for p in "${profiles_on_port[@]}"; do
    if ! safe_jq_write --arg path "$xhttp_path" \
      '.transport = "xhttp" | .schema_version = 2 | .pq_enabled = true | .xhttp_path = $path' \
      "$PROFILES_DIR/$p.json"; then
      echo -e "${RED}  ✗ Ошибка обновления profile JSON: $p${NC}"
    else
      echo -e "${CYAN}  → Обновлен: ${YELLOW}$p${NC}"
    fi
  done

  # Шаг G: восстановить permissions и рестарт с auto-rollback
  fix_xray_permissions
  if ! safe_restart_xray; then
    echo -e "${RED}✗ safe_restart_xray failed — config откачен на бэкап upgrade_profile_pq_$selected${NC}"
    echo -e "${YELLOW}  Profile JSON МОЖЕТ остаться изменённым — проверьте: jq . $pfile${NC}"
    sleep 3; return
  fi

  echo ""
  echo -e "${GREEN}✓ Профиль '$selected' успешно переведён на XHTTP+PQ${NC}"
  echo -e "${CYAN}Новая vless:// ссылка:${NC}"
  generate_connection "$selected"
  echo ""
  echo -n -e "${YELLOW}Нажмите Enter для возврата в меню...${NC}"
  read
}
```

КРИТИЧЕСКИЕ ПРАВИЛА:
- НЕ использовать `systemctl restart xray` — ТОЛЬКО `safe_restart_xray`.
- НЕ использовать `jq ... > tmp && mv` — ТОЛЬКО `safe_jq_write`.
- НЕ создавать новый inbound на другом порту (REQ-A09 REVISED — in-place; preserves port).
- НЕ менять UUID (REVISED).
- НЕ использовать `--arg` для числового port в jq — только `--argjson`.
- НЕ объект-мерджить inbound (риск стереть пользовательские поля); стратегия `del-by-port + append`.
- shared inbound: если на порту >1 профиля — собирать ВСЕХ clients в новый inbound, иначе потеряем доступ legacy-профилей того же порта.

Edge cases:
- Если `$VLESS_DECRYPTION_FILE` отсутствует — pre-check + ранний return с подсказкой запустить update.
- Если `$VLESS_DECRYPTION` пуст — abort до мутации config.
- Если профиль уже PQ (`pq_enabled:true`) — он не показывается в списке выбора.
- Если `safe_restart_xray` фейлится — config откатывается, но profile JSON уже обновлён → пользователю сказать.
- Если в config.json inbound на этом порту нет `streamSettings.realitySettings.shortIds[0]` (broken/legacy) — генерируем новый через `openssl rand -hex 8` как fallback. После записи нового inbound он становится единственным `shortIds[0]` для всех клиентов на порту.

Не трогаем здесь: client compatibility checks (это работа баннера в Task 2), массовый апгрейд (только по одному профилю за раз).
  </action>
  <verify>
1. `bash -n /home/kosya/xrayebator/xrayebator` — синтаксис проходит.
2. `grep -n "upgrade_profile_to_pq_menu" /home/kosya/xrayebator/xrayebator` — функция определена И зарегистрирована в `case` main_menu.
3. `grep -n "8) upgrade_profile_to_pq_menu" /home/kosya/xrayebator/xrayebator` — пункт меню привязан к функции.
4. `grep -c "safe_jq_write" /home/kosya/xrayebator/xrayebator` И `grep -c "safe_restart_xray" /home/kosya/xrayebator/xrayebator` — увеличились (новые вызовы добавлены).
5. `grep -n "VLESS_DECRYPTION=\$(cat \"\$VLESS_DECRYPTION_FILE\")" /home/kosya/xrayebator/xrayebator` — содержимое читается из файла, не хардкод.
6. `grep -n "del-by-port\|inbounds |= map(select(.port != \$port))" /home/kosya/xrayebator/xrayebator` — стратегия замены через del+append, не object merge.
7. (manual on test VPS) Запустить xrayebator → меню → 8 → выбрать legacy профиль → подтвердить → проверить:
   - `cat /usr/local/etc/xray/profiles/<NAME>.json | jq .pq_enabled` → `true`
   - `cat /usr/local/etc/xray/profiles/<NAME>.json | jq .uuid` → НЕ изменился
   - `cat /usr/local/etc/xray/profiles/<NAME>.json | jq .port` → НЕ изменился
   - `jq '.inbounds[] | select(.port == <PORT>) | .settings.decryption' /usr/local/etc/xray/config.json` → строка `mlkem768x25519plus.native...`
   - `xray run -test -config /usr/local/etc/xray/config.json` → `Configuration OK.`
   - `systemctl is-active xray` → `active`
   - В TUI после успеха выводится новая vless:// с `?encryption=...`
8. (manual edge case) Профиль уже PQ → в списке помечен `[уже PQ]` без числового индекса.
9. (manual edge case) Удалить ML-KEM ключи `rm /usr/local/etc/xray/.vless_decryption` → запустить меню 8 → должна выйти ошибка с подсказкой `xrayebator update`.
10. M3 phase-mapping verify (тело функции содержит все три phase markers — checkpoint-recoverability):
    ```bash
    awk '/^upgrade_profile_to_pq_menu\(\) \{/,/^\}/' /home/kosya/xrayebator/xrayebator | grep -c '# === Phase 1[abc]: ' | grep -qx '3' && echo "OK Phase 1a/1b/1c markers present" || echo "FAIL phase markers"
    ```
    Pass: выводится `OK Phase 1a/1b/1c markers present` (ровно три маркера).
  </verify>
  <done>
Функция `upgrade_profile_to_pq_menu()` определена в `xrayebator`, привязана к пункту 8 главного меню. Выбор non-PQ профиля → подтверждение → IN-PLACE замена транспорта на XHTTP+Reality+PQ с СОХРАНЕНИЕМ UUID и port. Profile JSON получает `schema_version:2, pq_enabled:true, transport:"xhttp"`. config.json inbound на этом порту получает `decryption=<vlessenc-string>` и xhttp+reality streamSettings. Если на порту shared inbound — все профили обновляются и их UUID сохраняются в `clients[]`. После: `safe_restart_xray` + вывод новой vless:// ссылки. Все мутации через `safe_jq_write`. На любом фейле — auto-rollback config.json через `safe_restart_xray`. Ключи vlessenc проверяются ДО апгрейда. `bash -n` проходит.
  </done>
</task>

<task type="auto">
  <name>Task 2: Функция show_pq_banner_once() — одноразовый PQ-баннер с матрицей совместимости (REQ-A10)</name>
  <files>xrayebator</files>
  <action>
Создать функцию `show_pq_banner_once()` РЯДОМ с другими prologue-helper'ами (`_check_xray_outdated_nag` — строка ~1310). Зарегистрировать вызов в `main_menu()` ДО `while true` loop, ПОСЛЕ блока миграций и ПОСЛЕ `_check_xray_outdated_nag`, но ДО `fix_xray_permissions` (чтобы баннер появился на видном месте при первом старте v2.0).

ШАГ 1 — Функция show_pq_banner_once() (поместить ОКОЛО `_check_xray_outdated_nag`, ~ строка 1310):

```bash
# Одноразовый баннер о post-quantum encryption (REQ-A10).
# Показывается РОВНО ОДИН РАЗ — на первом запуске после установки/обновления v2.0.
# Маркер: /usr/local/etc/xray/.pq_banner_shown
# Содержит: краткое объяснение PQ + матрица совместимости клиентов на 2026-05-10
# + рекомендация для пользователей не-PQ клиентов создать отдельный legacy профиль.
show_pq_banner_once() {
  local marker="/usr/local/etc/xray/.pq_banner_shown"
  if [[ -f "$marker" ]]; then
    return 0
  fi

  echo ""
  echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${MAGENTA}║       🔐 POST-QUANTUM ENCRYPTION (ML-KEM-768) ВКЛЮЧЕНА            ║${NC}"
  echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}Что это:${NC}"
  echo -e "  Все НОВЫЕ XHTTP-профили теперь защищены от ‘Harvest Now, Decrypt Later’ —"
  echo -e "  атак, где трафик записывают сегодня, чтобы расшифровать на квантовом"
  echo -e "  компьютере через 5-10 лет. Используется ML-KEM-768 поверх Reality."
  echo ""
  echo -e "${YELLOW}Совместимость клиентов на 2026-05-10:${NC}"
  echo ""
  echo -e "  ${GREEN}✓ Поддерживают:${NC}"
  echo -e "    ${GREEN}•${NC} HAPP 2.10+ (Android/iOS)"
  echo -e "    ${GREEN}•${NC} v2rayNG 1.10+ (Android)"
  echo -e "    ${GREEN}•${NC} v2rayN (Windows/macOS, PR #7782 merged)"
  echo -e "    ${GREEN}•${NC} Shadowrocket (iOS, App Store с 2026-05-10)"
  echo ""
  echo -e "  ${RED}✗ НЕ поддерживают (используйте legacy TCP+Vision):${NC}"
  echo -e "    ${RED}•${NC} sing-box (все форки)"
  echo -e "    ${RED}•${NC} Hiddify"
  echo -e "    ${RED}•${NC} mihomo (Clash Meta)"
  echo -e "    ${RED}•${NC} NekoBox / NekoRay"
  echo ""
  echo -e "  ${YELLOW}? Статус неизвестен:${NC}"
  echo -e "    ${YELLOW}•${NC} Streisand (iOS) — проверьте журнал релизов"
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║ РЕКОМЕНДАЦИЯ:                                                      ║${NC}"
  echo -e "${BLUE}║ Если ваш клиент в строке ✗ — создайте отдельный legacy профиль:    ║${NC}"
  echo -e "${BLUE}║   меню → 1 (Создать профиль) → выберите ‘TCP+Vision (legacy)’     ║${NC}"
  echo -e "${BLUE}║ для совместимых клиентов используйте новый PQ XHTTP-профиль        ║${NC}"
  echo -e "${BLUE}║ (создаётся по умолчанию).                                          ║${NC}"
  echo -e "${BLUE}║                                                                    ║${NC}"
  echo -e "${BLUE}║ Существующие profile-файлы можно перевести на PQ через пункт       ║${NC}"
  echo -e "${BLUE}║   меню → 8 (Обновить профиль до post-quantum)                     ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -n -e "${YELLOW}Этот баннер больше не появится. Нажмите Enter для продолжения...${NC}"
  read

  # Mark as shown — используем touch + chown как в run_migration helper
  touch "$marker"
  chown xray:xray "$marker" 2>/dev/null || true
}
```

ШАГ 2 — Регистрация в main_menu():
В блоке prologue (после миграций, после `_check_xray_outdated_nag`, до `fix_xray_permissions`) ДОБАВИТЬ:

```bash
  # Phase 6 first-run banner: показываем один раз после установки v2.0 (REQ-A10).
  # Marker: /usr/local/etc/xray/.pq_banner_shown
  show_pq_banner_once
```

То есть структура prologue (текущие строки 1335-1360):
```bash
  local migration_failures=0
  run_migration ...
  ...
  if [[ $migration_failures -gt 0 ]]; then
    ...
  fi

  _check_xray_outdated_nag

  show_pq_banner_once          # ← НОВАЯ строка

  fix_xray_permissions

  while true; do
    show_ascii
    ...
```

КРИТИЧЕСКИЕ ПРАВИЛА:
- Marker ДОЛЖЕН быть в `/usr/local/etc/xray/.pq_banner_shown` (НЕ в `/etc/`, НЕ в `/var/lib/`).
- chown xray:xray на marker — для консистентности с другими маркерами (run_migration делает это).
- НЕ вызывать `safe_restart_xray` из баннера — баннер не мутирует ничего, кроме одного marker-файла.
- НЕ блокировать main_menu, если marker не удалось создать — `chown` через `|| true`.
- Если пользователь Ctrl+C в момент `read` — marker НЕ создан, баннер появится снова на следующем запуске. Это OK (предотвращает потерю важного сообщения).
- Текст ровно как в спецификации — матрица clientов на 2026-05-10 (НЕ выдумывать новые поддерживающие клиенты, НЕ обещать неподтверждённый Streisand).
- НЕ показывать баннер в неинтерактивном режиме — но xrayebator всегда интерактивный (TUI), отдельный non-tty check не нужен.

Edge cases:
- Свежая установка (v2.0 с нуля): marker создаст install.sh? — НЕТ, install.sh здесь НЕ трогаем. Marker создаст сам баннер на первом запуске → пользователь увидит его (это правильно для свежих установок тоже).
- Upgrade с v1.x: marker отсутствует → баннер появится при первом запуске после `xrayebator update` — основной целевой сценарий.
- Если файл `/usr/local/etc/xray/` не существует (broken install) — `touch` упадёт, marker не создастся, баннер появится снова. OK.
  </action>
  <verify>
1. `bash -n /home/kosya/xrayebator/xrayebator` — синтаксис проходит.
2. `grep -n "show_pq_banner_once" /home/kosya/xrayebator/xrayebator` — функция определена И вызывается в main_menu (минимум 2 совпадения: define + call).
3. `grep -n "\.pq_banner_shown" /home/kosya/xrayebator/xrayebator` — marker используется (минимум 2: проверка `[[ -f ... ]]` + `touch`).
4. Полная проверка всех меток баннера+меню (L6 fix — было 4 grep, стало loop по 13+ меткам):
   ```bash
   missing=0
   for label in "ML-KEM-768" "HAPP 2.10+" "v2rayNG 1.10+" "v2rayN" "PR #7782" "Shadowrocket" "sing-box" "Hiddify" "mihomo" "NekoBox" "Streisand" "Создать профиль" "Обновить профиль до post-quantum"; do
     if ! grep -q "$label" /home/kosya/xrayebator/xrayebator; then
       echo "MISSING: $label"
       missing=1
     fi
   done
   [[ $missing -eq 0 ]] && echo "OK all banner+menu labels present"
   ```
   Pass условие: ни одной строки `MISSING:` не выводится — выводится `OK all banner+menu labels present`.
5. (manual on test VPS, fresh install) `rm -f /usr/local/etc/xray/.pq_banner_shown && xrayebator` → баннер показан → нажать Enter → проверить `ls -la /usr/local/etc/xray/.pq_banner_shown` (existing, owner xray:xray).
6. (manual second-launch) `xrayebator` (не удаляя marker) → баннер НЕ показан, главное меню сразу видно.
7. (manual upgrade scenario) симулировать v1.x→v2.0 апгрейд: `rm /usr/local/etc/xray/.pq_banner_shown && xrayebator` → баннер показан с правильной матрицей и рекомендацией.
8. Визуальная проверка: матрица содержит ровно три категории — ✓, ✗, ?; в ✓ перечислены HAPP 2.10+, v2rayNG 1.10+, v2rayN (PR #7782), Shadowrocket (App Store 2026-05-10); в ✗ — sing-box, Hiddify, mihomo, NekoBox; в ? — Streisand.
9. `grep -B1 -A3 "show_pq_banner_once" /home/kosya/xrayebator/xrayebator | head -20` — вызов размещён ПОСЛЕ `_check_xray_outdated_nag` и ДО `fix_xray_permissions`.
  </verify>
  <done>
Функция `show_pq_banner_once()` определена в `xrayebator`, использует marker `/usr/local/etc/xray/.pq_banner_shown` (idempotent — баннер не повторяется). Содержит точную матрицу совместимости клиентов на 2026-05-10: ✓ (HAPP 2.10+, v2rayNG 1.10+, v2rayN PR #7782, Shadowrocket App Store 2026-05-10), ✗ (sing-box, Hiddify, mihomo, NekoBox), ? (Streisand). Включает рекомендацию: пользователям ✗-клиентов создать отдельный legacy TCP+Vision профиль через меню→1, существующие профили апгрейдить через меню→8. Вызов добавлен в `main_menu()` prologue: после миграций/`_check_xray_outdated_nag`, до `fix_xray_permissions`. На неудаче `chown` баннер не блокируется. `bash -n` проходит.
  </done>
</task>

</tasks>

<verification>
Phase-level verification (после Task 1 и Task 2):

1. **Синтаксис и интеграция:**
   - `bash -n /home/kosya/xrayebator/xrayebator` — exit 0.
   - `grep -c "safe_jq_write" /home/kosya/xrayebator/xrayebator` — выросло (минимум +3 от Plan 6.2 baseline).
   - `grep -c "safe_restart_xray" /home/kosya/xrayebator/xrayebator` — выросло (минимум +1).
   - Меню `main_menu` содержит пункт `8) Обновить профиль до post-quantum` И обработчик `8) upgrade_profile_to_pq_menu ;;`.

2. **Sequence end-to-end (на test VPS):**
   - Свежий v2.0 (или после `xrayebator update` с v1.x): первый `xrayebator` → миграции прошли → `_check_xray_outdated_nag` → **PQ-баннер показан** → Enter → главное меню → marker `.pq_banner_shown` создан.
   - Второй запуск: баннер НЕ показан, меню сразу.
   - Создаём legacy TCP+Vision профиль (через пункт 1, опция legacy из Plan 6.2).
   - Меню → 8 → видим список с этим профилем как `[legacy]` → выбираем → подтверждаем апгрейд → видим вывод обновления → новая vless:// ссылка с `?encryption=...` → Enter.
   - Проверяем:
     - `jq '.transport, .pq_enabled, .schema_version, .uuid, .port' /usr/local/etc/xray/profiles/<NAME>.json` → `"xhttp", true, 2, <старый uuid>, <старый port>`
     - `jq '.inbounds[] | select(.port == <PORT>) | .streamSettings.network, .settings.decryption' /usr/local/etc/xray/config.json` → `"xhttp", "mlkem768x25519plus..."`
     - `xray run -test -config /usr/local/etc/xray/config.json` → `Configuration OK.`
     - `systemctl is-active xray` → `active`
     - Подключение из совместимого клиента (HAPP/v2rayNG) с новой ссылкой работает.

3. **Rollback path:**
   - Симулировать поломку: вручную портим `$VLESS_DECRYPTION_FILE` (echo "garbage" > ...) → запускаем апгрейд → `safe_restart_xray` падает (xray run -test fail) → видим в выводе сообщение про backup → `ls /usr/local/etc/xray/backups/` содержит свежий `upgrade_profile_pq_<NAME>` → config откачен.

4. **REQ-A09 REVISED guard (НЕ parallel inbound):**
   - `jq '[.inbounds[].port] | length' /usr/local/etc/xray/config.json` ДО апгрейда И ПОСЛЕ — число inbound'ов одинаковое (in-place replace, не add).
   - `jq '.inbounds[].port' /usr/local/etc/xray/config.json` — старый port присутствует, новых портов НЕ появилось.

5. **Schema sanity:**
   - В profile JSON отсутствуют поля `uuid_legacy` и `port_legacy` (REQ-A07 dropped — не должны добавляться):
     `jq 'has("uuid_legacy") or has("port_legacy")' /usr/local/etc/xray/profiles/<NAME>.json` → `false`.
</verification>

<success_criteria>
- [ ] `bash -n /home/kosya/xrayebator/xrayebator` проходит.
- [ ] Функция `upgrade_profile_to_pq_menu()` существует и привязана к пункту 8 в `main_menu()`.
- [ ] Функция `show_pq_banner_once()` существует и вызывается в prologue `main_menu()`.
- [ ] Баннер показывается ровно один раз (marker `.pq_banner_shown`).
- [ ] Текст баннера содержит матрицу совместимости на 2026-05-10 (✓: HAPP 2.10+, v2rayNG 1.10+, v2rayN PR #7782, Shadowrocket App Store; ✗: sing-box, Hiddify, mihomo, NekoBox; ?: Streisand) И рекомендацию создать legacy профиль для ✗-клиентов.
- [ ] Апгрейд legacy XHTTP/TCP/gRPC профиля выполняется IN-PLACE: UUID и port СОХРАНЯЮТСЯ.
- [ ] Profile JSON после апгрейда: `transport:"xhttp", schema_version:2, pq_enabled:true`.
- [ ] config.json после апгрейда: inbound на исходном port имеет `network:"xhttp", security:"reality", settings.decryption=<vlessenc string>`.
- [ ] При shared inbound (>1 профиль на порту) — ВСЕ профили на порту переводятся на PQ, их UUID сохраняются в `clients[]`.
- [ ] Перед апгрейдом пользователь видит явное предупреждение про разрыв legacy-клиентов И требуется явное `y/Y/д/Д`.
- [ ] Все мутации идут через `safe_jq_write` (НЕТ raw `jq > tmp && mv`).
- [ ] Все рестарты через `safe_restart_xray` (НЕТ bare `systemctl restart xray`).
- [ ] `backup_config` вызывается ДО любой мутации в upgrade-функции.
- [ ] `fix_xray_permissions` вызывается после записи profile JSON и config.json.
- [ ] При отсутствии `$VLESS_DECRYPTION_FILE` — pre-check + ранний return с подсказкой `xrayebator update`.
- [ ] Профили с `pq_enabled:true` исключены из выбора (показаны как `[уже PQ]` без индекса).
- [ ] Поля `uuid_legacy` и `port_legacy` НЕ добавляются в profile JSON (REQ-A07 dropped).
- [ ] xray run -test после апгрейда возвращает `Configuration OK.` и xray.service активен.
</success_criteria>

<output>
После завершения создать:
`.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-03-SUMMARY.md`

Должен содержать:
- Какие функции добавлены (`upgrade_profile_to_pq_menu`, `show_pq_banner_once`) и их местоположение в файле.
- Стратегию IN-PLACE замены inbound (`del-by-port + append`) — почему НЕ object merge.
- Как обработан shared inbound (массовое обновление clients[] при >1 профиле на порту).
- Текст матрицы совместимости (для регенерации в будущих апдейтах при изменении статуса клиентов).
- Какие edge cases протестированы вручную (rollback, отсутствие ключей, повторный показ баннера).
- Любые отклонения от плана (если возникли).
- Готовность к follow-up Phase 7 (если запланирована — например, добавление UI-инструмента для удаления marker'а .pq_banner_shown по запросу пользователя для повторного показа баннера).
</output>
