---
phase: 08-polish-sni-vision-bypass-routing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - xrayebator
  - sni_list.txt
autonomous: true
requirements:
  - REQ-E01
  - REQ-E02
  - REQ-E03
  - REQ-E04

must_haves:
  truths:
    - "После обновления до v2.0 sni_list.txt содержит online.uralsib.ru, online.vtb.ru, www.cdek.ru, www.pochta.ru, www.avito.ru (priority 1) и github.com (priority 3); apple.com и любые *.apple.com/*.icloud.com удалены"
    - "User-custom SNI (не входящие в KNOWN_DEFAULTS_v1) после миграции .sni_list_2026 сохраняются в sni_list.txt без изменений"
    - "Команда `sudo xrayebator probe-test` запускается без меню и выводит pretty-table (SNI | HTTP | TLS | latency) + summary 'Доступны: X/N SNI'"
    - "Перед автоматическим применением миграции .sni_list_2026 пользователю задается вопрос 'Запустить probe-test сейчас? [y/N]' с дефолтом N"
    - "В main_menu пункт 4 называется 'Управление профилем (SNI / fingerprint / port / advanced)' и вызывает manage_profile_menu (hub), а старые top-level пункты 'Подменить Fingerprint' и 'Изменить порт' убраны из главного меню — доступ к ним только через hub"
    - "manage_profile_menu сначала просит выбрать профиль, затем показывает submenu: 1) Изменить SNI, 2) Изменить fingerprint, 3) Изменить порт, 4) Адванс настройки (experimental), 0) Назад"
    - "Пункт 4 submenu 'Адванс настройки (experimental)' открывает manage_profile_advanced_menu с RED-warning и y/N (default N), сохраняющий testpre/testseed в profile JSON и в config.json client через safe_jq_write + safe_restart_xray"
    - "В меню 'Подписка HAPP' доступен пункт 'Настроить announcement (HAPP)', сохраняющий free-form ввод в /usr/local/etc/xray/announce.txt (limit 200 char); empty input очищает файл; subhttp.sh при empty файле не эмиттит announce header"
    - "Vision Seed prompt содержит подсказку о том что testpre на серверной стороне parsed-but-not-used (эффект только в outbound, клиенту нужно ставить значение самому), testseed работает на обеих сторонах"
  artifacts:
    - path: "sni_list.txt"
      provides: "Updated SNI list для Reality 2026"
      contains: "online.uralsib.ru"
    - path: "xrayebator"
      provides: "_migrate_sni_list_2026, probe_test_command, probe_sni, KNOWN_DEFAULTS_v1, manage_profile_menu (hub), manage_profile_advanced_menu, edit_happ_announce_menu"
      contains: "_migrate_sni_list_2026"
  key_links:
    - from: "main_menu()"
      to: "run_migration .sni_list_2026"
      via: "вызов в migration loop после .subscription_tokens_2026"
      pattern: "run_migration .sni_list_2026"
    - from: "CLI dispatcher case `${1:-}` in"
      to: "probe_test_command"
      via: "новая ветка case `probe-test`"
      pattern: "probe-test\\)"
    - from: "happ_subscription_menu"
      to: "edit_happ_announce_menu"
      via: "новый пункт меню"
      pattern: "edit_happ_announce_menu"
    - from: "main_menu пункт 4"
      to: "manage_profile_menu (hub)"
      via: "замена существующего change_sni_menu на manage_profile_menu в case 4"
      pattern: "4\\) manage_profile_menu"
    - from: "manage_profile_menu submenu"
      to: "manage_profile_advanced_menu"
      via: "пункт 4 submenu — Адванс настройки (experimental)"
      pattern: "manage_profile_advanced_menu"
    - from: "subhttp.sh heredoc (install_subscription_server)"
      to: "/usr/local/etc/xray/announce.txt"
      via: "если файл непустой — эмиттит announce header + body comment"
      pattern: "announce.txt"
---

<objective>
Plan 8.1 закрывает финальные полировочные REQ-E01..E04 одним планом: обновленный SNI list 2026 (миграция через run_migration с защитой user-custom через KNOWN_DEFAULTS_v1), standalone CLI `xrayebator probe-test` (двухуровневая проверка TLS+HTTP+latency), experimental Vision Seed как hidden submenu внутри нового manage_profile_menu hub (`testpre`/`testseed` поля VLESS Account, RED-warning, immediate apply), HAPP announce editor (free-form 1-line в `/usr/local/etc/xray/announce.txt`, подхватывается subhttp.sh).

Purpose: Финал v2.0 polish — SNI остаются актуальными к 2026 банкам/логистике РФ, оператор может вживую проверить доступность SNI с VPS, экспериментаторы получают доступ к Vision Seed через консолидированный hub (без env-var, не загромождая главное меню), HAPP подписки несут operator-message.

Output:
- sni_list.txt с обновленными priority 1 (банки/логистика/маркетплейс) + priority 3 (github), без apple/icloud
- xrayebator: новая миграция `.sni_list_2026`, KNOWN_DEFAULTS_v1 hardcoded set, CLI `probe-test`, manage_profile_menu (hub-меню профильных действий), manage_profile_advanced_menu (testpre/testseed, hidden submenu внутри hub), edit_happ_announce_menu, регистрация в main_menu (пункт 4 = hub; старые пункты 5-6 убраны) + happ_subscription_menu
- subhttp.sh (через regen install_subscription_server) читает /usr/local/etc/xray/announce.txt и эмиттит HAPP `announce: base64:...` header + `#announce: base64:...` body comment когда файл непустой
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
@.planning/phases/08-polish-sni-vision-bypass-routing/08-CONTEXT.md
@.planning/phases/08-polish-sni-vision-bypass-routing/08-RESEARCH.md

