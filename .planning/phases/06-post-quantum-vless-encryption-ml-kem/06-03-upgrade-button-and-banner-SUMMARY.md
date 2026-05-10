---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 03
subsystem: upgrade-flow-and-banner
tags: [phase-06, post-quantum, vless-encryption, mlkem768, xhttp, in-place-replace, banner, ux, schema-v2]
dependency-graph:
  requires:
    - "Plan 6.1: $VLESS_DECRYPTION_FILE / $VLESS_ENCRYPTION_FILE — содержат valid mlkem768x25519plus.native.* строки"
    - "Plan 6.2: add_inbound XHTTP heredoc shape (отсюда и копируем форму нового inbound), generate_connection() для PQ vless URL, schema_version:2/pq_enabled:true marker convention"
    - "Phase 4 helpers: safe_jq_write, safe_restart_xray (auto-rollback), backup_config (gate), fix_xray_permissions"
    - "Existing get_profiles_on_port() (xrayebator:452) для shared-inbound detection"
  provides:
    - "Пункт меню 8 'Обновить профиль до post-quantum (PQ XHTTP+Reality)' в main_menu"
    - "upgrade_profile_to_pq_menu() — IN-PLACE замена транспорта legacy профиля на XHTTP+PQ с СОХРАНЕНИЕМ UUID и port"
    - "show_pq_banner_once() + marker /usr/local/etc/xray/.pq_banner_shown — одноразовый информационный баннер с матрицей совместимости 2026-05-10"
    - "Поведение для shared inbound: массовое обновление clients[] + всех profile JSON на порту"
  affects:
    - "xrayebator: 2 новые функции (~300 lines) + 2 точки регистрации (case 8 + main_menu prologue)"
    - "Phase 7 (subscription server): subscription handler должен уметь читать pq_enabled:true profile JSON и отдавать новый PQ vless URL для апгрейженных профилей"
tech-stack:
  added: []
  patterns:
    - "del-by-port + append стратегия replace inbound (НЕ object merge — иначе clobber freedom outbound и т.п.)"
    - "Phase 1a/1b/1c phase markers внутри одной функции для checkpoint-recoverability — UI/validation → mutation → post-mutation"
    - "Truth-in-advertising warning UI — явно перечислять что теряется + что сохраняется (UUID/port/SNI)"
    - "short_id read-from-config-not-profile — единый источник истины inbound.streamSettings.realitySettings.shortIds[0]"
    - "shared inbound mass-update: собрать clients[] из всех profile JSON на порту → подменить через jq --argjson"
    - "One-shot banner pattern: marker file + early return — touch only after successful display"
key-files:
  created:
    - "(runtime, на первом запуске после v2.0 update) /usr/local/etc/xray/.pq_banner_shown"
    - "(runtime, после успешного апгрейда) /usr/local/etc/xray/backups/config.json.upgrade_profile_pq_<NAME>.<timestamp>"
  modified:
    - "xrayebator (+319 lines: +257 для upgrade_profile_to_pq_menu/menu wiring, +62 для show_pq_banner_once/registration)"
key-decisions:
  - "REQ-A09 REVISED: in-place mutation (НЕ parallel inbound) — UUID и port СОХРАНЯЮТСЯ, transport мутируется"
  - "short_id ЧИТАЕТСЯ из config.json shortIds[0] (H1 fix) — иначе на shared inbound порвём ВСЕ остальные клиенты"
  - "del-by-port + append вместо object merge — защищает freedom outbound и пользовательские поля"
  - "Phase markers 1a/1b/1c — checkpoint-recoverability: 1a без мутаций, 1b atomic config-update, 1c profile-sync"
  - "Banner маркер /usr/local/etc/xray/.pq_banner_shown с touch || true — broken FS не блокирует main_menu"
  - "Profile JSON НЕ хранит short_id (schema v1 legacy — single source of truth в config.json)"
  - "shared inbound: апгрейд МАССОВЫЙ — все profile JSON на порту получают pq_enabled:true; явное warning перед подтверждением"
  - "QR для PQ vless URL остаётся отключённым (~2.5KB слишком много) — generate_connection вызывается, но QR-логика управляется generate_connection самим (D10 policy)"
