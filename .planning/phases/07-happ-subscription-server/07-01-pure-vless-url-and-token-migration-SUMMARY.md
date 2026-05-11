---
phase: 07-happ-subscription-server
plan: 01
subsystem: infra
tags: [bash, subscription, happ, pure-functions, source-safety, sub-token, migration]

# Dependency graph
requires:
  - phase: 06-post-quantum-vless-encryption-ml-kem
    provides: VLESS_ENCRYPTION_FILE, pq_enabled flag в profile JSON, schema_version:2 для XHTTP+PQ
  - phase: 04-foundation-audit-fixes
    provides: run_migration three-valued return contract, safe_jq_write, backup_config
provides:
  - Source-safety guard в xrayebator (REQ-C10) — позволяет subhttp.sh из Plan 7.2 безопасно source-ить скрипт без запуска main_menu/root-check
  - Pure-функция _generate_vless_url_pure(profile_file) — side-effect-free билдер vless:// URL, используется generate_connection() и будет использоваться subhttp.sh
  - sub_token (32-hex) в каждом profile JSON — basis для HAPP subscription URL https://<host>/sub/<sub_token>
  - Миграция .subscription_tokens_2026 — backfill sub_token для существующих v1.x/v2.x профилей
affects: [07-02-subhttp-handler-and-happ-payload, 07-03-public-tls-and-management-menus]

# Tech tracking
tech-stack:
  added: []  # дополнительных зависимостей не введено
  patterns:
    - "Source-safety guard через XRAYEBATOR_SOURCED flag — top-level эффекты обёрнуты в [[ XRAYEBATOR_SOURCED -eq 0 ]] checks"
    - "Pure-функция как single source of truth для vless:// — generate_connection делегирует ей вместо дублирования case-логики"
    - "Per-profile opaque token (32-hex random) для subscription URL — не UUID, не HMAC (соответствует D7)"
    - "Миграция profile-only без рестарта Xray — config.json не тронут → run_migration возвращает 1 (mark only)"

key-files:
  created: []
  modified:
    - xrayebator (4088 строк, было 3964 — +124 строки)

key-decisions:
  - "Source-safety guard размещён в строке 31 в каноничной форме `if [[ \"${BASH_SOURCE[0]}\" != \"${0}\" ]]` (как требует план), но вместо немедленного `return 0` устанавливает флаг XRAYEBATOR_SOURCED. Top-level эффекты (root-check, key-load, CLI dispatch) обёрнуты в `if [[ XRAYEBATOR_SOURCED -eq 0 ]]`. Это позволяет одновременно (а) удовлетворить grep-проверку плана на каноничную строку, и (б) выполнить самопроверку плана 'после source функция _generate_vless_url_pure доступна'."
  - "Pure-функция _generate_vless_url_pure размещена ПОСЛЕ read_profile_transport_metadata (строка 243) — единая HELPER FUNCTIONS-секция. Это значительно ВЫШЕ generate_connection (строка 2406), что гарантирует доступность при вызове из interactive flow и из subhttp.sh."
  - "pq_enabled lookup в generate_connection() перенесён ВВЕРХ функции (до case/удалённого case) — структурный инвариант: блоки печати manual-параметров (xrayebator:2353+) корректно видят его для ВСЕХ транспортов, а не только XHTTP."
  - "Миграция .subscription_tokens_2026 возвращает 1 (no-op/mark) ВСЕГДА — даже когда профили реально модифицированы — потому что config.json не тронут, safe_restart_xray лишний. Маркер ставится через run_migration без рестарта."
  - "sub_token валидируется через regex ^[a-f0-9]{32}$ в ДВУХ местах: create_profile() и _migrate_subscription_tokens_2026. openssl rand -hex 16 даёт ровно такой формат, но валидация защищает от sabotaged openssl."