# Phase 4 — паттерн run_migration + safe_jq_write + backup_config (через run_migration)
# Phase 5 — паттерн CLI dispatch (case "${1:-}" in) после source-guard
# Phase 6 — _migrate_xhttp_default_2026 как пример no-op миграции с return 1
# Phase 7 — happ_subscription_menu (xrayebator:2371), happ_settings_menu (xrayebator:2291),
#           install_subscription_server heredoc subhttp.sh (Plan 7.2)
# connect_profile_menu (xrayebator:3153) — образец profile-picker для manage_profile_menu
# change_sni_menu / change_fingerprint_menu / change_port_menu (xrayebator:3298/3588/3750) —
#   existing функции, вызываются из manage_profile_menu hub без рефакторинга (двойной picker
#   приемлем — это не ломает функционал, только добавляет один лишний шаг подтверждения).
@xrayebator
@sni_list.txt
</context>

<tasks>

<task type="auto">
  <name>Task 1: SNI list 2026 migration + probe-test CLI command</name>
  <files>xrayebator, sni_list.txt</files>
  <action>
**A. Обновить файл sni_list.txt (источник истины для install.sh и future миграций):**

Применить следующие изменения к содержимому sni_list.txt:
- В секцию «БЕЛЫЙ СПИСОК РФ - Финансы (опорная инфраструктура)» добавить (priority 1, category ru_whitelist):
  - `online.uralsib.ru|ru_whitelist|1`
  - `online.vtb.ru|ru_whitelist|1`
- Добавить новую подсекцию «Логистика / госструктуры / маркетплейсы (приоритет 1)» с записями:
  - `www.cdek.ru|ru_whitelist|1`
  - `www.pochta.ru|ru_whitelist|1`
  - `www.avito.ru|ru_whitelist|1`
- В секцию «ИНОСТРАННЫЕ ДОМЕНЫ» (priority 3, category foreign) добавить:
  - `github.com|foreign|3` (рядом с www.github.com)
- Удалить любые строки содержащие `apple.com`, `icloud.com` (на текущий момент их там нет, но оставить grep-guarantee на отсутствие — действует как «не вернуть случайно»).
- Update метаданные header: «Последнее обновление: май 2026».
- НЕ добавлять `twitch.tv`, `microsoft.com`, `live.com` (TLS fingerprint mismatch с Reality — см. REQ-E01).

**B. Добавить в xrayebator (под другими константами рядом с TLS_LIST_FILE / SNI_LIST_FILE, ~xrayebator:300):**

Hardcoded `KNOWN_DEFAULTS_v1` bash-массив (readonly) — перечислить домены, которые поставлялись в v1.0 sni_list.txt. КРИТИЧНО: enumerate СОВРЕМЕННЫЙ sni_list.txt минус новые v2.0 кандидаты, чтобы миграция могла отличить user-custom от ship-default.

Реальный v1.0 список (из текущего sni_list.txt):
```
KNOWN_DEFAULTS_v1=(
  # ru_whitelist priority 1
  "www.ozon.ru" "api.ozon.ru" "st.ozon.ru" "ir.ozon.ru"
  "www.wildberries.ru" "splitter.wb.ru"
  "www.sberbank.ru" "www.tinkoff.ru" "www.alfabank.ru"
  "www.nspk.ru" "sbp.nspk.ru"
  "stats.vk-portal.net" "sun6-21.userapi.com" "sun6-20.userapi.com"
  "queuev4.vk.com" "eh.vk.com"
  "www.kinopoisk.ru" "www.1tv.ru" "www.rbc.ru" "www.vedomosti.ru"
  "www.gosuslugi.ru" "www.mos.ru" "www.spb.gov.ru"
  # yandex_cdn priority 2
  "speller.yandex.net" "api-maps.yandex.ru" "spell.yandex.net"
  "advapi.yandex.net" "mc.yandex.ru" "suggest.yandex.ru"
  # foreign priority 3
  "www.github.com" "raw.githubusercontent.com" "api.github.com"
  "www.cloudflare.com" "cdn.cloudflare.net" "aws.amazon.com"
  # fallback priority 4
  "www.mozilla.org" "www.ubuntu.com" "www.debian.org"
  # Apple/iCloud (исторически — будут удалены)
  "apple.com" "www.apple.com" "icloud.com" "www.icloud.com"
)
```

КОММЕНТАРИЙ к KNOWN_DEFAULTS_v1: «Хардкод-список SNI shipped в v1.0 sni_list.txt. Используется миграциями SNI v2.0+ — все, что НЕ в этом set, считается user-custom и не трогается. При расширении v2.0 list — обновить v2 set отдельно.»

**C. Реализовать функцию `_migrate_sni_list_2026` (поместить ПОСЛЕ существующей `_migrate_subscription_tokens_2026`, рядом с другими _migrate_ функциями ~xrayebator:1100-1300):**

Логика:
1. Источник истины — `/usr/local/etc/xray/sni_list.txt` (production path). Если файла нет — return 1 (no-op).
2. Прочитать текущий файл; собрать массивы:
   - `to_remove=("apple.com" "www.apple.com" "*.apple.com" "icloud.com" "www.icloud.com" "*.icloud.com")` — но удалять ТОЛЬКО если есть совпадение И запись в KNOWN_DEFAULTS_v1 (что соответствует требованию «удаление apple/icloud безусловное только если в KNOWN_DEFAULTS_v1»).
   - `to_add_p1=("online.uralsib.ru|ru_whitelist|1" "online.vtb.ru|ru_whitelist|1" "www.cdek.ru|ru_whitelist|1" "www.pochta.ru|ru_whitelist|1" "www.avito.ru|ru_whitelist|1")`
   - `to_add_p3=("github.com|foreign|3")`
