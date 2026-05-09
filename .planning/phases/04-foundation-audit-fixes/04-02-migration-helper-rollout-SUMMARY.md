---
phase: 04-foundation-audit-fixes
plan: 02
subsystem: xrayebator (migration system)
tags: [migration, refactor, dry, backup, restart, idempotency]
dependency_graph:
  requires: []
  provides: [run_migration helper, centralized backup, three-valued contract, migration_failures aggregator]
  affects: [main_menu, migrate_xhttp_profiles, migrate_routing_config, migrate_xhttp_mode, migrate_xhttp_extra_restore, migrate_transport_profile_metadata, migrate_config_optimization]
tech_stack:
  added: []
  patterns: [three-valued return contract, centralized backup before mutation, idempotent marker touch]
key_files:
  created: []
  modified:
    - xrayebator
decisions:
  - "Three-valued return contract (0=changed/1=no-op/>=2=fail) вместо binary — устраняет 5 false-positive failures на v2.0+ системах"
  - "backup_config централизован в run_migration ДО вызова fn — устраняет race с auto-rollback safe_restart_xray"
  - "Per-migration restart (не один общий в конце) — маркер touch-ится только при успешном restart"
metrics:
  duration: "~12 min"
  completed: "2026-05-09T13:46:02Z"
  tasks_completed: 4
  files_modified: 1
---

# Phase 04 Plan 02: Migration Helper Rollout Summary

**One-liner:** `run_migration` helper с three-valued return contract + centralized `backup_config` — рефакторинг 6 миграционных функций и `main_menu()` для корректного маркер-менеджмента и DRY backup.

## What Was Built

### Task 1 — run_migration helper (lines 483-535)

Добавлен helper `run_migration <marker_basename> <description> <fn_name>` после `safe_restart_xray()` (~line 342), перед `migrate_transport_profile_metadata` (~line 537).

**Расположение:** xrayebator lines 483-535.

**Three-valued contract:**
- fn returns `0` = config changed → `safe_restart_xray` + `touch "$marker"`
- fn returns `1` = no-op → `touch "$marker"` БЕЗ restart (идемпотентность)
- fn returns `≥2` = fail → маркер НЕ touch-ится, миграция повторится

**Централизованный backup_config:** вызывается внутри run_migration ПОСЛЕ marker check, ДО вызова fn. Гарантирует что auto-rollback в safe_restart_xray всегда получает чистый pre-migration конфиг.

**Идемпотентность:** `if [[ -f "$marker" ]]; then return 0; fi` в самом начале — при повторных запусках skip без re-check.

### Task 2 — main_menu() рефакторинг (lines 897-922)

Заменены 6 `if/touch` блоков на 6 вызовов `run_migration ... || ((migration_failures++))`.

**Удалено из main_menu:**
- Переменная `needs_restart=false`
- 6 блоков `if [[ ! -f .marker ]]; then if migrate_X; then touch .marker; needs_restart=true; fi; fi`
- Финальный блок `if [[ "$needs_restart" == "true" ]]; then safe_restart_xray; sleep 2; fi`
- Все прямые `touch /usr/local/etc/xray/.<marker>` (0 осталось в main_menu)

**Добавлено:**
- `local migration_failures=0`
- 6 строк `run_migration "<marker>" "<desc>" <fn> || ((migration_failures++))`
- Aggregate report с `read -n 1 -p "Нажмите любую клавишу..."` (UX: пользователь не пропустит failure среди TUI вывода)

**Порядок миграций сохранён:** xhttp_profiles → routing → xhttp_mode → xhttp_extra → transport_meta → config_optimized.

### Task 3 — migrate_xhttp_profiles + migrate_transport_profile_metadata

**migrate_xhttp_profiles (lines 584-624):**
- Удалён `backup_config "xhttp_profiles"` (line 586 → comment)
- Удалён `safe_restart_xray` (line 615 → comment + explicit returns)
- Добавлен `return 0` в ветку `migrated > 0` (changed)
- Добавлен `return 1` в ветку `migrated == 0` (no-op)
- Раньше: fall-through implicit `0` на каждом запуске → forced restart даже если нечего мигрировать

