# Phase 6 Plan Check — Iteration 2/3

**Date:** 2026-05-10
**Phase:** 06-post-quantum-vless-encryption-ml-kem
**Plans verified:** 3 (06-01, 06-02, 06-03)
**Revision commit:** `0291718 fix(06-post-quantum-vless-encryption-ml-kem): revise plans per checker feedback (6 issues)`
**Verdict:** **VERIFICATION PASSED** (with 1 minor partial fix — non-blocking)

---

## Per-Issue Verification (6 issues from iter 1)

### H1 — short_id regeneration breaking shared inbound (CRITICAL runtime bug)

**Status:** **FIXED**
**Location:** `06-03-upgrade-button-and-banner-PLAN.md:194-207`

Plan now reads `short_id` from existing inbound `config.json:.inbounds[].streamSettings.realitySettings.shortIds[0]`, mirroring the pattern from `xrayebator:2015-2018` (`generate_connection()`). The exact jq expression:

```bash
short_id=$(jq -r --argjson p "$port" \
  '.inbounds[] | select(.port == $p) | .streamSettings.realitySettings.shortIds[0]' \
  "$CONFIG_FILE" 2>/dev/null)
```

Two `# H1 fix:` marker comments anchor the change (lines 194 and 342). The `openssl rand -hex 8` call only fires as last-resort fallback when an inbound has no shortIds (corrupted/legacy without Reality) — explicitly documented as edge case.

Additional compliance: line 342 confirms `short_id` is NOT written into profile JSON — single source of truth in config.json maintained.

Cross-referenced `xrayebator:2015-2018` to confirm the exact pattern matches.

---

### M2 — Warning UI must list 5 explicit cost items (truth in advertising)

**Status:** **PARTIALLY FIXED** (minor)
**Location:** `06-03-upgrade-button-and-banner-PLAN.md:212-237`

Warning UI now contains:

| Item | Required | Present? |
|------|----------|----------|
| 1 | Old VLESS URL stops working | YES (line 219, RED) |
| 2 | Specific incompatible client apps enumerated | PARTIAL — generic "all clients" (line 220), specific matrix is in the BANNER (Task 2), not in this warning |
| 3 | UUID stays the same | YES (line 222, with actual UUID interpolation) |
| 4 | Port stays the same | YES (line 222, with actual port) |
| 5 | SNI stays the same | NOT STATED — SNI preservation is implementation detail, not surfaced to user |

Plus 5 additional cost items in shared-inbound block (lines 224-237) when applicable, including loss of `flow=xtls-rprx-vision` and irreversibility warning. This adds significant value over iter 1.

**Minor gap:** Item 2 (client app names) and item 5 (SNI) are not explicitly enumerated in the warning. However:
- Item 2 IS handled by the one-shot banner (Task 2) which lists exact compat matrix
- Item 5 (SNI invariant) is not strictly required ("whatever applies" qualifier in original feedback)

The "truth in advertising" intent is largely met. Not blocking — could be tightened during execution by adding two more bullets ("SNI сохранится: $sni" and an inline mini-matrix), but not required.

**Recommendation for executor:** Optionally add `• SNI сохранится: $sni` line to warning UI alongside UUID/port line for full 5-item parity.

---

### M3 — Task 1 monolithic; needs internal Phase 1a/1b/1c markers

**Status:** **FIXED**
**Location:** `06-03-upgrade-button-and-banner-PLAN.md:103, 106-113, 132, 244, 335`

- Task name updated: `[внутренне разбита на три фазы 1a/1b/1c для checkpoint-recoverability]`
- Pre-action `M3 split note` (line 106) explains atomicity rationale
- Three explicit markers in code body:
  - `# === Phase 1a: UI / VALIDATION ===` (line 132)
  - `# === Phase 1b: MUTATION ===` (line 244)
  - `# === Phase 1c: POST-MUTATION ===` (line 335)
- Each phase has progress echo for operator visibility (lines 249, 340)
- Verify step #10 (line 411-414) programmatically asserts ALL THREE markers present via awk range

