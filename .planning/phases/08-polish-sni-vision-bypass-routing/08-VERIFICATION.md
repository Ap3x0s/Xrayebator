---
phase: 08-polish-sni-vision-bypass-routing
verified: 2026-05-12T13:25:11Z
status: passed
score: 12/12 truths verified
verdict: PASS
recommendation: complete_milestone_phase
human_verification:
  - test: "Run `xrayebator probe-test` on the target VPS before relying on the new donor SNI set"
    expected: "Required SNI donors show TLS/HTTP reachability from the VPS network"
    why_human: "Depends on the VPS provider network and current upstream reachability"
  - test: "Import a HAPP subscription after setting `/usr/local/etc/xray/announce.txt`"
    expected: "HAPP displays the announce text from both header/body metadata"
    why_human: "Requires a real HAPP client and subscription endpoint"
  - test: "Apply bypass defaults on a live config and verify Steam/RU service traffic exits directly"
    expected: "Selected `domain:` rules are first-match direct rules and Xray restarts cleanly"
    why_human: "Requires real Xray config, active clients, and network observation"
  - test: "Run `update.sh` on a server with legacy `/opt/AdGuardHome/AdGuardHome`"
    expected: "DNS rollback happens before AdGuard stop/removal; Xray restarts with DoH Local if validation passes"
    why_human: "Requires a legacy installed server with systemd, AdGuard, UFW, and Xray"
---

# Phase 8: Polish (SNI 2026 + Vision Seed + Bypass + AdGuard Cleanup) — Verification Report

**Phase Goal:** SNI list актуализирован под РФ-доноров 2026, оператор получает optional experimental testpre/testseed UI, полноценное меню обхода VPN, HAPP announce editor, and deferred AdGuard Home cleanup with DNS rollback before removal.

**Verified:** 2026-05-12T13:25:11Z
**Status:** passed
**Verdict:** PASS — complete Phase 8

## Goal Achievement

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | SNI 2026 migration/list has required donors, preserves custom handling, removes Apple/iCloud | VERIFIED | `sni_list.txt` has 5 required priority-1 donors and 3 `github.com` entries; `grep apple.com\\|icloud.com sni_list.txt` returns 0. `KNOWN_DEFAULTS_v1` at `xrayebator:33`, `_migrate_sni_list_2026` at `xrayebator:1273`, registered at `xrayebator:2873` |
| 2 | `xrayebator probe-test` CLI exists and runs the SNI probe flow | VERIFIED | `probe_sni()` at `xrayebator:1521`, `probe_test_command()` at `xrayebator:1545`, CLI branch `probe-test)` at `xrayebator:5256` |
| 3 | Profile UX includes a hub and advanced Vision Seed submenu | VERIFIED | Main menu dispatch `4) manage_profile_menu` at `xrayebator:2943`; `manage_profile_menu()` at `xrayebator:3633`; `manage_profile_advanced_menu()` at `xrayebator:4525`; `testpre`/`testseed` persisted to profile JSON and inbound client via `safe_jq_write` at `xrayebator:4630` and `xrayebator:4643` |
| 4 | HAPP announce editor writes the configured file and generated subscription handler emits `announce` metadata | VERIFIED | `edit_happ_announce_menu()` at `xrayebator:2709`, registered under HAPP menu option 5 at `xrayebator:2836`; generated handler reads `ANNOUNCE_FILE` and emits `ANNOUNCE_HEADER`/`ANNOUNCE_COMMENT` at `xrayebator:2127-2182` |
| 5 | Bypass routing menu is wired in main menu and shows current direct domain rules | VERIFIED | `bypass_routing_menu()` at `xrayebator:4840`, dispatch `11) bypass_routing_menu` at `xrayebator:2946`, `_bypass_list_current()` at `xrayebator:1419` |
| 6 | Default bypass bundles exist and are granular | VERIFIED | `_bypass_bundle_groups()` at `xrayebator:1511`; bundle apply path uses selection loop at `xrayebator:4698` and `_apply_bypass_rule` at `xrayebator:4746` |
| 7 | Bypass mutation writes `domain:` direct rules through safe writes and prevents SNI conflicts | VERIFIED | `_sni_in_use()` at `xrayebator:1387`; smoke test produced `CONFLICT` for `www.ozon.ru` and `OK` for `steamcontent.com`. `_apply_bypass_rule()` at `xrayebator:1428` validates `domain:` entries and uses `safe_jq_write` with PREPEND; safe-write comments at `xrayebator:1462`, `1477`, `1498` |
| 8 | Bypass migration is optional and registered once | VERIFIED | `_migrate_bypass_routing_2026()` at `xrayebator:1355`; registered via `run_migration "bypass_routing_2026"` at `xrayebator:2874` |
| 9 | Bypass changes restart Xray after add/remove/reset | VERIFIED | `_apply_bypass_rule`, `_bypass_remove_rule`, and `_bypass_reset_all` each route mutations through safe config writes and restart paths; interactive wrappers call them at `xrayebator:4676`, `4809`, `4831` |
| 10 | AdGuard auto-cleanup exists, has no top-level `local`, and performs DNS rollback before stop/removal and before legacy DNS migration | VERIFIED | `_adguard_force_uninstall_if_present()` definition count 1, call count 1; `grep -c "^local " update.sh` returns 0. Ordering check returned `ORDER_OK`: call at line 680 before `# МИГРАЦИЯ DNS`; `Шаг 1/5` rollback before `Шаг 2/5` stop |
| 11 | AdGuard menu/status entry points are removed while manual uninstall is preserved | VERIFIED | `grep -c "adguard_home_menu\\|adguard_status" xrayebator` returns 0; `grep -c "uninstall_adguard_home" xrayebator` returns 1; old label `AdGuard Home (блокировка рекламы)` returns 0 |
| 12 | Project docs mark AdGuard deprecated | VERIFIED | `CLAUDE.md` contains one remaining AdGuard Home mention documenting deprecation/cleanup |