**migrate_transport_profile_metadata (lines 537-581):**
- Удалён `backup_config "transport_profile_metadata"` (line 542 → comment)
- Заменён `return 0` (всегда) на `return 0` (changed) / `return 1` (no-op)
- Раньше: всегда `return 0` даже при `migrated == 0` → forced unnecessary restart на v2.0+

### Task 4 — backup_config удалён из 4 оставшихся миграционных fns

| Функция | Строка до | Замена |
|---------|-----------|--------|
| migrate_routing_config | `backup_config "routing_v132"` | comment-стаб |
| migrate_xhttp_mode | `backup_config "xhttp_mode"` | comment-стаб |
| migrate_xhttp_extra_restore | `backup_config "xhttp_extra_restore"` | comment-стаб |
| migrate_config_optimization | `backup_config "config_optimization"` | comment-стаб |

**Итоговый счёт backup_config вызовов:** 3 (1 в run_migration + 2 в AdGuard — нетронуты).

**AdGuard backup_config calls** (adguard_dns, adguard_dns_restore) — НЕ тронуты. Это не миграционные функции, не управляются через run_migration.

## Deviations from Plan

None — план выполнен точно.

## Bugs Fixed (REQ-D05, REQ-D07)

**Bug 1 — Маркер выставлялся до restart (потеря данных при failure):**
Раньше в main_menu: `if migrate_X; then touch .marker; needs_restart=true; fi` — все маркеры выставлялись сразу, потом один общий `safe_restart_xray`. Если restart падал — config broken, маркеры уже выставлены, миграции не повторятся. Теперь каждый `run_migration` делает restart ДО touch, маркер ставится ТОЛЬКО при успехе.

**Bug 2 — migrate_xhttp_profiles implicit return 0 (forced restart на каждом launch):**
До задачи 3: функция fall-through на echo в else-ветке, implicit exit code = 0 (успех). run_migration с binary contract (0=ok) → каждый launch вызывал unnecessary restart до выставления marker. Исправлено: explicit `return 1` в no-op ветке.

**Bug 3 — migrate_transport_profile_metadata always return 0:**
До задачи 3: `return 0` после обоих if-веток (changed И no-op). На v2.0+ системе с 0 мигрированных профилей — forced restart при каждом запуске до выставления marker. Исправлено: `return 1` в no-op ветке.

**Bug 4 — Race condition с auto-rollback в safe_restart_xray:**
Каждая fn вызывала `backup_config` самостоятельно ПОСЛЕ начала мутаций. Если fn падала на полпути, latest backup = уже-изменённый config. auto-rollback = восстановление broken state. Исправлено: backup централизован в run_migration ДО вызова fn.

**Bug 5 — Двойной restart в migrate_xhttp_profiles:**
До задачи 3: функция вызывала `safe_restart_xray` сама, затем run_migration (в case 0) вызвал бы его ещё раз. Удалён внутренний вызов.

## Migration Failures Aggregator — UX

Если 1+ миграция упала, пользователь видит:
```
⚠ 2 миграций не завершились — повторятся при следующем запуске
  Логи бэкапов: /usr/local/etc/xray/backups/
Нажмите любую клавишу для продолжения...
```

Без паузы (read -n 1) сообщение прокручивалось бы за TUI. Пауза не требует ввода — любая клавиша.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 194ef22 | Task 1 | feat: добавить run_migration helper с three-valued return контрактом |
| c0cb0b2 | Task 2 | refactor: main_menu — 6 if/touch блоков заменены на run_migration |
| a1f665f | Task 3 | fix: удалить safe_restart_xray из migrate_xhttp_profiles + explicit return 0/1 |
| 65efbe2 | Task 4 | refactor: централизовать backup_config из 4 оставшихся миграционных fns |

## Self-Check: PASSED

- xrayebator: FOUND (main file, modified)
- run_migration() declaration: line 483 (FOUND)
- main_menu migration block: lines 897-922 (FOUND, 6 run_migration calls)
- All 6 migrate_ fns: backup_config removed (verified via read)
- migrate_xhttp_profiles: safe_restart_xray removed, explicit return 0/1 (verified)
- migrate_transport_profile_metadata: explicit return 0/1 (verified)
- Commits: 194ef22, c0cb0b2, a1f665f, 65efbe2 (all present)
- bash -n syntax check: PASSED (verified after each task)