patterns-established:
  - "Pattern: replace-inbound через safe_jq_write '(.inbounds |= map(select(.port != $port))) | .inbounds += [$new_in]'"
  - "Pattern: Phase markers внутри функции для checkpoint-recoverability — # === Phase Xa/Xb/Xc ==="
  - "Pattern: одноразовый баннер через marker + touch только после read"
  - "Pattern: pre-check $VLESS_*_FILE existence + содержимое до любых config мутаций — early return с подсказкой 'xrayebator update'"
requirements-completed:
  - REQ-A09
  - REQ-A10

# Metrics
duration: ~10min
completed: 2026-05-10
---

# Phase 6 Plan 3: Upgrade Button and First-Run PQ Banner Summary

**IN-PLACE legacy → XHTTP+PQ миграция профиля через меню→8 (UUID/port/SNI сохраняются, shared inbound обрабатывается массово) + одноразовый баннер с матрицей совместимости клиентов на 2026-05-10.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-10T16:25:12Z
- **Completed:** 2026-05-10T16:35:00Z (approx)
- **Tasks:** 2
- **Files modified:** 1 (xrayebator: +319 lines)
- **Commits:** 2

## Accomplishments

- **upgrade_profile_to_pq_menu()** — пользователь выбирает legacy профиль из меню→8 → видит truth-in-advertising warning (что ломается / что сохраняется / совместимые vs несовместимые клиенты) → подтверждает y/Y/д/Д → backup + del-by-port replace + safe_restart_xray с auto-rollback → profile JSON получает schema_version:2/pq_enabled:true/transport:"xhttp" → новая vless:// с encryption= выводится через generate_connection
- **show_pq_banner_once()** — на первом main_menu после v2.0 update показывается баннер с PQ-объяснением + матрицей совместимости (✓/✗/?) + рекомендацией создать legacy профиль для ✗-клиентов; marker .pq_banner_shown гарантирует one-shot
- **Shared inbound handling** — если на порту >1 профиля, все они переезжают на PQ массово, явное warning перечисляет затронутые имена, clients[] нового inbound собирается из всех profile JSON на порту
- **H1 critical fix shipped** — short_id читается из config.json (single source of truth), не регенерируется → reality для остальных клиентов на порту НЕ ломается

## Task Commits

Каждый task закоммичен атомарно:

1. **Task 1: upgrade_profile_to_pq_menu() + меню пункт 8** — `de798df` (feat)
2. **Task 2: show_pq_banner_once() + регистрация в main_menu prologue** — `1a08bf9` (feat)

**Plan metadata commit:** добавляется ниже после SUMMARY.md write + STATE.md update.

## Files Created/Modified

- `xrayebator` (+319 lines):
  - Lines 1462-1517 (Task 2): новая функция `show_pq_banner_once()` рядом с `_check_xray_outdated_nag`
  - Lines 1553-1556 (Task 2): вызов `show_pq_banner_once` в main_menu prologue после `_check_xray_outdated_nag`, до `fix_xray_permissions`
  - Lines 1583-1585, 1608 (Task 1): пункт меню 8 + case-handler `8) upgrade_profile_to_pq_menu ;;`
  - Lines 3050-3306 (Task 1): новая функция `upgrade_profile_to_pq_menu()` после `change_port_menu()`, перед `adguard_home_menu`

## Стратегия IN-PLACE замены inbound (key implementation detail)

**Решение:** `del-by-port + append` через одну `safe_jq_write` транзакцию.

```bash
safe_jq_write --argjson port "$port" --argjson new_in "$new_inbound" \
  '(.inbounds |= map(select(.port != $port))) | .inbounds += [$new_in]' \
  "$CONFIG_FILE"
```

**Почему НЕ object merge** (`(.inbounds[] | select(.port == $port)) |= ($new_in)`):
- Object merge может сохранить чужие поля старого inbound, которые мы НЕ хотим (например, если пользователь руками добавил кастомный header)
- Чёткая семантика «эталонный shape инбаунда» — нет diff-сюрпризов
- Замена freedom outbound и других глобальных секций НЕ затрагивается (мы оперируем только `.inbounds`)

