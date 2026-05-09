# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** VPN стабильно и быстро работает через ТСПУ — соединение не падает, блокировки обходятся надёжно
**Current focus:** v2.0 — Post-Quantum & HAPP (research → requirements → roadmap)

## Current Position

Milestone: v2.0 — Post-Quantum & HAPP
Phase: 4 of 8 (Foundation — Audit Fixes) — COMPLETE (оба плана выполнены)
Plan: 04-01 DONE, 04-02 DONE (wave 1, оба завершены)
Status: Phase 4 executed ✓ (04-01: 3 tasks, 2 files; 04-02: 4 tasks, 1 file)
Last activity: 2026-05-09 — 04-02 migration-helper-rollout выполнен: run_migration helper + DRY backup_config + main_menu рефакторинг + explicit return 0/1 в 2 fns

Progress: [##########] 100% Phase 4 complete — готов к /gsd:plan-phase 5

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 6
- Average duration: ~10min
- Total execution time: ~0.98 hours

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-safety-net-security | 3/3 | 14min | 5min |
| 02-config-optimization | 2/2 | 21min | 11min |
| 03-transport-modernization | 1/1 | 24min | 24min |

**Recent Trend:**
- Last 5 plans (v1.0): 03-01 (24min), 02-01 (12min), 02-02 (9min), 01-03 (4min), 01-02 (6min)
- Trend: stable

*Updated after each plan completion*

| Phase | Duration | Tasks | Files |
|-------|----------|-------|-------|
| Phase 04-foundation-audit-fixes P04-01 | ~2 min | 3 tasks | 2 files |
| Phase 04-foundation-audit-fixes P04-02 | ~12 min | 4 tasks | 1 file |

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
v2.0 scope decisions (post-research, pre-execution):

- [v2.0 scope]: Major release (v2.0, not v1.1)
- [v2.0 research]: Полный 4-dimension research — major release заслуживает фундаментального изучения
- [v2.0 bugs]: P0+P1 (6 шт.) включены в milestone — Phase 4 (Foundation), foundational

**Post-research decisions:**

- [v2.0 D1 — Encryption mode]: `mlkem768x25519plus.native` (FINAL после second opinion от codex+kimi 2026-05-09 — оба независимо опровергли pitfalls-аргумент про entropy-based detection, xorpub = security theater)
- [v2.0 D2 — Backward compat]: Per-profile button "Upgrade to post-quantum" + parallel legacy fallback inbound на каждом новом профиле (НЕ auto-migrate, отвалит ~30% iOS Shadowrocket/sing-box)
- [v2.0 D3 — Vision Seed]: Experimental toggle off-by-default (`xtls-rprx-vision-seed` flow value НЕ существует в mainline Xray — заменено на `testpre`/`testseed` поля)
- [v2.0 D4 — SNI list]: Stack-список — РФ-банки/логистика (vtb, cdek, avito, pochta) + github; НЕ twitch/microsoft (TLS fingerprint mismatch)
- [v2.0 D5 — Subscription server]: Two-mode — Mode A (HTTP loopback :8080, default) + Mode B opt-in (nginx + LE на :8443)
- [v2.0 D6 — Auto-update]: Manual trigger + nag в main_menu, mandatory SHA256 verify
- [v2.0 D7 — Token]: 32-hex random opaque (не UUID, не HMAC) — простая ревокация
- [v2.0 D8 — НОВОЕ scope F (bypass routing)]: Меню для domain-исключений (Steam, RU-банки, gosuslugi → freedom outbound)
- [v2.0 xmux]: Explicit `maxConcurrency: 1-1` block (не `maxConnections: 1` — mutually exclusive с дефолтом)
- [v2.0 phase ordering]: Foundation FIRST (Phase 4) — без safe_jq_write/safe_restart_xray в update.sh все v2.0 миграции = рулетка
- [Phase 04-foundation-audit-fixes]: mktemp /tmp/xray-cfg.XXXXXX вместо predictable temp file в update.sh миграциях
- [Phase 04-foundation-audit-fixes]: grep 'Configuration OK' stdout вместо exit code — xray run -test возвращает 0 на missing file
- [Phase 04-foundation-audit-fixes]: 3-слойный x25519 парсер: field-name → base64 fallback → validator regex ^[A-Za-z0-9_+/=-]{43,44}$
- [04-02 run_migration]: Three-valued return contract (0/1/≥2) — устраняет 5 false-positive failures на v2.0+ системах
- [04-02 backup_config]: Централизован в run_migration ДО вызова fn — race condition с auto-rollback устранён
- [04-02 per-migration restart]: Restart после каждой changed-миграции (не один общий в конце) — маркер touch ТОЛЬКО при успехе

### Pending Todos

- 04-01 DONE (lifecycle-scripts-hardening)
- 04-02 DONE (migration-helper-rollout)
- Phase 4 COMPLETE — запустить `/gsd:plan-phase 5` (Auto-update + xmux)
- ... далее по ROADMAP.md последовательно (5 → 6 → 7 → 8)

### Phase 4 plan artifacts

- `.planning/phases/04-foundation-audit-fixes/04-RESEARCH.md` — 44KB, HIGH confidence
- `.planning/phases/04-foundation-audit-fixes/04-01-lifecycle-scripts-hardening-PLAN.md` (3 tasks)
- `.planning/phases/04-foundation-audit-fixes/04-02-migration-helper-rollout-PLAN.md` (4 tasks)

### Phase 4 key research findings (must propagate to execution)

- `xray run -test` возвращает exit 0 при отсутствующем конфиге → pre-validate ДОЛЖЕН использовать `grep -q "^Configuration OK\.$"` + тройная защита `[[ -f $cfg && -s $cfg ]]` перед grep
- `run_migration` имеет three-valued return contract: `0`=changed→restart+mark, `1`=no-op→mark only, `≥2`=fail→don't mark
- `backup_config` централизован в `run_migration` (убран из 6 миграционных fn); AdGuard backup_config calls (xrayebator:2672, 2770) НЕ тронуты
- `migrate_xhttp_profiles` и `migrate_transport_profile_metadata` требуют EXPLICIT `return 0`/`return 1` после удаления внутреннего safe_restart_xray
- mktemp вместо predictable `${CONFIG_FILE}.tmp.$$` (race + symlink attack)
- x25519 regex: `^[A-Za-z0-9_+/=-]{43,44}$` (RawURL 43 + Std 44 with padding)

### Blockers/Concerns

- Нет — research/planning завершены, готов к execution

## Session Continuity

Last session: 2026-05-09
Stopped at: Completed 04-02-migration-helper-rollout-PLAN.md (4 tasks: run_migration helper + main_menu refactor + explicit return 0/1 + centralized backup_config). Phase 4 complete.
Resume file: None
