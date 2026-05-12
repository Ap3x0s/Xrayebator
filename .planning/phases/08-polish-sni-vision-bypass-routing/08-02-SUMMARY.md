---
phase: 08-polish-sni-vision-bypass-routing
plan: 02
subsystem: bash-routing
tags: [bypass-routing, xray-routing, safe-jq-write, migration]

requires:
  - phase: 08-polish-sni-vision-bypass-routing
    provides: "08-01 main_menu point 4 profile hub and SNI 2026 migration position"
provides:
  - "bypass_routing_menu under main menu item 11"
  - "SNI conflict guard for Reality default SNI, profile JSON SNI, and config serverNames"
  - "safe_jq_write PREPEND mutation for direct domain bypass rules"
  - ".bypass_routing_2026 first-run opt-in migration"
affects: [phase-08, xrayebator-routing, adguard-cleanup]

tech-stack:
  added: []
  patterns: [safe_jq_write, run_migration-return-1, xray-routing-prepend, interactive-menu]

key-files:
  created: []
  modified:
    - xrayebator

key-decisions:
  - "Bypass rules are prepended with [new] + .routing.rules because Xray routing is first-match-wins."
  - "The domain: prefix is hardcoded; users enter bare domains only."
  - "Reality SNI conflicts are hard-blocked with no override."
  - "_migrate_bypass_routing_2026 returns 1 so run_migration creates the marker without an extra restart."
  - "_bypass_apply_bundle delegates mutation to _apply_bypass_rule, which performs its own safe_restart_xray."

patterns-established:
  - "Routing mutations are split into list/apply/remove/reset helpers."
  - "Reset preserves install.sh default rules by only deleting direct rules that have domain and no network/port."
  - "Interactive bundle selection uses five hardcoded groups and JSON construction through jq."

requirements-completed: [REQ-F01, REQ-F02, REQ-F03, REQ-F04, REQ-F05]

duration: 11min
completed: 2026-05-12
---

# Phase 08-02: Bypass Routing Menu Summary

**Domain bypass routing menu with SNI conflict guard, granular default bundles, and one-shot opt-in migration**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-12T12:59:00Z
- **Completed:** 2026-05-12T13:09:54Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Added `_sni_in_use`, `_bypass_list_current`, `_apply_bypass_rule`, `_bypass_remove_rule`, `_bypass_reset_all`, and `_bypass_bundle_groups`.
- Added `bypass_routing_menu` plus interactive add, bundle, remove, and reset flows.
- Registered main menu item `11) Управление обходом VPN` without disturbing item `4) manage_profile_menu`.
- Added `_migrate_bypass_routing_2026` after `.sni_list_2026`, with default-N first-run opt-in and marker-once behavior.

## Task Commits

1. **Task 1: bypass_routing helpers + _sni_in_use SNI-conflict guard** - `1b5d434` (feat)
2. **Task 2: bypass_routing_menu + main_menu registration** - `bcfbebb` (feat)
3. **Task 3: .bypass_routing_2026 first-run opt-in migration** - `b7b9a8c` (feat)
4. **Verification labels** - `f3cdbd8` (chore)

## Files Created/Modified

- `xrayebator` - Added bypass routing helpers, menu flows, main menu item 11, and `.bypass_routing_2026` migration.

## Decisions Made

- PREPEND is mandatory: `_apply_bypass_rule` writes `.routing.rules = [{"type":"field","domain":$domains,"outboundTag":"direct"}] + .routing.rules`.
- The TUI always stores `domain:<dom>` suffix-match rules; no prefix mode is exposed.
- `_sni_in_use` checks three sources: hardcoded Reality defaults, `profiles/*.json` `.sni`, and `config.json` Reality `serverNames[]`.
- `_bypass_reset_all` only removes domain-only direct rules, preserving install defaults such as protocol blocks and catch-all direct.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan’s line-based grep for `safe_jq_write.*routing.rules` did not see multi-line jq filters. Added short labels above the three routing writes so the verification check reflects the implemented mutations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 08-03 can safely remove AdGuard menu item 7 without disturbing the new bypass item 11. Phase 8 now has the two feature plans complete; only AdGuard cleanup remains.

## Self-Check: PASSED

- `bash -n xrayebator` passed.
- Source-mode SNI smoke returned `CONFLICT` for `www.ozon.ru` and `OK` for `steamcontent.com`.
- Structural greps passed for helper count, `11) bypass_routing_menu`, `4) manage_profile_menu`, `run_migration.*bypass_routing_2026`, and `safe_jq_write.*routing.rules`.

---
*Phase: 08-polish-sni-vision-bypass-routing*
*Completed: 2026-05-12*