**Score:** 12/12 truths verified.

## Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| REQ-E01 | 08-01 | SATISFIED | SNI list required donors present, `apple.com`/`icloud.com` absent, `KNOWN_DEFAULTS_v1` + `.sni_list_2026` migration wired |
| REQ-E02 | 08-01 | SATISFIED | `probe-test)` CLI, `probe_sni`, and `probe_test_command` present |
| REQ-E03 | 08-01 | SATISFIED | Profile hub + advanced Vision Seed submenu, warning/version check, `testpre`/`testseed` persisted to profile and inbound |
| REQ-E04 | 08-01 | SATISFIED | HAPP announcement TUI plus generated `announce` header/body comment emission |
| REQ-F01 | 08-02 | SATISFIED | Main menu item 11 opens bypass menu and lists current rules |
| REQ-F02 | 08-02 | SATISFIED | Default bundles implemented in `_bypass_bundle_groups()` with granular selection |
| REQ-F03 | 08-02 | SATISFIED | `domain:` direct rules written with `safe_jq_write` and PREPEND semantics |
| REQ-F04 | 08-02 | SATISFIED | `.bypass_routing_2026` migration is opt-in/default-N and one-shot |
| REQ-F05 | 08-02 | SATISFIED | Add/remove/reset mutation paths restart Xray after safe config write |
| Deferred AdGuard cleanup | 08-03 | SATISFIED | `update.sh` force-uninstalls deprecated AdGuard with DNS rollback first; menu/status entries removed; docs updated |

All active Phase 8 requirements are accounted for. Plan 08-03 intentionally has no REQ-* ID because it closes deferred cleanup scope from the Phase 8 context.

## Smoke Tests

| Check | Result |
| ----- | ------ |
| `bash -n xrayebator` | PASS |
| `bash -n update.sh` | PASS |
| `bash -n install.sh` | PASS |
| SNI required domains count | PASS — 5 required donor entries present |
| SNI Apple/iCloud removal | PASS — 0 matches |
| `github.com` presence | PASS — 3 matches |
| SNI conflict guard source-mode smoke | PASS — `www.ozon.ru` conflicts, `steamcontent.com` allowed |
| AdGuard cleanup ordering | PASS — rollback step before stop; cleanup call before legacy DNS migration |
| Plan summaries | PASS — 08-01, 08-02, 08-03 summaries exist; no `Self-Check: FAILED` marker |
| Plan commits | PASS — commits found for 08-01, 08-02, 08-03 |

## Human Verification

No blocking items remain. The frontmatter lists non-blocking VPS/client checks for the parts that depend on real network behavior, real HAPP client behavior, or legacy server state.