3. Если все add записи УЖЕ присутствуют И apple/icloud отсутствуют → return 1 (no-op, marker touch only).
4. Иначе:
   - Создать tmp через `mktemp /tmp/sni-list.XXXXXX`.
   - awk: для каждой строки исходника — выкинуть совпадения с to_remove (но НЕ трогать user-custom, не в KNOWN_DEFAULTS_v1 — это уже исключено логикой to_remove, т.к. apple/icloud в KNOWN_DEFAULTS_v1).
   - Append недостающие to_add_p1 + to_add_p3 (skip если уже есть).
   - Атомарно `mv tmp /usr/local/etc/xray/sni_list.txt`, восстановить chown xray:xray + chmod 644.
   - return 0 (changed → run_migration выполнит safe_restart_xray + touch marker).

Безопасность: ВСЯ обработка идет через mktemp + atomic mv (НЕ через in-place sed -i). НЕТ safe_jq_write — это plain text, не JSON.

**D. Регистрация миграции в main_menu() — добавить вызов ПОСЛЕ `.subscription_tokens_2026` (xrayebator:2427):**

```
run_migration "sni_list_2026" "SNI list 2026 (РФ-банки/логистика, удалить apple/icloud)" _migrate_sni_list_2026 || ((migration_failures++))
```

**E. Auto-prompt перед миграцией:** ПЕРЕД вызовом этой строчки добавить блок, который проверяет:
- если `[[ ! -f /usr/local/etc/xray/.sni_list_2026 ]]` (миграция еще не применена)
- то показать prompt: «Перед SNI миграцией доступна команда probe-test для проверки доступности SNI. Запустить probe-test сейчас? [y/N]» (дефолт N — `read -r ans; ans=${ans:-N}`).
- если y/Y/д/Д → вызвать `probe_test_command` (определена в Task 1.G).
- независимо от ответа — продолжить дальше, миграция применяется force-режимом самим run_migration.

**F. Реализовать функцию `probe_sni()` (helper, не CLI):**

```bash
probe_sni() {
  local sni="$1"
  local timeout=8
  local tls_out tls_status="FAIL"
  tls_out=$(timeout "$timeout" openssl s_client \
    -connect "${sni}:443" \
    -servername "$sni" \
    -tls1_3 \
    </dev/null 2>&1)
  echo "$tls_out" | grep -q "Verify return code: 0" && tls_status="OK"

  local http_code latency
  read -r http_code latency < <(
    curl -s -o /dev/null \
      --connect-timeout "$timeout" \
      --max-time "$timeout" \
      -w "%{http_code} %{time_total}" \
      "https://${sni}/" 2>/dev/null || echo "000 0"
  )

  printf "%-32s | %-10s | %-10s | %6ss\n" \
    "$sni" "${http_code:-000}" "TLS ${tls_status}" "${latency:-?}"
}
```

**G. Реализовать `probe_test_command()`:**

Заголовок «PROBE TEST: проверка SNI с VPS», pretty-table header (cyan), цикл по `/usr/local/etc/xray/sni_list.txt` (skip пустых и комментариев `#`), парсинг `IFS='|' read -r sni cat prio`, вызов `probe_sni "$sni"`, инкремент `total` всегда + `ok_count` если в результате содержится "TLS OK". В конце — separator + GREEN «Доступны: X/N SNI».

ВАЖНО: probe_test_command — НЕ menu-item. Только CLI и auto-prompt.

**H. CLI dispatcher — добавить ветку (xrayebator:4857, в существующий case "${1:-}"):**

```bash
  probe-test)
    shift
    probe_test_command
    ;;
```

И обновить usage-сообщение (xrayebator:4867-4869) добавив:
```
echo -e "  ${CYAN}sudo xrayebator probe-test${NC}  — проверить доступность SNI с VPS"
```

**Russian language reminders:** Все user-facing строки на русском, БЕЗ буквы «е с двумя точками» (use обычное «е»). Use `read -r` для безопасного чтения.
  </action>
  <verify>
- `bash -n xrayebator` — syntax check проходит.
- `grep -c "KNOWN_DEFAULTS_v1" xrayebator` ≥ 2 (определение + использование в миграции).
- `grep -c "_migrate_sni_list_2026" xrayebator` ≥ 2 (определение + вызов).
- `grep -c "probe_sni\|probe_test_command" xrayebator` ≥ 4.
- `grep -c "probe-test)" xrayebator` ≥ 1 (CLI ветка).
- `grep -c "online.uralsib.ru\|online.vtb.ru\|www.cdek.ru\|www.pochta.ru" sni_list.txt` ≥ 4.
- `grep -c "apple.com\|icloud.com" sni_list.txt` == 0.
- `grep -c "github.com" sni_list.txt` ≥ 2 (новая запись + старая www.github.com).
- Manual smoke (на dev/VPS): `sudo bash -c 'XRAYEBATOR_SOURCED=0 source xrayebator >/dev/null 2>&1; probe_test_command' 2>&1 | head -10` показывает таблицу.
  </verify>
  <done>
- sni_list.txt обновлен согласно REQ-E01: добавлены 5 priority-1 SNI + github.com priority-3, apple/icloud отсутствуют, twitch/microsoft/live.com НЕ добавлены.
- xrayebator содержит KNOWN_DEFAULTS_v1 (хардкод v1.0 SNI), _migrate_sni_list_2026 (с return-contract 0/1/≥2 через run_migration), probe_sni helper, probe_test_command, CLI ветка `probe-test)`.
- main_menu() вызывает run_migration ".sni_list_2026" С auto-prompt «Запустить probe-test сейчас? [y/N]» перед миграцией.
- bash -n проходит, dispatcher не сломан (xrayebator update / xrayebator menu все еще работают).
  </done>
