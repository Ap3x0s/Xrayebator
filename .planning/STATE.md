# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** VPN стабильно и быстро работает через ТСПУ — соединение не падает, блокировки обходятся надёжно
**Current focus:** v2.0 Phase 6 — plan 06-01 DONE; next plan 06-02 (PQ profile creation).

## Current Position

Milestone: v2.0 — Post-Quantum & HAPP
Phase: 6 of 8 (Post-Quantum VLESS Encryption + ML-KEM) — plan 06-01 complete, plan 06-02 next
Plan: 06-01 ✓ DONE (3/3 tasks, commits df6ba7f + eeb1e72); 06-02/06-03 pending
Status: Phase 4 ✓ | Phase 5 ✓ | Phase 6 plan 06-01 ✓ → continue with 06-02 (PQ profile creation)
Last activity: 2026-05-10 — Plan 06-01 executed: vlessenc generator в install.sh, _migrate_mlkem_keys миграция, VLESS_*_FILE constants. REQ-A01/A02/A03 удовлетворены.

Progress: [######x...] 65% (Phases 4+5 ✓ + Phase 6 plan 1/3; Phase 6 in progress)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 6
- Average duration: ~10min
- Total execution time: ~0.98 hours

**By Phase (v1.0):** archived to `.planning/milestones/v1.0-phases/` on 2026-05-10.

**Recent Trend:** stable across the completed v1.0 safety/config/transport work.

*Updated after each plan completion*

| Phase | Duration | Tasks | Files |
|-------|----------|-------|-------|
| Phase 04-foundation-audit-fixes P04-01 | ~2 min | 3 tasks | 2 files |
| Phase 04-foundation-audit-fixes P04-02 | ~12 min | 4 tasks | 1 file |
| Phase 05-auto-update-xmux-explicit P05-01 | 6 | 4 tasks | 4 files |
| Phase 05-auto-update-xmux-explicit P05-02 | 8 | 2 tasks | 1 files |
| Phase 06-post-quantum-vless-encryption-ml-kem P01 | 19 | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
v2.0 scope decisions (post-research, pre-execution):

- [v2.0 scope]: Major release (v2.0, not v1.1)
- [v2.0 research]: Полный 4-dimension research — major release заслуживает фундаментального изучения
- [v2.0 bugs]: P0+P1 (6 шт.) включены в milestone — Phase 4 (Foundation), foundational

**Post-research decisions:**

- [v2.0 D1 — Encryption mode]: `mlkem768x25519plus.native` (FINAL после second opinion от codex+kimi 2026-05-09 — оба независимо опровергли pitfalls-аргумент про entropy-based detection, xorpub = security theater)
- [v2.0 D2 — Backward compat]: Per-profile button "Upgrade to post-quantum"; legacy fallback — отдельный TCP+Vision профиль через `create_profile_menu` (REQ-A07 parallel inbound снят, НЕ auto-migrate)
- [v2.0 D3 — Vision Seed]: Experimental toggle off-by-default (`xtls-rprx-vision-seed` flow value НЕ существует в mainline Xray — заменено на `testpre`/`testseed` поля)
- [v2.0 D4 — SNI list]: Stack-список — РФ-банки/логистика (vtb, cdek, avito, pochta) + github; НЕ twitch/microsoft (TLS fingerprint mismatch)
- [v2.0 D5 — Subscription server]: Public TLS is default (nginx + Let's Encrypt → local handler 127.0.0.1:8080). Prefer 443, fallback 8443 if 443 is occupied. Loopback-only mode remains fallback/dev.
- [v2.0 D6 — Auto-update]: Manual trigger + nag в main_menu, mandatory SHA256 verify
- [v2.0 D7 — Token]: 32-hex random opaque (не UUID, не HMAC) — простая ревокация
- [v2.0 D8 — НОВОЕ scope F (bypass routing)]: Меню для domain-исключений (Steam, RU-банки, gosuslugi → freedom outbound)
- [v2.0 D9 — Profile UX]: Один xrayebator profile = одна HAPP subscription URL. Success screen shows subscription URL + QR as primary; raw `vless://` is advanced fallback.
- [v2.0 D10 — HAPP routing + QR]: Subscription body includes HAPP routing import (`happ://routing/onadd/...`) + one `vless://` line. QR encodes only the short HTTPS subscription URL; raw PQ `vless://` QR is disabled by default due long `encryption=`.
- [v2.0 xmux]: Explicit `maxConcurrency: 1-1` block (не `maxConnections: 1` — mutually exclusive с дефолтом)
- [v2.0 phase ordering]: Foundation FIRST (Phase 4) — без safe_jq_write/safe_restart_xray в update.sh все v2.0 миграции = рулетка
- [Phase 04-foundation-audit-fixes]: mktemp /tmp/xray-cfg.XXXXXX вместо predictable temp file в update.sh миграциях
- [Phase 04-foundation-audit-fixes]: grep 'Configuration OK' stdout вместо exit code — xray run -test возвращает 0 на missing file
- [Phase 04-foundation-audit-fixes]: 3-слойный x25519 парсер: field-name → base64 fallback → validator regex ^[A-Za-z0-9_+/=-]{43,44}$
- [04-02 run_migration]: Three-valued return contract (0/1/≥2) — устраняет 5 false-positive failures на v2.0+ системах
- [04-02 backup_config]: Централизован в run_migration ДО вызова fn — race condition с auto-rollback устранён
- [04-02 per-migration restart]: Restart после каждой changed-миграции (не один общий в конце) — маркер touch ТОЛЬКО при успехе

**Phase 5 design decisions**

- [05 trigger]: CLI subcommand `xrayebator update` — НЕ menu item. Nag в main_menu пишет 'выполни sudo xrayebator update'.
- [05 confirmation]: Сводка + y/N перед download (`current -> latest stable`, ~6.5MB. Downtime ~5 сек. Continue?). Дефолт N.
- [05 progress]: curl --progress-bar (живой transfer rate + ETA). Важно для медленных РФ-VPS.
- [05 rollback]: Auto-rollback + log. Silent recovery без confirmation prompt'а.
- [05 xmux skip rule]: Migration пропускает inbounds с УЖЕ существующим xmux-блоком — сохраняет юзерские твики.
- [05 max_connections]: Remove deprecated + add defaults. Без этого Xray 25.3+ откажется грузить config.
- [05 xmux defaults]: Хардкод (research-validated): maxConcurrency '1-1', hMaxRequestTimes '600-900', hMaxReusableSecs '1800-3000', hKeepAlivePeriod 30. БЕЗ menu для тонкой настройки.
- [05 live clients]: Pre-flight НЕ проверяет — safe_restart_xray ~3 сек, клиенты авто-реконнектятся.

**Phase 5 execution decisions**

- [05-01 install.sh strategy]: Option C (inline duplication + sync test) — zero bootstrap risk, machine-checked sync
- [05-01 INSTALL_MODE]: INSTALL_MODE=1 env-var bypass'ит confirmation + активирует install-mode guards
- [05-01 CLI trigger lock]: update.sh определяет update_xray_core НЕ вызывает, trigger = xrayebator update
- [05-01 Step 13]: Прямой systemctl restart в update_xray_core (не safe_restart_xray) — разные responsibilities
- [05-01 cache TTL]: 24h в /tmp/.xrayebator_xray_latest_check для nag GitHub API calls
- [05-01 backup retention]: 3 последних xray.bak.<timestamp> через _cleanup_xray_backups

**Phase 6 research decisions**

- [06 D2 REVISED — REQ-A07 DROPPED]: Parallel legacy fallback inbound на одном порту нереализуем в Xray (Issue #2108, Discussion #2631 — два инбаунда на одном порту требуют nginx stream впереди, что нарушает single-file constraint и усложняет security model). Org fallback переезжает на уровень отдельных профилей: REQ-A06 уже даёт юзеру выбор PQ vs legacy при создании профиля.
- [06 REQ-A09 REVISED]: Кнопка "Upgrade to post-quantum" теперь in-place заменяет transport+settings профиля на XHTTP+Reality+native (сохраняя UUID и порт), legacy-клиенты этого профиля отвалятся — explicit warning перед apply. Никакого parallel-inbound.
- [06 REQ-C11 REVISED Phase 7]: Subscription отдаёт ОДНУ vless:// на профиль (не две), parallel ссылки сняты вместе с REQ-A07.
- [06 decryption placement]: `inbound.settings.decryption` (string, инбаунд-уровень) — НЕ `clients[].decryption`. Все клиенты на PQ-инбаунде обязаны использовать шифрование (verified Discussion #5372/#5716).
- [06 client compat matrix 2026-05-10]: HAPP 2.10+ ✓, v2rayNG 1.10+ ✓, v2rayN ✓ (PR #7782), Shadowrocket ✓ (App Store update 2026-05-10), sing-box ✗, Hiddify ✗ (Issue 2026-03-09), mihomo ✗, NekoBox ✗, Streisand ?
- [06 vlessenc minimum version AUDIT 2026-05-10]: `xray vlessenc` появился в Xray-core v25.9.5 (PR #5078), не в 25.3. Phase 5 ставит latest stable через GitHub `/releases/latest`, поэтому свежая установка получает подходящую версию; migration guard должен проверять ≥25.9.
- [06-01 vlessenc format VERIFIED 2026-05-10 на Xray 26.2.6]: РАСХОЖДЕНИЕ С RESEARCH §10 — флаг `-mode native` НЕ СУЩЕСТВУЕТ (выводит `flag provided but not defined: -mode`). `xray vlessenc` без флагов выдаёт ДВЕ пары JSON-fragment строк: первая — X25519-auth (не PQ-auth), вторая — ML-KEM-768-auth (PQ-auth). Формат каждой строки: `"decryption": "mlkem768x25519plus.<MODE>.<TTL/0rtt>.<base64>"` где MODE уже зашит в значение (`native`). Парсер должен (1) убрать `-mode native` из install.sh/_migrate, (2) фильтровать ML-KEM-768 секцию, (3) awk-pattern по секции: `^Authentication: ML-KEM-768` → `^"decryption":`/`^"encryption":` с `awk -F'"' '{print $4}'`.
- [06-01 execution unblock AUDIT 2026-05-10]: Plan 6.1 больше не должен ждать user approval по vlessenc-формату; использовать field research как директиву реализации. Открытым остаётся только smoke на target VPS после кода.
- [Phase 7 HAPP metadata AUDIT 2026-05-10]: HAPP принимает стандартные параметры как HTTP headers и как body comments с теми же именами (`#profile-title`, `#subscription-userinfo`, `#announce`). Схема `#header:` в старом плане неверна.
- [Phase 7 user decision 2026-05-10]: Public TLS mode becomes default if a domain is available. One profile produces one subscription URL; subscription contains HAPP routing payload + one transport-specific vless link.
- [06 mlkem migration return]: `.mlkem_keys_generated` возвращает run_migration code `1` (no-op/mark) — не мутирует config.json, только создаёт файлы ключей. Не делает лишний safe_restart_xray.
- [06 plan structure]: 3 plans (6.1 keys + 6.2 profile creation simplified + 6.3 UX). Complexity downgrade L → M после drop REQ-A07.

**Deferred (НЕ Phase 5):**

- [Phase 8 Plan 8.3 НОВЫЙ]: AdGuard Home cleanup — удалить упоминания + предложить uninstall existing AdGuard при `xrayebator update`. Причина: AdGuard был косячный/дырявый в прошлых релизах. Out of scope Phase 5.
- [Phase 06-post-quantum-vless-encryption-ml-kem]: [06-01 vlessenc parser]: section-aware awk по маркеру 'Authentication: ML-KEM-768' + JSON-fragment parsing (awk -F'"' {print $4}) — берёт ВТОРУЮ (PQ) пару, не первую (X25519)
- [Phase 06-post-quantum-vless-encryption-ml-kem]: [06-01 minimum xray-core]: 25.9.5 (PR #5078), не 25.3 — vlessenc subcommand появился в этом релизе
- [Phase 06-post-quantum-vless-encryption-ml-kem]: [06-01 sync контракт]: парсер vlessenc продублирован install.sh ↔ _migrate_mlkem_keys (избегаем source-инга xrayebator из install.sh)

### Pending Todos

- 04-01 DONE (lifecycle-scripts-hardening)
- 04-02 DONE (migration-helper-rollout)
- Phase 4 COMPLETE
- 05-01 DONE (auto-update-cli) — sync-test PASS, all 4 REQs satisfied
- 05-02 DONE (xmux-explicit-migration) — REQ-B04 PASS, Phase 5 COMPLETE
- Phase 5 COMPLETE — все REQ-B* удовлетворены
- 06-RESEARCH DONE (2026-05-10) — REQ-A07 DROPPED, REQ-A09/C11 REVISED, scope adjusted
- 06 PLANS DONE (2026-05-10) — 3 PLAN.md созданы и валидированы, ROADMAP обновлён
- 06 PLAN-CHECK iter 2/3 PASSED (2026-05-10) — все 6 issues из iter 1 исправлены (commit 0291718): short_id из config.json, warning UI расширен, phased markers, implementation note, awk range, label loop. Отчёт: 06-PLAN-CHECK-iter2.md
- 06 EXECUTE-PHASE STARTED (2026-05-10) — first wave reached vlessenc checkpoint, returned 4 расхождения с RESEARCH §10. Findings: 06-FIELD-RESEARCH-vlessenc.md
- 06 EXECUTE UNBLOCKED BY AUDIT (2026-05-10) — use updated 06-01 PLAN parser; continue implementation tasks.
- 06-01 DONE (2026-05-10) — vlessenc generator, _migrate_mlkem_keys, VLESS_*_FILE constants. REQ-A01/A02/A03 ✓. Commits df6ba7f + eeb1e72.
- 06-02 NEXT — PQ profile creation (cat $VLESS_DECRYPTION_FILE → inbound.settings.decryption + encryption= в vless URL)
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

- **CLOSED 2026-05-10:** plan 06-01 vlessenc parser blocker полностью разрешён. Field research директивы зашиты в код (install.sh + _migrate_mlkem_keys). Парсер использует section-marker `Authentication: ML-KEM-768` + JSON-fragment `awk -F'"' '{print $4}'`, без флага `-mode`, минимум Xray-core ≥ 25.9.5.
- Remaining verification: smoke на target VPS — запустить `sudo xrayebator` на свежей VPS с latest Xray, убедиться что миграция `.mlkem_keys_generated` срабатывает (создаёт оба файла, marker, без restart) И что чистый install.sh производит файлы с правильным контентом.

## Session Continuity

Last session: 2026-05-10
Stopped at: Plan 06-01 DONE (3/3 tasks committed: df6ba7f vlessenc+constants, eeb1e72 _migrate_mlkem_keys). SUMMARY.md создан.
Resume file: .planning/phases/06-post-quantum-vless-encryption-ml-kem/06-02-pq-profile-creation-PLAN.md
Next: `/gsd:execute-phase 6` — continue with plan 06-02 (PQ profile creation: add_inbound читает $VLESS_DECRYPTION_FILE, encryption= в vless:// URL).
