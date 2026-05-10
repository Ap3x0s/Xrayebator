# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** VPN стабильно и быстро работает через ТСПУ — соединение не падает, блокировки обходятся надёжно
**Current focus:** v2.0 Phase 6 — Post-Quantum (VLESS Encryption + ML-KEM): planning COMPLETE 2026-05-10, ready to execute

## Current Position

Milestone: v2.0 — Post-Quantum & HAPP
Phase: 6 of 8 (Post-Quantum VLESS Encryption + ML-KEM) — PLANNING COMPLETE, execute pending
Plan: 6.1 / 6.2 / 6.3 (3 plans) ALL CREATED — wave structure 1→2→3, plan 6.1 имеет MANDATORY checkpoint на vlessenc stdout формат
Status: Phase 4 ✓ | Phase 5 ✓ | Phase 6 RESEARCH ✓ + PLANS ✓ (3 PLAN.md, frontmatter+structure validated) — REQ-A07 DROPPED, REQ-A09 REVISED, REQ-C11 REVISED
Last activity: 2026-05-10 — Phase 6 planning завершён: создано 3 PLAN.md, ROADMAP обновлён, всё закоммичено

Progress: [######....] 60% (Phases 4+5 ✓ из 5 v2.0 фаз; Phase 6 готов к execute)

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
| Phase 05-auto-update-xmux-explicit P05-01 | 6 | 4 tasks | 4 files |
| Phase 05-auto-update-xmux-explicit P05-02 | 8 | 2 tasks | 1 files |

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

**Phase 5 design decisions (post-discuss-phase 2026-05-09):**

- [05 trigger]: CLI subcommand `xrayebator update` — НЕ menu item. Nag в main_menu пишет 'выполни sudo xrayebator update'.
- [05 confirmation]: Сводка + y/N перед download (`25.2.0 -> 25.3.5, ~6.5MB. Downtime ~5 сек. Continue?`). Дефолт N.
- [05 progress]: curl --progress-bar (живой transfer rate + ETA). Важно для медленных РФ-VPS.
- [05 rollback]: Auto-rollback + log. Silent recovery без confirmation prompt'а.
- [05 xmux skip rule]: Migration пропускает inbounds с УЖЕ существующим xmux-блоком — сохраняет юзерские твики.
- [05 max_connections]: Remove deprecated + add defaults. Без этого Xray 25.3+ откажется грузить config.
- [05 xmux defaults]: Хардкод (research-validated): maxConcurrency '1-1', hMaxRequestTimes '600-900', hMaxReusableSecs '1800-3000', hKeepAlivePeriod 30. БЕЗ menu для тонкой настройки.
- [05 live clients]: Pre-flight НЕ проверяет — safe_restart_xray ~3 сек, клиенты авто-реконнектятся.

**Phase 5 execution decisions (05-01 complete 2026-05-09):**

- [05-01 install.sh strategy]: Option C (inline duplication + sync test) — zero bootstrap risk, machine-checked sync
- [05-01 INSTALL_MODE]: INSTALL_MODE=1 env-var bypass'ит confirmation + активирует install-mode guards
- [05-01 CLI trigger lock]: update.sh определяет update_xray_core НЕ вызывает, trigger = xrayebator update
- [05-01 Step 13]: Прямой systemctl restart в update_xray_core (не safe_restart_xray) — разные responsibilities
- [05-01 cache TTL]: 24h в /tmp/.xrayebator_xray_latest_check для nag GitHub API calls
- [05-01 backup retention]: 3 последних xray.bak.<timestamp> через _cleanup_xray_backups

**Phase 6 research decisions (post-research 2026-05-10):**

- [06 D2 REVISED — REQ-A07 DROPPED]: Parallel legacy fallback inbound на одном порту нереализуем в Xray (Issue #2108, Discussion #2631 — два инбаунда на одном порту требуют nginx stream впереди, что нарушает single-file constraint и усложняет security model). Org fallback переезжает на уровень отдельных профилей: REQ-A06 уже даёт юзеру выбор PQ vs legacy при создании профиля.
- [06 REQ-A09 REVISED]: Кнопка "Upgrade to post-quantum" теперь in-place заменяет transport+settings профиля на XHTTP+Reality+native (сохраняя UUID и порт), legacy-клиенты этого профиля отвалятся — explicit warning перед apply. Никакого parallel-inbound.
- [06 REQ-C11 REVISED Phase 7]: Subscription отдаёт ОДНУ vless:// на профиль (не две), parallel ссылки сняты вместе с REQ-A07.
- [06 decryption placement]: `inbound.settings.decryption` (string, инбаунд-уровень) — НЕ `clients[].decryption`. Все клиенты на PQ-инбаунде обязаны использовать шифрование (verified Discussion #5372/#5716).
- [06 client compat matrix 2026-05-10]: HAPP 2.10+ ✓, v2rayNG 1.10+ ✓, v2rayN ✓ (PR #7782), Shadowrocket ✓ (App Store update 2026-05-10), sing-box ✗, Hiddify ✗ (Issue 2026-03-09), mihomo ✗, NekoBox ✗, Streisand ?
- [06 vlessenc parser checkpoint]: Точный stdout формат `xray vlessenc` НЕ подтверждён из исходников (MEDIUM confidence). Plan 6.1 ОБЯЗАН содержать checkpoint-задачу: запустить команду на Xray-core 25.3+ и зафиксировать формат до написания парсера.
- [06 mlkem migration return]: `.mlkem_keys_generated` возвращает run_migration code `1` (no-op/mark) — не мутирует config.json, только создаёт файлы ключей. Не делает лишний safe_restart_xray.
- [06 plan structure]: 3 plans (6.1 keys + 6.2 profile creation simplified + 6.3 UX). Complexity downgrade L → M после drop REQ-A07.

**Deferred (НЕ Phase 5):**

- [Phase 8 Plan 8.3 НОВЫЙ]: AdGuard Home cleanup — удалить упоминания + предложить uninstall existing AdGuard при `xrayebator update`. Причина: AdGuard был косячный/дырявый в прошлых релизах. Out of scope Phase 5.

### Pending Todos

- 04-01 DONE (lifecycle-scripts-hardening)
- 04-02 DONE (migration-helper-rollout)
- Phase 4 COMPLETE
- 05-01 DONE (auto-update-cli) — sync-test PASS, all 4 REQs satisfied
- 05-02 DONE (xmux-explicit-migration) — REQ-B04 PASS, Phase 5 COMPLETE
- Phase 5 COMPLETE — все REQ-B* удовлетворены
- 06-RESEARCH DONE (2026-05-10) — REQ-A07 DROPPED, REQ-A09/C11 REVISED, scope adjusted
- 06 PLANS DONE (2026-05-10) — 3 PLAN.md созданы и валидированы, ROADMAP обновлён
- ⏭ NEXT: `/gsd:execute-phase 6` — execute Plan 6.1 (с checkpoint на vlessenc stdout) → 6.2 → 6.3
- При планировании Phase 8 — добавить Plan 8.3 AdGuard cleanup (deferred from Phase 5)
- ... далее по ROADMAP.md последовательно (6 → 7 → 8)

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

Last session: 2026-05-10
Stopped at: Phase 6 PLANNING complete — созданы 06-01-PLAN.md (REQ-A01/A02/A03 + MANDATORY checkpoint на vlessenc stdout формат), 06-02-PLAN.md (REQ-A04/A05/A06/A08, autonomous, миграция .xhttp_default_2026 строго no-op), 06-03-PLAN.md (REQ-A09 REVISED in-place + REQ-A10 banner с матрицей 2026-05-10). Frontmatter+structure validated. ROADMAP.md обновлён.
Resume file: .planning/phases/06-post-quantum-vless-encryption-ml-kem/06-01-pq-key-infrastructure-PLAN.md
Next: `/gsd:execute-phase 6` — wave 1 (Plan 6.1: checkpoint → vlessenc generation в install.sh + миграция .mlkem_keys_generated)