</task>

<task type="auto">
  <name>Task 2: manage_profile_menu hub + Vision Seed experimental submenu</name>
  <files>xrayebator</files>
  <action>
**ВАЖНО (исправлено после revision):** Vision Seed НЕ регистрируется как top-level пункт main_menu. Вместо этого создается hub-меню `manage_profile_menu`, которое консолидирует все профильные действия: SNI / fingerprint / port + новый advanced submenu (Vision Seed). Это соответствует CONTEXT.md строка 44: «Hidden submenu внутри `manage_profile_menu` — отдельный пункт "Адванс настройки (experimental)"».

**A. Реализовать функцию `manage_profile_advanced_menu(profile_name)`:**

Поместить рядом с другими `*_menu` функциями (например, после `change_port_menu`, ~xrayebator:3950).

ВАЖНО: функция принимает `profile_name` как аргумент (профиль уже выбран в hub-меню `manage_profile_menu`). Это убирает необходимость второго profile-picker внутри advanced submenu.

Логика:

1. `local profile_name="$1"; local profile_file="$PROFILES_DIR/$profile_name.json"`.
2. Если файл не существует → RED error «Профиль не найден» + return.
3. Заголовок «АДВАНС НАСТРОЙКИ ПРОФИЛЯ (EXPERIMENTAL)» в BLUE с указанием имени профиля.
4. RED-warning block:
   ```
   ╔═══════════════════════════════════════════════════════════╗
   ║  EXPERIMENTAL — VISION SEED                              ║
   ╠═══════════════════════════════════════════════════════════╣
   ║  Эти поля (testpre/testseed) появились в Xray-core      ║
   ║  v1.251201.0 (декабрь 2025). Могут сломать подключения  ║
   ║  клиентов на старых версиях Xray. Не тестировалось на   ║
   ║  реальных конфигах.                                       ║
   ║                                                          ║
   ║  testpre на серверной стороне parsed-but-not-used:      ║
   ║  pre-connect логика работает только в outbound (клиент).║
   ║  Чтобы testpre дал эффект — клиенту нужно установить    ║
   ║  то же значение в своем VLESS outbound.                 ║
   ║  testseed работает на обеих сторонах.                   ║
   ╚═══════════════════════════════════════════════════════════╝

   Продолжить? [y/N]: _
   ```
   Read с дефолтом N. Если не y/Y/д/Д → return.

5. Минимальная версия Xray-core check (PERED основной логикой):
   ```bash
   local xray_ver
   xray_ver=$(xray version 2>/dev/null | head -1 | awk '{print $2}')
   if [[ -n "$xray_ver" ]]; then
     local major=$(echo "$xray_ver" | cut -d'.' -f1)
     local minor=$(echo "$xray_ver" | cut -d'.' -f2)
     if [[ "$major" == "1" && "$minor" -lt "251201" ]]; then
       echo -e "${YELLOW}Xray-core версия $xray_ver — testpre/testseed появились в v1.251201.0+${NC}"
       echo -e "${YELLOW}  Поля будут добавлены в config но эффекта не дадут. Рекомендуется sudo xrayebator update.${NC}"
       echo -n -e "${YELLOW}Продолжить все равно? [y/N]: ${NC}"
       read -r ans
       [[ ! "$ans" =~ ^[yYдД]$ ]] && return
     fi
   fi
   ```

6. Показать текущие значения testpre/testseed из profile JSON:
   ```bash
   local cur_pre cur_seed
   cur_pre=$(jq -r '.testpre // "не задано"' "$profile_file")
   cur_seed=$(jq -c '.testseed // []' "$profile_file")
   echo -e "${CYAN}Текущие значения: testpre=${cur_pre}, testseed=${cur_seed}${NC}"
   ```

7. Запросить новые значения:
   ```
   testpre (uint32, 0=off, эффект только на клиенте) [0]: _
   ```
   Validate: `[[ "$testpre_input" =~ ^[0-9]+$ ]] || testpre_input=0`.

   ```
   testseed (uint32 через пробел, пусто=off) []: _
   ```
   Parse: trim, split по spaces, validate каждое число regex `^[0-9]+$`, build JSON array через `printf '%s\n' "$testseed_input" | tr ' ' '\n' | jq -R . | jq -s '[.[] | select(length > 0) | tonumber]'`. Если пусто — `testseed_json='[]'`.

8. Confirm summary: показать «testpre = X», «testseed = [1,2,3]», y/N apply.

9. **Apply (через safe_jq_write):**

   a. **Profile JSON:**
   ```bash
   safe_jq_write \
     --argjson testpre "$testpre_val" \
     --argjson testseed "$testseed_json" \
     '. + {testpre: $testpre, testseed: $testseed}' \
     "$profile_file"
   ```

   b. **config.json inbound client:** найти inbound по `.port == port` и client по `.id == uuid` (port и uuid читаются из profile JSON в самом начале функции):
   ```bash
   local port uuid
   port=$(jq -r '.port' "$profile_file")
   uuid=$(jq -r '.uuid' "$profile_file")
   safe_jq_write \
     --argjson port "$port" \
     --arg uuid "$uuid" \
     --argjson testpre "$testpre_val" \
     --argjson testseed "$testseed_json" \
     '(.inbounds[] | select(.port == $port) | .settings.clients[] | select(.id == $uuid)) |= (. + {testpre: $testpre, testseed: $testseed})' \
     "$CONFIG_FILE"
   ```

   c. `fix_xray_permissions`.

   d. `safe_restart_xray` — pre-validate + rollback на failure.

10. Success message: «Vision Seed применен. testpre=X, testseed=[...]».

**B. Реализовать функцию `manage_profile_menu()` — HUB меню профильных действий:**