Documented invariant: if 1b fails, 1a output already valid; if 1c fails, config.json/Xray are on new state but operator can manually fix profile JSON.

---

### M4 — Implementation note: do NOT hoist `local pq_enabled`

**Status:** **FIXED**
**Location:** `06-02-pq-profile-creation-PLAN.md:241`

Explicit note added directly after the conditional block that uses `${pq_enabled:-false}`:

> ⚠ Implementation note (M4): НЕ поднимать `local pq_enabled` на верх `generate_connection()` — оставить scoped внутри `xhttp)` case-ветки. `${pq_enabled:-false}` корректно даёт `false` для tcp/grpc/tcp-mux/tcp-utls/tcp-xudp веток, где переменная не объявлена. Если в будущем включится `set -u` и появятся ошибки unbound variable — исправлять через `${pq_enabled:-false}` в point-of-use, не через хостинг `local` объявления.

The note also addresses a future-proof concern (set -u behavior), redirecting fix to point-of-use rather than hoisting.

---

### L5 — Replace `grep -A 100 | head -100` with `awk` range

**Status:** **FIXED**
**Location:** `06-01-pq-key-infrastructure-PLAN.md:351-356`

- Zero occurrences of `grep -A 100`, `head -100`, or `grep -A 99` in Plan 6.1
- Four occurrences of `awk '/^_migrate_mlkem_keys\(\) \{/,/^\}/' xrayebator | grep ...` — robust pattern that survives function growth
- Explicit `# L5 fix:` marker comment at line 351

Pattern correctly uses awk range (not just grep) so verification will work even if the function grows beyond 100 lines or other similar text exists nearby.

---

### L6 — Banner verify must loop over all 13 required labels

**Status:** **FIXED**
**Location:** `06-03-upgrade-button-and-banner-PLAN.md:535-547`

Verify step #4 explicitly tagged `(L6 fix — было 4 grep, стало loop по 13+ меткам)` and contains a for-loop iterating exactly **13 labels**:

1. ML-KEM-768
2. HAPP 2.10+
3. v2rayNG 1.10+
4. v2rayN
5. PR #7782
6. Shadowrocket
7. sing-box
8. Hiddify
9. mihomo
10. NekoBox
11. Streisand
12. Создать профиль
13. Обновить профиль до post-quantum

Pass condition: no `MISSING:` lines emitted. Loop sets `missing=1` flag if any label absent. Verified label count = 13 via shell parsing.

---

## General Phase 6 Verification

### Plan structure (gsd-tools verify)

All three plans pass `gsd-tools verify plan-structure`:
- `06-01-PLAN.md`: 3 tasks (1 checkpoint:human-verify + 2 auto), all have files/action/verify/done. Frontmatter complete.
- `06-02-PLAN.md`: 3 tasks (auto), all complete. Frontmatter complete.
- `06-03-PLAN.md`: 2 tasks (auto), all complete. Frontmatter complete.

### Requirement Coverage