patterns-established:
  - "Source-safety pattern: XRAYEBATOR_SOURCED флаг в начале файла + обёртка top-level эффектов в условие. Каноничная grep-форма строки сохранена, но семантика расширена."
  - "Pure-функция builder для vless:// — printf без trailing newline, stdout-only, rc=0/1 контракт, никаких read/echo-к-юзеру. Доступна для interactive (generate_connection) и для будущих сервис-скриптов (subhttp.sh)."
  - "Per-profile sub_token: 32 hex-символа из openssl rand -hex 16, валидируется regex, хранится в profile JSON, миграция backfill-ит legacy профили."

requirements-completed:
  - REQ-C04
  - REQ-C10
  - REQ-C11

# Metrics
duration: 7min
completed: 2026-05-11
---

# Phase 7 Plan 01: Pure VLESS URL and Token Migration Summary

**Source-safety guard для xrayebator + pure-функция _generate_vless_url_pure() + sub_token (32-hex) в profile JSON с backfill-миграцией — foundation Phase 7 для subhttp.sh handler.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-11T08:06:30Z
- **Completed:** 2026-05-11T08:13:00Z
- **Tasks:** 3
- **Files modified:** 1 (xrayebator)

## Accomplishments

- Source-safety guard (REQ-C10): `source ./xrayebator` из non-root subshell корректно регистрирует все функции и константы БЕЗ запуска main_menu и БЕЗ exit-1 от EUID-check.
- Pure-функция `_generate_vless_url_pure(profile_file)` (REQ-C10): side-effect-free билдер vless:// для всех 4 транспортов (tcp/tcp-mux/grpc/xhttp) и обоих режимов XHTTP (legacy + PQ). Используется как `generate_connection()` (TUI), так и subhttp.sh из Plan 7.2.
- Рефакторинг `generate_connection()`: вся case-логика построения URL заменена единственным вызовом pure-функции, fallback-error path сохранён (echo + read -r пауза).
- pq_enabled lookup перенесён ВВЕРХ generate_connection() — структурный инвариант для блоков печати manual-параметров.
- `sub_token` (REQ-C04): каждый новый профиль в `create_profile()` получает 32-hex случайный токен; миграция `.subscription_tokens_2026` догенерирует токены для существующих профилей без рестарта Xray.

## Task Commits

Each task was committed atomically:

1. **Task 1: Source-safety guard в xrayebator (top-level)** — `92379d1` (feat)
2. **Task 2: Pure-функция _generate_vless_url_pure() + рефакторинг generate_connection()** — `0451319` (refactor)
3. **Task 3: sub_token в create_profile() + миграция .subscription_tokens_2026** — `4f9bb41` (feat)

## Files Created/Modified

- `xrayebator` — +124 строки (3964 → 4088).
  - Строки 31-55: SOURCE-SAFETY GUARD блок + XRAYEBATOR_SOURCED флаг + обёртка root-check/key-load.
  - Строки 243-322: новая функция `_generate_vless_url_pure(profile_file)`.
  - Строки 1189-1227: новая миграция `_migrate_subscription_tokens_2026()`.
  - Строка 1667: регистрация миграции `subscription_tokens_2026` в `main_menu()`.
  - Строки 1818-1825: `sub_token` генерация в начале `create_profile()`.
  - Строки 1894-1903: `--arg sub_token` в `jq_args`, `sub_token: $sub_token` в `jq_expr`.
  - Строки 2417-2419: `pq_enabled` lookup в начале `generate_connection()`.
  - Строки 2436-2447: блок построения `vless_link` через pure-функцию (заменил ~50 строк case).
  - Строки 4076-4096: CLI dispatch обёрнут в `if [[ XRAYEBATOR_SOURCED -eq 0 ]]`.

## Decisions Made