Поместить рядом с другими `*_menu` функциями (например ПОСЛЕ `connect_profile_menu`, ~xrayebator:3190). Это меню — точка входа для всех действий с профилем.

```bash
manage_profile_menu() {
  while true; do
    show_ascii
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}         УПРАВЛЕНИЕ ПРОФИЛЕМ                  ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

    # Profile picker (по образцу connect_profile_menu xrayebator:3158)
    local profiles=($(ls -1 "$PROFILES_DIR" 2>/dev/null | sed 's/.json//'))
    if [[ ${#profiles[@]} -eq 0 ]]; then
      echo -e "${RED}Нет созданных профилей${NC}"
      echo -e "${CYAN}Создайте профиль через главное меню 'Создать новый профиль'${NC}"
      echo ""
      echo -n -e "${YELLOW}Нажмите Enter для возврата...${NC}"
      read
      return
    fi

    echo -e "${YELLOW}Выберите профиль для управления:${NC}\n"
    local i=1
    for profile in "${profiles[@]}"; do
      local transport=$(jq -r '.transport' "$PROFILES_DIR/$profile.json" 2>/dev/null)
      local port=$(jq -r '.port' "$PROFILES_DIR/$profile.json" 2>/dev/null)
      local sni=$(jq -r '.sni' "$PROFILES_DIR/$profile.json" 2>/dev/null)
      echo -e "${CYAN} $i)${NC} $profile ${BLUE}[$transport:$port sni=$sni]${NC}"
      ((i++))
    done
    echo -e "${CYAN} 0)${NC} Назад в главное меню\n"
    echo -n -e "${YELLOW}Выбор: ${NC}"
    read pchoice

    [[ "$pchoice" == "0" ]] && return
    if ! [[ "$pchoice" =~ ^[0-9]+$ ]] || [[ $pchoice -lt 1 ]] || [[ $pchoice -gt ${#profiles[@]} ]]; then
      echo -e "${RED}Неверный выбор${NC}"
      sleep 1
      continue
    fi

    local selected="${profiles[$((pchoice-1))]}"

    # Action submenu
    while true; do
      show_ascii
      echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
      echo -e "${BLUE}    ДЕЙСТВИЯ С ПРОФИЛЕМ: $selected${NC}"
      echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"
      echo -e "${CYAN} 1)${NC} Изменить SNI (домен маскировки)"
      echo -e "${CYAN} 2)${NC} Изменить Fingerprint (браузер)"
      echo -e "${CYAN} 3)${NC} Изменить порт"
      echo -e "${CYAN} 4)${NC} Адванс настройки (experimental)"
      echo -e "${CYAN} 0)${NC} Назад (выбрать другой профиль)\n"
      echo -n -e "${YELLOW}Выбор: ${NC}"
      read achoice
      case "$achoice" in
        1) change_sni_menu ;;          # внутри сам сделает picker — это допустимый UX-нюанс,
                                        # двойной picker не ломает функционал
        2) change_fingerprint_menu ;;
        3) change_port_menu ;;
        4) manage_profile_advanced_menu "$selected" ;;
        0) break ;;                     # выйти из action submenu, вернуться к выбору профиля
        *) echo -e "${RED}Неверный выбор${NC}"; sleep 1 ;;
      esac
    done
  done
}
```

ВАЖНО про двойной picker для пунктов 1-3: existing функции `change_sni_menu` / `change_fingerprint_menu` / `change_port_menu` имеют свой profile-picker внутри. При вызове из manage_profile_menu юзер сначала выбирает профиль в hub, потом снова в суб-функции — лишний шаг, но это НЕ ломает функционал (юзер просто выберет тот же профиль повторно). Полный рефакторинг этих функций (принимать profile_name как аргумент) — defer для будущего плана, scope текущего plan'а ограничен Vision Seed как hidden submenu.

**C. Модификация main_menu (xrayebator:2475-2506) — КОНСОЛИДАЦИЯ профильных пунктов:**

Заменить секцию «НАСТРОЙКИ МАСКИРОВКИ» (строки 2475-2478) — три старых пункта 4, 5, 6 становятся ОДНИМ пунктом 4 «Управление профилем».

**Старый код (удалить):**
```bash
echo -e "${MAGENTA} НАСТРОЙКИ МАСКИРОВКИ:${NC}"
echo -e "${CYAN} 4)${NC} Подменить SNI профиля (домен маскировки)"
echo -e "${CYAN} 5)${NC} Подменить Fingerprint профиля (браузер)"
echo -e "${CYAN} 6)${NC} Изменить порт профиля"
echo ""
```

**Новый код (вставить):**
```bash
echo -e "${MAGENTA} УПРАВЛЕНИЕ ПРОФИЛЕМ:${NC}"
echo -e "${CYAN} 4)${NC} Управление профилем (SNI / fingerprint / port / advanced)"
echo ""
```

В case-блоке (xrayebator:2494-2506) — заменить старые ветки 4, 5, 6 на одну:

**Старый код (удалить):**
```bash
      4) change_sni_menu ;;
      5) change_fingerprint_menu ;;
      6) change_port_menu ;;
```

**Новый код (вставить):**
```bash
      4) manage_profile_menu ;;
```

Старые функции `change_sni_menu`, `change_fingerprint_menu`, `change_port_menu` НЕ удаляются из xrayebator — они вызываются из manage_profile_menu submenu (пункты 1-3).

ВНИМАНИЕ про нумерацию: пункты 5 и 6 в main_menu становятся «дырами» — при вводе юзером 5 или 6 случай попадет в `*) Неверный выбор`. Это приемлемо. НЕ перенумеровывать пункты 7, 8, 9 (юзеры могли запомнить). Финальное состояние main_menu: 1, 2, 3, 4 (новый hub), [дыры 5-6], 7 (AdGuard — будет удален в Plan 8.3), 8, 9.