| Requirement | Plan | Status |
|-------------|------|--------|
| REQ-A01 | 6.1 | Covered (vlessenc generation in install.sh) |
| REQ-A02 | 6.1 | Covered (.mlkem_keys_generated migration) |
| REQ-A03 | 6.1 | Covered (constants in xrayebator) |
| REQ-A04 | 6.2 | Covered (decryption in inbound.settings) |
| REQ-A05 | 6.2 | Covered (encryption= URL param) |
| REQ-A06 | 6.2 | Covered (XHTTP+PQ as menu #1, TCP+Vision as legacy #4) |
| REQ-A07 | — | DROPPED per roadmap 2026-05-10 |
| REQ-A08 | 6.2 | Covered (.xhttp_default_2026 strict no-op migration) |
| REQ-A09 | 6.3 | Covered (in-place upgrade button, REVISED) |
| REQ-A10 | 6.3 | Covered (one-shot banner with compat matrix) |

All 9 active requirements covered. REQ-A07 explicitly excluded per roadmap (parallel inbound impossible per Xray Issue #2108).

### Critical helpers usage

| Helper | Plan 6.1 | Plan 6.2 | Plan 6.3 |
|--------|----------|----------|----------|
| `safe_jq_write` | N/A (no config mutation) | 3 mentions | 14 mentions |
| `safe_restart_xray` | N/A | mentioned | 15 mentions |
| `run_migration` | 14 mentions | 6 mentions | N/A |
| `backup_config` | N/A | N/A | 3 mentions (called before mutation) |
| `fix_xray_permissions` | N/A | N/A | 8 mentions |

All critical helpers used per project conventions (CLAUDE.md). No bare `systemctl restart xray` or raw `jq > tmp && mv` patterns.

### Plan 6.1 mandatory blocking checkpoint

CONFIRMED:
- Plan 6.1 frontmatter has `autonomous: false`
- Task 1 is `<task type="checkpoint:human-verify" gate="blocking">`
- Checkpoint is for `xray vlessenc` stdout format verification (RESEARCH §10 marked MEDIUM confidence)
- Has explicit `<resume-signal>` field

### Migration markers consistency

| Marker | Defined in | Referenced in |
|--------|-----------|---------------|
| `.mlkem_keys_generated` | 6.1 | 6.1, 6.2 (cross-ref in error message) |
| `.xhttp_default_2026` | 6.2 | 6.2 |
| `.pq_banner_shown` | 6.3 | 6.3 |

All three markers consistent across plans. No naming drift, no orphan markers.

### Profile JSON schema_version v2 + pq_enabled flag

CONSISTENT across plans 6.2 and 6.3:
- 6.2 introduces schema (Task 2, Part Б): `--argjson schema_v 2 --argjson pq_enabled true`
- 6.3 reads via `jq -r '.pq_enabled // false'` (backward-compat with v1 default false)
- 6.3 writes via `safe_jq_write '... .schema_version = 2 | .pq_enabled = true ...'`
- No conflicting fields (no `uuid_legacy`/`port_legacy` since REQ-A07 dropped — Plan 6.3 verify step #5 explicitly guards this)

### Dependency graph

Linear, acyclic, waves match:
- 6.1 (wave 1, depends_on: [])
- 6.2 (wave 2, depends_on: ["06-01"])
- 6.3 (wave 3, depends_on: ["06-02"])

### Scope sanity

| Plan | Tasks | Files | Status |
|------|-------|-------|--------|
| 6.1 | 3 (1 checkpoint + 2 auto) | 2 (install.sh, xrayebator) | Within target |
| 6.2 | 3 (auto) | 1 (xrayebator) | Within target |
| 6.3 | 2 (auto) | 1 (xrayebator) | Within target |

All plans within budget. Plan 6.3 Task 1 is large but justified (single function with 1a/1b/1c logical phases) — internal split is documented and verified programmatically.

### must_haves derivation

All three plans have well-formed `must_haves` with:
- User-observable truths (not implementation details)
- Concrete artifacts (file paths + content predicates)
- Wired key_links (source → destination via mechanism)

---

## Final Verdict

**VERIFICATION PASSED**

| Issue | Severity | Status |
|-------|----------|--------|
| H1 — short_id regeneration | HIGH (runtime-breaking) | FIXED |
| M2 — 5 cost items | MEDIUM | PARTIALLY FIXED (intent met, minor gap) |
| M3 — Task 1 phase markers | MEDIUM | FIXED |
| M4 — pq_enabled scoping note | MEDIUM | FIXED |
| L5 — awk range vs grep -A 100 | LOW | FIXED |
| L6 — 13 banner labels loop | LOW | FIXED |

**Recommendation:** Proceed to `/gsd:execute-phase 6`.

The H1 critical fix is definitively addressed — `short_id` is now read from config.json's existing inbound, eliminating the shared-inbound corruption risk. The only partial fix (M2) is non-blocking: the warning UI is significantly more explicit than iter 1, and the missing items (specific client apps + SNI) are either covered elsewhere (compat matrix in banner) or qualified as "whatever applies" in the original feedback. An executor can optionally tighten M2 during implementation by adding 1-2 more bullets, but the core intent is met.

No new issues introduced by the revision.

This was iteration 2/3. Plans are ready for execution.