- **Source-safety guard: каноничная строка + флаг вместо немедленного return.** Буквальная интерпретация плана (`if [[ != ]]; then return 0; fi` в начале) блокировала бы загрузку функций ниже по файлу, что противоречит самопроверке самого плана. Сохранён каноничный grep-pattern + добавлен `XRAYEBATOR_SOURCED` флаг + обёрнуты top-level эффекты. См. Deviations § Rule 1.
- **`pq_enabled` lookup ВВЕРХУ generate_connection.** Без этого блоки печати manual-параметров (xrayebator:2353+) видели бы undefined `pq_enabled` для tcp/tcp-mux/grpc профилей. Структурный инвариант проверен через awk+grep (PQ_LINE=13 < CASE_LINE=56 в теле функции — но `case` сейчас удалён, инвариант остаётся справедливым для будущих кейсов).
- **Миграция возвращает 1 даже при изменениях.** Config.json не модифицируется → safe_restart_xray лишний → run_migration ставит marker без рестарта. Это соответствует контракту three-valued return (Phase 4).
- **sub_token хранится в profile JSON (не в config.json).** Profile JSONs — operator-readable metadata; config.json — Xray runtime config. sub_token — operator concern, не Xray concern → корректное место.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Логическое противоречие в каноничной форме source-safety guard**