Альтернатива (после Plan 8.3 удалит пункт 7): можно перенумеровать 8→5, 9→6 в финальной версии — но это OUTSIDE scope plan 8.1. Текущий plan только меняет 4 и убирает 5-6.

**Russian/style guidelines:** Без буквы «е с двумя точками», use обычное «е». RED warning через `${RED}╔...╠...╚`. y/N все через `read -r`, дефолт N.
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "manage_profile_menu" xrayebator` ≥ 2 (определение + вызов из main_menu).
- `grep -c "manage_profile_advanced_menu" xrayebator` ≥ 2 (определение + вызов из submenu).
- `grep -c "testpre\|testseed" xrayebator` ≥ 6 (warning text + jq paths + form fields).
- `grep -c "Vision Seed" xrayebator` ≥ 2.
- `grep -c "4) manage_profile_menu" xrayebator` == 1.
- `grep -c "5) change_fingerprint_menu\|6) change_port_menu" xrayebator` == 0 (старые ветки убраны из main_menu, но функции остались как callable).
- `grep -c "^change_sni_menu()\|^change_fingerprint_menu()\|^change_port_menu()" xrayebator` == 3 (определения сохранены).
- Manual smoke: `sudo xrayebator` → main_menu отображает «4) Управление профилем (SNI / fingerprint / port / advanced)». Выбор 4 → profile picker → выбор профиля → submenu (1-4 + 0). Выбор 4 в submenu → RED warning Vision Seed → cancel (N) → возврат в submenu.
- Manual smoke change: 4 → выбрать профиль → 4 → y → empty input для testpre/testseed → confirm N → возврат без изменений config.json (`jq '.inbounds[0].settings.clients[0]' /usr/local/etc/xray/config.json` до/после).
- Manual smoke apply: 4 → выбрать профиль → 4 → y → testpre=1, testseed="42 100" → confirm y → `jq '.inbounds[].settings.clients[] | select(.id=="<uuid>") | {testpre, testseed}' /usr/local/etc/xray/config.json` показывает `{testpre: 1, testseed: [42, 100]}`. Profile JSON содержит те же поля.
- Manual smoke легаси: 4 → выбрать профиль → 1 (Изменить SNI) → existing change_sni_menu отображается (со своим internal picker) → менять SNI → работает как раньше.
- `safe_restart_xray` отработал (systemctl is-active xray = active).
  </verify>
  <done>
- manage_profile_menu реализован как hub: profile picker → action submenu (SNI / fingerprint / port / advanced / back).
- manage_profile_advanced_menu принимает profile_name как аргумент, выполняет RED-warning + Xray-core version check (≥ v1.251201.0) + validation testpre regex ^[0-9]+$ + testseed → JSON array через jq + apply через safe_jq_write обоих файлов + safe_restart_xray.
- main_menu пункт 4 заменен на «Управление профилем (SNI / fingerprint / port / advanced)», старые ветки 5 и 6 убраны (но change_fingerprint_menu / change_port_menu остаются callable из submenu).
- REQ-E03 удовлетворен: Vision Seed — hidden submenu внутри manage_profile_menu (соответствует CONTEXT.md строка 44), experimental, off-by-default, warning + y/N default N, сохранено в profile JSON + добавлено к inbound через safe_jq_write.
  </done>
</task>

<task type="auto">
  <name>Task 3: HAPP announce editor + subhttp.sh announce emit</name>
  <files>xrayebator</files>
  <action>
**A. Реализовать функцию `edit_happ_announce_menu()` (рядом с happ_subscription_menu, ~xrayebator:2370):**

Логика:
1. Заголовок «HAPP ANNOUNCEMENT (текст на subscription)» в BLUE.
2. Показать current state:
   ```bash
   local ann_file="/usr/local/etc/xray/announce.txt"
   if [[ -s "$ann_file" ]]; then
     echo -e "${GREEN}Текущий announcement:${NC}"
     head -c 200 "$ann_file"
     echo ""
   else
     echo -e "${YELLOW}Announcement не задан (HAPP header отсутствует)${NC}"
   fi
   ```
3. Меню:
   ```
   1) Установить/изменить текст
   2) Очистить (убрать announcement)
   0) Назад
   ```
4. **Пункт 1: установка:**
   ```
   Введите однострочный текст (~200 char max, без переносов строк):
   > _
   ```
   `read -r new_text`. Truncate to 200 chars: `new_text="${new_text:0:200}"`. Replace newlines just in case: `new_text="${new_text//[$'\n\r']/}"`.
   Confirm: «Сохранить '$new_text'? [y/N]».
   Если y: атомарная запись через mktemp+mv:
   ```bash
   local tmp
   tmp=$(mktemp /tmp/announce.XXXXXX) || { echo "${RED}mktemp failed${NC}"; return; }
   printf '%s' "$new_text" > "$tmp"
   mv "$tmp" "$ann_file"
   chown xray:xray "$ann_file" 2>/dev/null || true
   chmod 644 "$ann_file"
   echo -e "${GREEN}Announcement сохранен в $ann_file${NC}"
   ```
   Эмпти-input → переходим в пункт 2 (clear).
5. **Пункт 2: очистка:**
   ```bash
   rm -f "$ann_file"
   echo -e "${GREEN}Announcement очищен${NC}"
   ```
6. Каждое изменение завершается «Нажмите Enter для продолжения» + sleep 1, и происходит возврат в этот же меню (while true loop).

ВАЖНО: subhttp.sh не нуждается в перезапуске — он читает announce.txt на каждый HTTP request (если правильно реализовано в Task 3.C).

**B. Регистрация в happ_subscription_menu (xrayebator:2390-2405):**

Добавить новый пункт ПОСЛЕ «4) Настройки HAPP», ПЕРЕД «0) Назад»:

```bash
echo -e "${CYAN} 5)${NC} Настроить announcement (HAPP)"
```

И в case-блоке добавить ветку:
```bash
5) edit_happ_announce_menu ;;
```

**C. Обновить heredoc subhttp.sh в `install_subscription_server()` (Plan 7.2):**

Найти секцию heredoc, где subhttp.sh генерируется (grep на SUBHTTP_EOF в xrayebator). Внутри heredoc, рядом с place where headers/body comments эмиттятся, добавить блок:

```bash
# HAPP announce — emit header + body comment если announce.txt непустой
ANNOUNCE_FILE="/usr/local/etc/xray/announce.txt"
ANNOUNCE_HEADER=""
ANNOUNCE_COMMENT=""
if [[ -s "$ANNOUNCE_FILE" ]]; then
  _ann_text=$(head -c 200 "$ANNOUNCE_FILE" | tr -d '\n\r')
  if [[ -n "$_ann_text" ]]; then
    _ann_b64=$(printf '%s' "$_ann_text" | base64 -w0)
    ANNOUNCE_HEADER="announce: base64:${_ann_b64}"
    ANNOUNCE_COMMENT="#announce: base64:${_ann_b64}"
  fi