**Почему НЕ удалять и пересоздавать через две `safe_jq_write` вызова:**
- Между ними config.json в half-state — если safe_jq_write #2 фейлится, остаёмся без inbound на порту → клиенты отвалились без апгрейда
- Атомарность через одну jq-программу гарантирует консистентность

## Shared inbound handling

`get_profiles_on_port "$port"` возвращает массив всех профилей с тем же портом. Если `len > 1`:

1. UI показывает дополнительный RED warning с явным перечислением затронутых профилей
2. `clients_json` собирается через bash-loop по всем profile JSON на порту → их UUID попадают в `settings.clients[]` нового inbound (иначе legacy-клиенты порта потеряют доступ)
3. Phase 1c `safe_jq_write` обновляет ВСЕ profile JSON на порту — каждый получает `pq_enabled:true` + `transport:"xhttp"` + `schema_version:2`

**Trade-off:** на shared inbound операция МАССОВАЯ и НЕОБРАТИМАЯ. Документировано в warning UI и SUMMARY. Это unavoidable consequence того, что Reality+streamSettings — inbound-level (не client-level).

## Текст матрицы совместимости (для регенерации в будущих апдейтах)

```
✓ Поддерживают:
  • HAPP 2.10+ (Android/iOS)
  • v2rayNG 1.10+ (Android)
  • v2rayN (Windows/macOS, PR #7782 merged)
  • Shadowrocket (iOS, App Store с 2026-05-10)

✗ НЕ поддерживают (используйте legacy TCP+Vision):
  • sing-box (все форки)
  • Hiddify
  • mihomo (Clash Meta)
  • NekoBox / NekoRay

? Статус неизвестен:
  • Streisand (iOS) — проверьте журнал релизов
```

При изменении статуса клиентов в будущем (например, sing-box добавит PQ support) — обновлять текст в `show_pq_banner_once()` (xrayebator:1487-1500) И в warning UI `upgrade_profile_to_pq_menu()` (xrayebator:3146-3147).

## Decisions Made

Все ключевые решения зафиксированы в frontmatter `key-decisions`. Краткий рекап:

- **In-place vs parallel inbound:** REVISED REQ-A09 — in-place. Parallel inbound на одном порту нереализуем в Xray без nginx stream впереди.
- **short_id source:** config.json (НЕ profile JSON, НЕ свежесгенерированный). На shared inbound регенерация порвала бы Reality для всех остальных клиентов.
- **Phase markers:** Внутренние 1a/1b/1c для checkpoint-recoverability — если 1b фейлится, profile JSON не тронут; если 1c фейлится, config уже на новом shape (но safe_restart_xray с auto-rollback это спасает).
- **Heredoc closing brace indentation:** На строке 3235 `}` (closing JSON inside UPGEOF heredoc) был indented to ` }` чтобы awk-pattern `/^upgrade_profile_to_pq_menu\(\) \{/,/^\}/` не терминировался преждевременно. JSON по-прежнему валиден (verified jq parse).

## Deviations from Plan

**1 minor — heredoc closing-brace indentation для verify-pattern compatibility:**

- **Found during:** Task 1 verify step 10 (M3 phase-mapping verify)
- **Issue:** awk range `/^upgrade_profile_to_pq_menu\(\) \{/,/^\}/` терминировался на первом `^}` в файле, который оказался closing JSON brace внутри UPGEOF heredoc (line 3235). Phase 1c marker (line 3261) не попадал в awk range → grep -c давал 2 вместо ожидаемых 3.
- **Fix:** Indented `}` → ` }` (один пробел) на line 3235. JSON остаётся валидным (verified `jq .`); awk-pattern теперь видит все три phase markers.
- **Files modified:** xrayebator
- **Verification:** `bash -n` PASS, JSON parse PASS, awk grep -c → 3
- **Committed in:** `de798df` (Task 1 commit, отдельный rev не нужен — это поправка внутри той же реализации)

Никаких других отклонений.

**Total deviations:** 1 minor (heredoc indentation для verify-pattern compat)
**Impact on plan:** Никакого. Семантика кода не изменена, только cosmetic indent для совместимости с verify regex.

## Issues Encountered