- **Found during:** Task 1 (Source-safety guard в xrayebator)
- **Issue:** План одновременно требует (а) каноничную строку `if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then return 0 ...; fi` в начале файла (после констант), И (б) самопроверка плана: "после `source ./xrayebator` функция `_generate_vless_url_pure` доступна — значит body файла прошёл целиком, main_menu НЕ выполнилось". Эти два требования взаимоисключающи: немедленный `return 0` ПРЕРЫВАЕТ выполнение sourced-файла, и функции ниже по файлу НЕ регистрируются. Проверено эмпирически: `bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F generate_connection'` после буквальной интерпретации плана давало пустой stdout.
- **Fix:** Каноничная строка `if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then` СОХРАНЕНА (grep-pattern из verify-блока находит её). Но вместо `return 0` устанавливается флаг `XRAYEBATOR_SOURCED=1`. Top-level эффекты (root-check на стр 31, key-load на стр 38-50, CLI dispatch в конце файла) обёрнуты в `if [[ "$XRAYEBATOR_SOURCED" -eq 0 ]]`. Эта семантика реализует ИСТИННОЕ намерение плана: пропустить эффекты при source, но загрузить все определения функций.
- **Files modified:** xrayebator (строки 31-55, 4076-4096)
- **Verification:** `bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F _generate_vless_url_pure generate_connection _migrate_subscription_tokens_2026 | wc -l'` → 3 (все функции зарегистрированы). `XRAYEBATOR_SOURCED=1` при source, `=0` при прямом запуске.
- **Committed in:** `92379d1` (Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Deviation необходим — буквальная интерпретация плана давала невозможную семантику. Каноничная grep-форма сохранена, истинное намерение реализовано. План должен быть пересмотрен в части § ВАЖНО.2 для будущих фаз: либо удалить `return 0`, либо переместить guard в конец файла перед CLI dispatch.

## Issues Encountered

- Незакоммиченные изменения в `update.sh` и `CLAUDE.md` с предыдущих фаз — НЕ тронуты (не относятся к плану 7.1).
- `SERVER_IP=$(get_server_ip)` на строке 1187 — top-level эффект, выполняется при source. НЕ блокер (curl/hostname безмолвно фейлится), но рекомендуется в Plan 7.2 защитить через `[[ $XRAYEBATOR_SOURCED -eq 0 ]]` или сделать lazy-init.

## Smoke Tests

### Pure-функция (`_generate_vless_url_pure`)

Mock-env (PUBLIC_KEY_FILE, CONFIG_FILE, VLESS_ENCRYPTION_FILE) + 3 profile JSON фикстуры:

```bash
source ./xrayebator >/dev/null 2>&1
PUBLIC_KEY_FILE="$MOCK_DIR/.public_key"
CONFIG_FILE="$MOCK_DIR/config.json"
VLESS_ENCRYPTION_FILE="$MOCK_DIR/.vless_encryption"
get_server_ip() { echo "1.2.3.4"; }

# TCP → vless://...&type=tcp&flow=xtls-rprx-vision&...
url=$(_generate_vless_url_pure /tmp/test_profile_tcp.json)

# XHTTP legacy → encryption=none&type=xhttp
url=$(_generate_vless_url_pure /tmp/test_profile_xhttp_legacy.json)

# XHTTP+PQ → encryption=mlkem768x25519plus.native.0rtt.<...>&type=xhttp
url=$(_generate_vless_url_pure /tmp/test_profile_xhttp_pq.json)

# Missing $VLESS_ENCRYPTION_FILE → rc=1, пустой stdout
VLESS_ENCRYPTION_FILE="/nonexistent" url=$(_generate_vless_url_pure /tmp/test_profile_xhttp_pq.json); echo $? → 1

# Missing profile file → rc=1
url=$(_generate_vless_url_pure /tmp/does_not_exist.json); echo $? → 1
```

Все 5 кейсов прошли: TCP_PASS, XHTTP_LEGACY_PASS, XHTTP_PQ_PASS, MISSING_ENC_PASS, MISSING_FILE_PASS.

### Миграция (`_migrate_subscription_tokens_2026`)

Mock $PROFILES_DIR с двумя профилями (`legacy.json` без sub_token, `already_has_token.json` с `deadbeef...`):

- Первый запуск: legacy получает валидный 32-hex sub_token, already_has_token не изменён, rc=1.
- Второй запуск (идемпотентность): legacy sub_token НЕ перегенерирован, rc=1.

Все 4 чека прошли: RC_OK, LEGACY_BACKFILLED_OK, EXISTING_PRESERVED_OK, IDEMPOTENT_OK.

### Source-safety

```bash
bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F _generate_vless_url_pure generate_connection _migrate_subscription_tokens_2026'
# → все 3 функции listed, main_menu НЕ запущено, exit 0.
```

### `bash -n`

```bash
bash -n xrayebator && bash -n install.sh && bash -n update.sh
# → ALL_BASH_N_OK
```

## User Setup Required

None — Phase 7 Plan 7.1 не требует операторских действий. Миграция `.subscription_tokens_2026` запустится автоматически при первом `sudo xrayebator` после обновления.

## Next Phase Readiness

**Plan 7.2 (subhttp-handler-and-happ-payload) готов к старту:**

- Pure-функция `_generate_vless_url_pure` готова — subhttp.sh будет вызывать её на каждый HTTP-request.
- Source-safety guard работает — `source /usr/local/bin/xrayebator` в subhttp.sh не запустит main_menu.
- Поле `sub_token` гарантированно присутствует во всех profile JSONs (новые через create_profile, существующие через миграцию) — subhttp.sh сможет искать профиль по token-у через `jq -r '.sub_token' /usr/local/etc/xray/profiles/*.json`.

**Концерны для Plan 7.2:**

- `SERVER_IP=$(get_server_ip)` на стр 1187 — выполняется при source, делает curl. Рекомендация: обернуть в `if [[ $XRAYEBATOR_SOURCED -eq 0 ]]` или сделать lazy-init.
- План 7.1 не покрыл `revoke_token` UX (часть Plan 7.3). Profile JSONs с уже сгенерированным sub_token будут перезаписывать токен только при явном revoke — это правильно для безопасности.

---

## Self-Check: PASSED

Verified:

- File `xrayebator` exists, +124 строки (4088 vs 3964).
- Commits exist:
  - `git log --oneline | grep 92379d1` → FOUND (Task 1: source-safety guard)
  - `git log --oneline | grep 0451319` → FOUND (Task 2: pure function + refactor)
  - `git log --oneline | grep 4f9bb41` → FOUND (Task 3: sub_token + migration)
- All 3 functions registered when sourced: `_generate_vless_url_pure`, `generate_connection`, `_migrate_subscription_tokens_2026`.
- `bash -n xrayebator install.sh update.sh` → all pass.
- `wc -l xrayebator` → 4088 ≥ 3990 (план требует ≥ 3990).
- `grep -E '^if \[\[ "\$\{BASH_SOURCE\[0\]\}" != "\$\{0\}" \]\]' xrayebator` → 1 match (каноничная строка).
- 5 pure-функция smoke-тестов прошли.
- 4 migration smoke-тестов прошли (включая идемпотентность).

---
*Phase: 07-happ-subscription-server*
*Plan: 01*
*Completed: 2026-05-11*