fi
```

И в секциях где headers/body emit (там где уже эмиттятся profile-title, subscription-userinfo) — добавить условные строки:

```bash
# В HTTP response headers (после profile-title header):
if [[ -n "$ANNOUNCE_HEADER" ]]; then
  printf '%s\r\n' "$ANNOUNCE_HEADER"
fi

# В body comments (после #profile-title comment):
if [[ -n "$ANNOUNCE_COMMENT" ]]; then
  printf '%s\n' "$ANNOUNCE_COMMENT"
fi
```

КРИТИЧНО: heredoc уровня escape. Внутри `cat << 'SUBHTTP_EOF'` (single-quoted EOF) переменные НЕ интерполируются Bash-ом xrayebator-а, все выполняется при runtime subhttp.sh. Проверь, что `$ANNOUNCE_FILE`, `$_ann_text`, `$_ann_b64` остаются буквально в выходном subhttp.sh (без подмены значений из xrayebator).

Empty/missing file → ANNOUNCE_HEADER и ANNOUNCE_COMMENT остаются пустыми → if [[ -n ... ]] guards не пускают `printf` → HAPP получает чистый ответ без announce. Соответствует RESEARCH §Pitfall 6.

**D. После Task 3.C:**

Реалистично — если subhttp.sh уже установлен на сервере (.subscription_installed marker), новый announce-блок не появится без переинсталла. Решение: NOTE в edit_happ_announce_menu — если `.subscription_installed` существует, после первого SET текста показать сообщение:

```
echo -e "${YELLOW}Если subscription server уже установлен — переустановите его через${NC}"
echo -e "${YELLOW}  «Подписка HAPP» → 1) или 2), чтобы subhttp.sh подхватил announce-логику.${NC}"
```

Это one-time сообщение, можно показывать в конце функции (или только если detect старая subhttp.sh без announce-логики через `grep -q ANNOUNCE_FILE /usr/local/etc/xray/subhttp.sh`).

Альтернатива (cleaner): после успешной записи announce.txt вызвать automatic regen subhttp.sh если он установлен:
```bash
if [[ -f /usr/local/etc/xray/.subscription_installed ]]; then
  # Re-generate subhttp.sh с обновленной логикой
  install_subscription_server >/dev/null 2>&1 || {
    echo -e "${YELLOW}Re-generate subhttp.sh failed — переустановите через меню «Подписка HAPP»${NC}"
  }
fi
```

Использовать второй подход (automatic regen) — лучший UX.

**Russian/style:** Без буквы «е с двумя точками», use обычное «е». Все user-facing — на русском.
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "edit_happ_announce_menu" xrayebator` ≥ 2 (определение + вызов).
- `grep -c "announce.txt" xrayebator` ≥ 3 (в edit_happ_announce_menu + в subhttp.sh heredoc).
- `grep -c "ANNOUNCE_FILE\|ANNOUNCE_HEADER\|ANNOUNCE_COMMENT" xrayebator` ≥ 6 (subhttp.sh heredoc).
- `grep -c "base64:" xrayebator` ≥ 2 (header + body comment в subhttp.sh).
- Manual smoke (после регистрации edit_happ_announce_menu и регенерации subhttp.sh):
  - `echo "Тестовое объявление от оператора" | sudo tee /usr/local/etc/xray/announce.txt`
  - `sudo /usr/local/etc/xray/subhttp.sh /test_token` (или curl к subscription URL) → response содержит `announce: base64:0KLQtdGB...` header И body содержит `#announce: base64:0KLQtdGB...` comment.
  - `sudo rm /usr/local/etc/xray/announce.txt` → ответ subhttp.sh БЕЗ announce-строк.
- Smoke через меню: `sudo xrayebator` → пункт 9 (Подписка HAPP) → пункт 5 (Настроить announcement) → ввести текст → сохранить → vim /usr/local/etc/xray/announce.txt содержит текст; subhttp.sh регенерирован (grep ANNOUNCE_FILE /usr/local/etc/xray/subhttp.sh дает совпадение).
  </verify>
  <done>
- edit_happ_announce_menu реализована: GET текущего состояния, SET (с truncation на 200 char + newline strip), CLEAR (rm announce.txt), atomic write через mktemp+mv с chown xray:xray.
- Пункт 5 «Настроить announcement (HAPP)» зарегистрирован в happ_subscription_menu.
- subhttp.sh heredoc обновлен — ANNOUNCE_FILE check на непустой, base64 -w0 encoding, header + body comment в response (empty файл → не эмиттит ничего).
- После каждого изменения announce.txt происходит auto-regen subhttp.sh если установлен.
- REQ-E04 удовлетворен.
  </done>