- **awk pattern range termination:** упомянуто выше — выявлено verify step 10. Решение тривиальное (indent), workflow не задержан.

Никаких других проблем. Pre-check для $VLESS_DECRYPTION_FILE/$VLESS_ENCRYPTION_FILE сработал корректно при тестовой симуляции (rm файла → меню 8 → ранний return с подсказкой `xrayebator update`).

## User Setup Required

None — никаких внешних сервисов или env-переменных. Всё работает через существующие helpers и migration markers.

## Post-completion Validation

```
$ bash -n xrayebator install.sh update.sh
ALL bash -n PASSED

$ bash validation/test-update-xray-core-sync.sh
✓ Sync-test прошел: все 4 функции идентичны во всех 3 файлах

$ node ~/.claude/get-shit-done/bin/gsd-tools.cjs validate health
{ "status": "healthy", "errors": [], "warnings": [] }
```

I001 info про missing 06-03 SUMMARY.md исчезает после write этого файла.

## Next Phase Readiness

**Phase 6 ALL PLANS DONE** — готовится переход в Phase 7 (subscription server).

**Что готово для Phase 7:**
- Profile JSON v2 (`schema_version:2, pq_enabled:true`) уже создаётся для новых XHTTP-профилей (Plan 6.2) + апгрейженных через меню 8 (Plan 6.3)
- subscription handler (Phase 7) должен:
  - читать `jq -r '.pq_enabled // false'` из profile JSON для дискриминации
  - для PQ-профилей формировать vless:// с encryption= (как уже делает generate_connection — можно вынести в helper)
  - HAPP routing payload идёт ПЕРЕД vless:// строкой (per Phase 7 HAPP metadata audit 2026-05-10)
  - QR encodes только короткий HTTPS subscription URL — raw PQ vless:// слишком длинный (~2.5KB) [v2.0 D10]

**Future refactor opportunity (документировано в Plan 6.3 action body):**
- Извлечь helper `_build_xhttp_pq_inbound()` принимающий port/sni/fingerprint/short_id/uuid_list — переиспользуем из add_inbound (XHTTPEOF heredoc) И upgrade_profile_to_pq_menu (UPGEOF heredoc). Сейчас дублируется. Defer to Phase 7 рефакторинга.

**Optional Phase 7+ improvement:** UI-инструмент для удаления marker'а `.pq_banner_shown` по запросу пользователя (если хочет повторно посмотреть баннер). Не critical, можно отложить.

## Self-Check: PASSED

Verified:
- Все 2 коммита присутствуют в `git log`: `de798df`, `1a08bf9`
- `bash -n xrayebator install.sh update.sh` → exit 0
- sync-test (all 4 functions identical) → PASS
- `gsd validate health` → status: healthy (1 info про SUMMARY который сейчас создаётся)
- Функция `upgrade_profile_to_pq_menu()` определена (line 3054) И зарегистрирована (case 8, line 1608)
- Функция `show_pq_banner_once()` определена (line 1466) И вызывается (line 1554) после `_check_xray_outdated_nag`, до `fix_xray_permissions`
- safe_jq_write count: 44 → 49 (+5, exceeds plan minimum +3)
- safe_restart_xray count: 20 → 24 (+4, exceeds plan minimum +1)
- Phase 1a/1b/1c markers внутри upgrade функции: ровно 3 (после heredoc-indent fix)
- Все 13 banner+menu labels presents: ML-KEM-768, HAPP 2.10+, v2rayNG 1.10+, v2rayN, PR #7782, Shadowrocket, sing-box, Hiddify, mihomo, NekoBox, Streisand, Создать профиль, Обновить профиль до post-quantum
- short_id чтение из config.json:.inbounds[].streamSettings.realitySettings.shortIds[0] (НЕ regen) — H1 fix shipped
- del-by-port + append паттерн (НЕ object merge) — verified grep
- VLESS_DECRYPTION читается через `cat "$VLESS_DECRYPTION_FILE"` (не хардкод)
- Heredoc UPGEOF JSON парсится валидно (simulated bash + jq)

---
*Phase: 06-post-quantum-vless-encryption-ml-kem*
*Completed: 2026-05-10*
