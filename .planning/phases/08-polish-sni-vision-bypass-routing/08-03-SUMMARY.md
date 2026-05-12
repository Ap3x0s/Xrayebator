---
phase: 08-polish-sni-vision-bypass-routing
plan: 03
subsystem: lifecycle-update
tags: [adguard-cleanup, update-sh, deprecation, dns-rollback]

requires:
  - phase: 08-polish-sni-vision-bypass-routing
    provides: "08-02 main_menu item 11 bypass routing state"
provides:
  - "update.sh force-uninstall path for deprecated AdGuard Home"
  - "main menu without AdGuard item 7"
  - "CLAUDE.md deprecation guidance for AdGuard"
affects: [phase-08, update-sh, xrayebator-menu, docs]

tech-stack:
  added: []
  patterns: [function-wrapped-update-cleanup, mktemp-jq-validate-mv, dns-rollback-first]

key-files:
  created: []
  modified:
    - update.sh
    - xrayebator
    - CLAUDE.md

key-decisions:
  - "AdGuard force cleanup is wrapped in _adguard_force_uninstall_if_present to keep local variables inside function scope."
  - "DNS rollback happens before AdGuard stop/removal to avoid a DNS black-hole window."
  - "No y/N prompt is used during update; AdGuard is deprecated and removed automatically if detected."
  - "uninstall_adguard_home remains in xrayebator as a manual emergency function, but all menu entry points are gone."
  - "CLAUDE.md keeps a deprecation note rather than deleting the historical add-on section."

patterns-established:
  - "update.sh remains self-contained and does not source xrayebator."
  - "Lifecycle cleanup uses mktemp + jq + xray run -test grep before mv, matching existing update.sh safety style."
  - "Feature removal preserves unrelated Phase 8 menu entries: item 4 profile hub and item 11 bypass routing."

requirements-completed: []

duration: 7min
completed: 2026-05-12
---

# Phase 08-03: AdGuard Cleanup Summary

**Deprecated AdGuard Home is force-uninstalled during update, and its interactive menu/install/status paths are removed**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-12T13:10:00Z
- **Completed:** 2026-05-12T13:16:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `_adguard_force_uninstall_if_present()` to `update.sh` and invoked it before the existing DNS migration block.
- Preserved critical ordering: DNS rollback to DoH Local first, then AdGuard stop/disable/uninstall, file removal, systemd-resolved restore, UFW cleanup, Xray restart if valid.
- Removed main menu item 7 and deleted `adguard_home_menu`, `install_adguard_home`, and `adguard_status`; `uninstall_adguard_home` remains.
- Updated `CLAUDE.md` with an AdGuard v2.0 deprecation note.

## Task Commits

1. **Task 1: update.sh force-uninstall function + call** - `0461a05` (feat)
2. **Task 2: xrayebator menu/function cleanup + CLAUDE deprecation note** - `c4f835f` (feat)

## Files Created/Modified

- `update.sh` - Added function-wrapped force cleanup and pre-DNS-migration call.
- `xrayebator` - Removed AdGuard menu item and install/status entry points while preserving `uninstall_adguard_home`.
- `CLAUDE.md` - Replaced Add-on services section with v2.0 deprecation guidance.

## Decisions Made

- `_adguard_force_uninstall_if_present` duplicates cleanup logic in `update.sh` instead of sourcing `xrayebator`, keeping update self-contained.
- Force uninstall has no prompt because AdGuard is an accepted v2.0 deprecation.
- `uninstall_adguard_home` remains as an orphan manual function for emergency source-based use.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 8 plans now have summaries. Phase-level verification can check REQ-E01..E04, REQ-F01..F05, and the deferred AdGuard cleanup invariants.

## Self-Check: PASSED

- `bash -n xrayebator`, `bash -n update.sh`, and `bash -n install.sh` passed.
- `_adguard_force_uninstall_if_present()` is defined once and called once before DNS migration.
- Ordering check returned `ORDER_OK` for DNS rollback before AdGuard stop.
- `adguard_home_menu`, `adguard_status`, main menu display item 7, and case branch `7) adguard_home_menu` are gone.
- `uninstall_adguard_home`, `4) manage_profile_menu`, and `11) bypass_routing_menu` remain.

---
*Phase: 08-polish-sni-vision-bypass-routing*
*Completed: 2026-05-12*