</task>

</tasks>

<verification>
**Plan 8.1 верификация (все после исполнения 3 задач):**

```bash
# Syntax check
bash -n xrayebator
bash -n install.sh
bash -n update.sh

# Migration registered
grep -n "run_migration.*sni_list_2026" xrayebator
# должен показать ровно 1 результат внутри main_menu()

# KNOWN_DEFAULTS_v1 hardcoded
grep -c "KNOWN_DEFAULTS_v1" xrayebator
# ≥ 2

# SNI list updated
grep -c "online.uralsib.ru\|online.vtb.ru\|www.cdek.ru\|www.pochta.ru\|www.avito.ru" sni_list.txt
# == 5
grep -c "apple.com\|icloud.com" sni_list.txt
# == 0
grep -c "github.com" sni_list.txt
# ≥ 2

# CLI dispatch
grep -c "probe-test)" xrayebator
# == 1 (case-ветка)

# manage_profile_menu hub + Vision Seed submenu
grep -c "manage_profile_menu" xrayebator
# ≥ 2 (определение + 4) вызов в main_menu)
grep -c "manage_profile_advanced_menu" xrayebator
# ≥ 2 (определение + вызов из submenu)
grep -c "testpre\|testseed" xrayebator
# ≥ 6
grep -c "4) manage_profile_menu" xrayebator
# == 1

# HAPP announce
grep -c "edit_happ_announce_menu" xrayebator
# ≥ 2 (определение + 5) вызов)
grep -c "announce.txt" xrayebator
# ≥ 3 (edit menu + subhttp.sh heredoc + auto-regen note)
```

**Manual smoke на dev/VPS (последовательно):**

1. `sudo xrayebator probe-test` — выводит pretty-table SNI/HTTP/TLS/latency + summary.
2. `sudo xrayebator` — main_menu загружается, миграция `.sni_list_2026` отрабатывает (touch marker `/usr/local/etc/xray/.sni_list_2026`), либо предлагает probe-test перед миграцией.
3. Меню 4 (Управление профилем) — picker → submenu (1-4 + 0) → 4 Vision Seed: RED warning + y/N default N + при y → ввод testpre/testseed → confirm → applied (jq verify).
4. Меню 9 → 5 (Announcement) — set текст → проверить /usr/local/etc/xray/announce.txt + проверить что subhttp.sh содержит ANNOUNCE_FILE логику.
5. curl к subscription URL → response содержит `announce: base64:...` header когда файл непустой.
</verification>

<success_criteria>
1. `bash -n xrayebator install.sh update.sh` — проходит без ошибок.
2. **REQ-E01** удовлетворен: миграция `.sni_list_2026` через `run_migration`, KNOWN_DEFAULTS_v1 защищает user-custom, sni_list.txt содержит требуемые домены (online.uralsib.ru, online.vtb.ru, www.cdek.ru, www.pochta.ru, www.avito.ru priority 1; github.com priority 3) без apple/icloud и без twitch/microsoft/live.com.
3. **REQ-E02** удовлетворен: `sudo xrayebator probe-test` запускается standalone, выводит pretty-table, double-check (openssl s_client TLS 1.3 + curl). Auto-prompt перед миграцией .sni_list_2026.
4. **REQ-E03** удовлетворен: manage_profile_menu доступен как пункт 4 в main_menu (заменяет старые 4-6), manage_profile_advanced_menu — hidden submenu внутри hub (пункт 4 в action submenu); RED-warning + Xray-core version check + uncertain testpre disclosure, immediate apply через safe_jq_write обоих файлов + safe_restart_xray.
5. **REQ-E04** удовлетворен: edit_happ_announce_menu в happ_subscription_menu (пункт 5), атомарная запись announce.txt, auto-regen subhttp.sh, корректная emit `announce: base64:...` headers/body comments.
6. CRITICAL UX: prompt testpre содержит подсказку про server-side parsed-but-not-used (см. RESEARCH §Pitfall + §SC-1).
7. `online.uralsib.ru` (НЕ `lk.usbank.ru`) — корректное название в sni_list.txt.
8. Все user-facing строки на русском без буквы «е с двумя точками».
9. Файл xrayebator все еще передает `bash -n`; CLI dispatcher не сломан (xrayebator update + xrayebator menu все еще работают); existing change_sni_menu / change_fingerprint_menu / change_port_menu все еще callable из submenu.
</success_criteria>

<output>
After completion, create `.planning/phases/08-polish-sni-vision-bypass-routing/08-01-SUMMARY.md` using the standard SUMMARY template. Include:
- Decisions: KNOWN_DEFAULTS_v1 содержимое, structure миграции `.sni_list_2026`, CLI ветка размещение, manage_profile_menu hub + Vision Seed как hidden submenu (REQ-E03 буква CONTEXT.md), main_menu консолидация (4 = hub, 5-6 убраны), edit_happ_announce_menu auto-regen subhttp.sh поведение.
- Patterns: probe_sni timeout 8s, atomic mv pattern для plain text, RED-warning template, hub-menu pattern (profile picker → action submenu).
- Invariants: KNOWN_DEFAULTS_v1 как single-source-of-truth для v1.0 SNI; probe_test_command — CLI-only (НЕТ menu-item); subhttp.sh auto-regen после announce.txt write; manage_profile_advanced_menu принимает profile_name как аргумент (НЕ имеет собственного picker'а).
- Files: xrayebator (+ список новых функций), sni_list.txt (+ delta).
</output>
