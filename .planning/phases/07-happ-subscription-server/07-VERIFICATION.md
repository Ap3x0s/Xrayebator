---
phase: 07-happ-subscription-server
verified: 2026-05-11T08:43:55Z
status: passed
score: 13/13 truths verified
verdict: PASS
recommendation: proceed_to_phase_8
---

# Phase 7: HAPP Subscription Server — Verification Report

**Phase Goal (from ROADMAP.md):** Оператор включает один пункт меню — получает public TLS subscription endpoint. Каждый xrayebator profile становится одной HAPP subscription URL: HAPP one-tap импортирует routing profile + одну vless:// строку текущего транспорта (PQ или legacy), metadata и revoke остаются per-profile.

**Verified:** 2026-05-11T08:43:55Z
**Status:** passed (PASS)
**Re-verification:** No — initial verification
**Verdict:** PASS — recommend proceed to Phase 8

---

## Goal Achievement

### Observable Truths (derived from ROADMAP Success Criteria 1..13)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `install_subscription_server()` heredoc-генерирует subhttp.sh + xrayebator-sub.service + nginx site config + .happ_defaults.env | VERIFIED | xrayebator:1694 defines function. Heredocs SUBHTTP_EOF (1716/1855), HAPP_DEFAULTS_EOF (1863/1886), SUBUNIT_EOF (1895/1927). NGINX_EOF в Plan 7.3 (2038/2056). Marker `.subscription_installed` touched at 1937 |
| 2 | Public TLS default: domain prompt + nginx + certbot + 443/8443 fallback + UFW limit | VERIFIED | `install_subscription_public_tls()` at 1978: domain read at 1994, `_select_subscription_port` at 1955 implements 443→8443 fallback via `ss -ltnp 'sport = :443'`, certbot --nginx --non-interactive at 2067, `ufw limit "${pub_port}/tcp"` at 2076 |
| 3 | Local-only fallback: socat 127.0.0.1:8080, UFW не открывается | VERIFIED | `install_subscription_local_only()` at 2112: writes "127.0.0.1" to `.subscription_domain` (2127), "8080" to `.subscription_port` (2126), NO `ufw` calls in function body |
| 4 | sub_token (32-hex `openssl rand -hex 16`) в каждом profile JSON + migration `.subscription_tokens_2026` | VERIFIED | `create_profile()` at 2616-2618 generates sub_token with regex validation `^[a-f0-9]{32}$`. jq_expr at 2690 stores `sub_token: $sub_token`. Migration `_migrate_subscription_tokens_2026` defined at 1215, registered at 2427 in main_menu(). Returns 1 (no-op marker, no Xray restart). create_profile success-screen QR for subscription URL at 2750-2766 |
| 5 | subhttp.sh strict regex `^/sub/[a-f0-9]{32}$` + constant-time 404 | VERIFIED | Inside SUBHTTP_EOF heredoc: regex check at 1768 (`if ! [[ "$path" =~ ^/sub/[a-f0-9]{32}$ ]]; then emit_404`), `emit_404()` at 1753 with `sleep 0.1` (1754), identical body "Not Found\n" + identical headers |
| 6 | HTTP 200 response: text/plain, content-disposition filename, HAPP body order comments → vless → routing | VERIFIED | Subhttp body block at 1820-1830: 6 HAPP comments first, then `$vless_url` (1829), then `$routing_uri` (1830). Headers at 1836-1849 include content-type, content-disposition, content-length, routing header. N9 invariant (vless ПЕРЕД routing) satisfied |
| 7 | HAPP metadata symmetry: headers ↔ body comments | VERIFIED | Body comments (1821-1830): `#profile-update-interval`, `#profile-title`, `#subscription-userinfo`, `#support-url`, `#profile-web-page-url`, `#announce`. HTTP headers (1841-1849): identical key names. Both have `routing: happ://routing/onadd/<base64url>` |
| 8 | xrayebator-sub.service hardening: User=xray, ProtectSystem=strict, ReadOnlyPaths, MemoryDenyWriteExecute, NoNewPrivileges, RestrictAddressFamilies AF_INET AF_INET6 AF_UNIX | VERIFIED | All 6 REQ-C09 hardening flags present literally in SUBUNIT_EOF heredoc (lines 1904, 1909, 1910, 1912, 1913, 1914). Plus best-practice extras: PrivateDevices, PrivateTmp, ProtectKernelTunables, ProtectKernelModules, ProtectControlGroups, LockPersonality. Opt-in: NO `systemctl enable` in `install_subscription_server` — only in Plan 7.3 installers (after explicit operator choice at lines 2088 and 2131) |
| 9 | Pure `_generate_vless_url_pure()` refactor, subhttp source-ит xrayebator, single-file preserved | VERIFIED | `_generate_vless_url_pure()` defined at 243, no side-effects (no read/write/qrencode). `generate_connection()` at 3191 delegates to pure function at 3226 (`vless_link=$(_generate_vless_url_pure "$profile_file")`). subhttp.sh sources xrayebator at 1727 via guard. SMOKE TEST PASSED: `bash -c 'source ./xrayebator; _generate_vless_url_pure /tmp/test.json'` returns valid `vless://...` |
| 10 | One profile = one subscription URL (one vless line, REQ-A07 dropped) | VERIFIED | subhttp body emits ONE `$vless_url` (1829), no parallel legacy emission. Subscription found via `.sub_token` match returns single profile_file. ROADMAP success criterion 10 (REVISED 2026-05-10) compliance verified |
| 11 | manage_subscription_menu: URL + QR + revoke without restart | VERIFIED | `manage_subscription_menu()` at 2150. Option 1: `qrencode -t ANSIUTF8 "$url"` for subscription URL at 2226. Option 2: revoke via `safe_jq_write --arg t "$new_token" '.sub_token = $t' "$pfile"` at 2241 (no `systemctl restart` call). Option 3 (advanced raw vless): PQ-aware gate via `pq_enabled=$(jq -r '.pq_enabled // false' "$pfile")` at 2264 |
| 12 | happ_settings_menu: TUI editor for `.happ_defaults.env`, no restart needed | VERIFIED | `happ_settings_menu()` at 2291 lists 5 keys (HAPP_SUPPORT_URL/WEB_URL/PROFILE_UPDATE_INTERVAL/ANNOUNCE_FILE/ROUTING_JSON_FILE). `_happ_edit_field()` at 2335 implements atomic awk+temp+mv replacement (2351-2361), input sanitization rejects `" \ $ \`` at 2343. Comment at 2364 confirms "рестарт subhttp не требуется — source на каждый request". Subhttp.sh source-ит env file at 1732 on every request |
| 13 | QR policy: subscription URL QR primary, raw PQ vless not QR'd by default | VERIFIED | M5 fix: PQ-aware gate (NOT threshold-based). manage_subscription_menu option 3 at 2269 checks `if [[ "$pq_enabled" == "true" ]]` → DISABLED with warning; else → qrencode allowed. create_profile success-screen QR (2761) is for subscription URL `$_url`, not raw vless |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `xrayebator` (line count) | ≥ 4280 (Plan 7.3 min_lines) | VERIFIED | 4873 lines, exceeds all min_lines targets (3990/4130/4280) |
| `_generate_vless_url_pure()` | Pure builder for vless:// | VERIFIED | Defined at 243, returns vless:// to stdout via printf, no side-effects |
| `_subscription_base_url()` | Shared helper for base URL | VERIFIED | Defined at 320, 4 call sites + 1 definition (B1 invariant: ≥4 satisfied) |
| `install_subscription_server()` | Heredoc generator | VERIFIED | Defined at 1694, generates 3 files + sets marker |
| `_select_subscription_port()` | 443/8443 preflight | VERIFIED | Defined at 1955, uses `ss -ltnp 'sport = :443'` |
| `install_subscription_public_tls()` | Public TLS installer | VERIFIED | Defined at 1978, full flow: domain → DNS preflight → email → certbot → ufw limit → enable |
| `install_subscription_local_only()` | Local fallback | VERIFIED | Defined at 2112, no UFW manipulation |
| `manage_subscription_menu()` | URL/QR/revoke | VERIFIED | Defined at 2150 with all 3 actions and PQ-aware gate |
| `happ_settings_menu()` | TUI editor | VERIFIED | Defined at 2291 with 5 fields |
| `_happ_edit_field()` | Atomic field edit | VERIFIED | Defined at 2335, mktemp+awk+mv, sanitization rejects quote/backslash/dollar/backtick |
| `happ_subscription_menu()` | Wrapper menu | VERIFIED | Defined at 2371, registered as menu option 9 at 2487/2503 |
| `_migrate_subscription_tokens_2026()` | Migration | VERIFIED | Defined at 1215, registered at 2427 in main_menu migrations block |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Top of xrayebator | rest of script | `if [[ "${BASH_SOURCE[0]}" != "${0}" ]]` guard | WIRED | Line 39 canonical pattern. XRAYEBATOR_SOURCED gate at 46 blocks root-check, key-load, CLI dispatch in source mode. SMOKE TEST PASSED |
| generate_connection() | _generate_vless_url_pure() | `vless_link=$(_generate_vless_url_pure "$profile_file")` | WIRED | Line 3226 |
| create_profile() | profile JSON .sub_token | `openssl rand -hex 16` + jq_expr | WIRED | Lines 2617, 2674 (--arg), 2690 (jq_expr addition) |
| main_menu migrations | _migrate_subscription_tokens_2026 | `run_migration "subscription_tokens_2026" ... _migrate_subscription_tokens_2026` | WIRED | Line 2427 |
| main_menu UI | happ_subscription_menu | `9) happ_subscription_menu ;;` | WIRED | Line 2503; UI label "Подписка HAPP" at 2487 |
| install_subscription_public_tls | certbot --nginx | `certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect` | WIRED | Line 2067 |
| install_subscription_public_tls | ufw limit | `ufw limit "${pub_port}/tcp"` (NOT allow) | WIRED | Line 2076 (REQ-C08) |
| manage_subscription_menu URL build | _subscription_base_url | `base_url=$(_subscription_base_url); url="${base_url}/sub/${token}"` | WIRED | Lines 2165, 2208 |
| manage_subscription_menu revoke | safe_jq_write .sub_token | `safe_jq_write --arg t "$new_token" '.sub_token = $t' "$pfile"` | WIRED | Line 2241 |
| create_profile success | _subscription_base_url | `_base=$(_subscription_base_url); _url="${_base}/sub/${_tok}"` | WIRED | Lines 2755-2756 |
| happ_subscription_menu status-line | _subscription_base_url | `_status_url=$(_subscription_base_url)` | WIRED | Line 2382 |
| manage_subscription_menu raw vless QR | PQ-aware gate | `pq_enabled=$(jq -r '.pq_enabled // false' "$pfile")` | WIRED | Line 2264, branch at 2269 |
| subhttp.sh (generated) | xrayebator | `source /usr/local/bin/xrayebator` | WIRED | Line 1727 in heredoc body |
| subhttp.sh | .happ_defaults.env | `source "$HAPP_DEFAULTS"` on every request | WIRED | Lines 1731-1732 |
| subhttp.sh path validator | constant-time 404 | `if ! [[ "$path" =~ ^/sub/[a-f0-9]{32}$ ]]; then emit_404` | WIRED | Line 1768 |
| xrayebator-sub.service | subhttp.sh via socat | `ExecStart=/usr/bin/socat ... EXEC:/usr/local/bin/subhttp.sh` | WIRED | Line 1906 |
| install_subscription_server() | .subscription_installed marker | `touch /usr/local/etc/xray/.subscription_installed` | WIRED | Line 1937 |

### Requirements Coverage (REQ-C01..C14)

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REQ-C01 | 7.2 | install_subscription_server() heredoc-генерирует subhttp.sh/unit/nginx/env | SATISFIED | xrayebator:1694 + 3 heredocs (SUBHTTP_EOF, HAPP_DEFAULTS_EOF, SUBUNIT_EOF). Note: nginx site config heredoc lives in install_subscription_public_tls (Plan 7.3 lines 2038-2056) — intentional split, since nginx is only for public TLS flow |
| REQ-C02 | 7.3 | Public TLS default + 443→8443 fallback + UFW limit | SATISFIED | install_subscription_public_tls (1978) + _select_subscription_port (1955) + ufw limit (2076) |
| REQ-C03 | 7.3 | Local-only fallback, UFW не открывается | SATISFIED | install_subscription_local_only (2112), zero UFW calls in function |
| REQ-C04 | 7.1 | 32-hex sub_token via openssl rand -hex 16 + migration | SATISFIED | create_profile generates sub_token (2617-2618) + regex validation (2618), migration `_migrate_subscription_tokens_2026` (1215), registered (2427) |
| REQ-C05 | 7.2 | subhttp.sh strict regex `^/sub/[a-f0-9]{32}$` + constant-time 404 | SATISFIED | subhttp regex at 1768, emit_404 with sleep 0.1 at 1753-1762 |
| REQ-C06 | 7.2 | HTTP 200, content-type text/plain, content-disposition attachment | SATISFIED | Response headers 1836-1849; body comments → vless → routing 1820-1830 |
| REQ-C07 | 7.2 | HAPP metadata as both HTTP headers AND body comments | SATISFIED | Body 1821-1828 + headers 1841-1849 identical key set; routing header at 1849 |
| REQ-C08 | 7.3 | UFW rate-limit `ufw limit <port>/tcp` (NOT allow) | SATISFIED | Line 2076: `ufw limit "${pub_port}/tcp"` (REQ-C08 strict — `ufw allow` only in unrelated open_firewall_port at 524) |
| REQ-C09 | 7.2 | systemd hardening: User=xray + ProtectSystem=strict + ReadOnlyPaths + NoNewPrivileges + MemoryDenyWriteExecute + RestrictAddressFamilies AF_INET AF_INET6 AF_UNIX, opt-in | SATISFIED | All 6 flags literal at SUBUNIT_EOF heredoc (1904, 1909-1914). Opt-in: zero `systemctl enable` in install_subscription_server; only enabled by Plan 7.3 installers after explicit operator menu choice |
| REQ-C10 | 7.1 | Pure `_generate_vless_url_pure(profile_json) -> vless_url_string`, single-file preserved via source guard | SATISFIED | Pure function at 243, no side-effects (no read/qrencode/file writes — only stdout printf). Source-safety guard at 39, XRAYEBATOR_SOURCED gate at 46. SMOKE TEST PASSED: `bash -c 'source ./xrayebator; _generate_vless_url_pure /tmp/test.json'` returns valid vless:// |
| REQ-C11 | 7.1 | One profile = one subscription URL (REVISED — parallel legacy DROPPED) | SATISFIED | subhttp emits exactly one $vless_url (1829); profile_file lookup by .sub_token returns single match (1776-1782) |
| REQ-C12 | 7.3 | Управление подпиской: URL + revoke + QR | SATISFIED | manage_subscription_menu (2150) with 3 actions; revoke via safe_jq_write at 2241 (no restart needed); QR for subscription URL at 2226; raw vless advanced opt at 2252 PQ-aware |
| REQ-C13 | 7.3 | Настройки HAPP: TUI editor for .happ_defaults.env, no restart | SATISFIED | happ_settings_menu (2291) + _happ_edit_field (2335) atomic awk+temp+mv with sanitization; subhttp source-ит env on every request (line 1732) — confirmed no restart needed |
| REQ-C14 | 7.3 | QR policy: subscription URL by default; raw PQ vless NOT QR'd | SATISFIED | M5 fix verified: `pq_enabled=$(jq -r '.pq_enabled // false' "$pfile")` at 2264; QR disabled with warning at 2270-2272 if pq_enabled==true; threshold-based gate (length > N) NOT present |

**All 14 REQ-C requirements: SATISFIED. Zero orphaned, zero blocked.**

### Audit Notes Compliance (07-AUDIT-NOTES.md)

| # | Audit-note correction | Status | Evidence |
| - | --------------------- | ------ | -------- |
| 1 | HAPP standard comment-keys: `#profile-update-interval`, `#profile-title`, `#subscription-userinfo`, `#support-url`, `#profile-web-page-url`, `#announce` | COMPLIANT | All 6 keys emitted in SUBHTTP_EOF body block 1821-1828 |
| 2 | NO old-format `#header:` pseudo-lines | COMPLIANT | `grep '#header:'` inside heredoc returns nothing |
| 3 | Protocol key is `announce` (not `announcement`) | COMPLIANT | Both body comment (1827) and HTTP header (1847) use `announce` |
| 4 | One profile = one vless:// line + routing payload (parallel PQ+legacy out of scope) | COMPLIANT | subhttp emits single vless_url; ROADMAP success criterion 10 explicitly notes "parallel legacy DROPPED — REQ-A07 снят" |
| 5 | Public TLS is default, not loopback | COMPLIANT | happ_subscription_menu (2390-2391) lists public TLS as option 1 (with label "default — требует домен"), local-only as option 2 (with label "fallback") |
| 6 | Routing in BOTH `routing:` header AND `happ://routing/onadd/...` body line | COMPLIANT | Header at 1849 + body line at 1830 |
| 7 | QR is short HTTPS subscription URL, not raw PQ vless:// by default | COMPLIANT | create_profile success-screen QR is `qrencode "$_url"` (subscription URL, 2761). manage_subscription_menu option 1 QRs subscription URL (2226). Raw vless QR is gated advanced option (M5 PQ-aware) |
| 8 | Source-safety guard before xrayebator executes top-level effects | COMPLIANT | Guard at line 39 (canonical form), XRAYEBATOR_SOURCED gate at 46 blocks root-check + key-load. SMOKE TEST: source from non-root user does NOT trigger EUID exit |

**All 8 audit-note corrections: COMPLIANT.**

### Plan-Checker Invariants Re-Verification

| Invariant | Description | Status | Evidence |
| --------- | ----------- | ------ | -------- |
| B1 | `_subscription_base_url()` SOLE source of subscription URL (4+ call sites, 0 inline) | SATISFIED | 4 call sites (2101, 2165, 2382, 2755) + 1 definition (320). Zero inline `https?://\${domain}` or `http://127.0.0.1:8080` builds in manage_subscription_menu, install_subscription_public_tls, happ_subscription_menu (all `awk '/^FN/,/^}$/' \| grep -E '...=.*https?://'` return empty) |
| M5 | PQ-aware QR gate via `jq -r '.pq_enabled // false'`, NOT length threshold | SATISFIED | Line 2264 reads pq_enabled, branch at 2269; no `raw_len.*256` or threshold logic in manage_subscription_menu body |
| M6 | All `read` in new functions use `-r` | SATISFIED | All 8 new functions verified: read -r counts (4,1,4,1,1,1,0,2 = 14 total), bad reads (no -r) all 0 |
| REQ-C08 | `ufw limit` rate-limit, NOT `ufw allow` | SATISFIED | Line 2076: `ufw limit "${pub_port}/tcp"`; the only `ufw allow` (524) is in unrelated open_firewall_port helper for Xray inbounds |
| N8 | Exactly 2 occurrences of `^SUBHTTP_EOF$` (open + close) | SATISFIED | Open at 1716 (`<< 'SUBHTTP_EOF'`), close at 1855 (standalone line) — 1 match for `^SUBHTTP_EOF$` standalone, 1 for `<< 'SUBHTTP_EOF'` opener |
| N9 | Body order comments → vless → routing | SATISFIED | Lines 1821-1830: 6 comment printf, then `$vless_url`, then `$routing_uri` |
| M4 | subscription-userinfo expire via `jq -r '.expire // 4102444800'` override hook | SATISFIED | Line 1813: `expire_value=$(jq -r '.expire // 4102444800' "$profile_file" 2>/dev/null)` |
| M7 | pq_enabled lookup BEFORE case in generate_connection() | SATISFIED | pq_enabled at line 3202, case $transport at 3246 (no quotes around $transport — semantically equivalent to plan's "case \"$transport\""; intent satisfied) |

**All plan-checker invariants: SATISFIED.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| xrayebator | 1812 | Comment: "placeholder для v2.0" | INFO | Intentional documented limitation. `subscription-userinfo expire=4102444800` is hardcoded year-2099 placeholder; real-time stats deferred to post-v2.0. Override hook via `.expire` field already wired (1813) — zero refactoring needed when tracking comes |
| xrayebator | 1375, 2349 | `mktemp /tmp/...XXXXXX` | INFO | Legitimate use of mktemp template syntax, not a placeholder anti-pattern |

**No TODO/FIXME/HACK markers. No stub returns. No empty handlers.**

### Smoke Test Results

1. **bash syntax:** `bash -n xrayebator && bash -n install.sh && bash -n update.sh` → all OK
2. **source safety:** `bash -c 'source ./xrayebator; declare -F _generate_vless_url_pure _subscription_base_url install_subscription_server manage_subscription_menu happ_subscription_menu happ_settings_menu install_subscription_public_tls install_subscription_local_only _migrate_subscription_tokens_2026 _happ_edit_field _select_subscription_port'` → all 11 functions exported, NO EUID exit, NO main_menu invocation
3. **helper sanity:** `_subscription_base_url` with no markers → returns `http://127.0.0.1:8080` (correct fallback)
4. **pure function smoke:** Tested with mock TCP profile JSON; returns canonical `vless://<uuid>@<ip>:443?encryption=none&flow=xtls-rprx-vision&...` (byte-identical query-string format to pre-refactor generate_connection)
5. **heredoc markers:** SUBHTTP_EOF / SUBUNIT_EOF / HAPP_DEFAULTS_EOF / NGINX_EOF each appear as 1 open (`<< 'MARKER'`) + 1 close (standalone) — N8 satisfied
6. **migration registration:** `run_migration "subscription_tokens_2026" ... _migrate_subscription_tokens_2026` at 2427 (10th run_migration call in main_menu, was 9)
7. **menu entry visibility:** main_menu prints "Подписка HAPP" label at 2487 with option key "9", dispatches to happ_subscription_menu at 2503

### Human Verification Required

No blocking items. The following CAN be tested by human on real VPS but DO NOT block Phase 7 verdict — they are integration checks for Phase 7+8 combined run:

1. **End-to-end HAPP one-tap import**
   - Test: Create profile → Install public TLS via menu 9 → Copy subscription URL → Import into HAPP client
   - Expected: HAPP imports profile + routing in one click; profile_name displays in client; vless connection works
   - Why human: external HAPP client integration, real DNS/cert flow

2. **certbot --nginx on real domain**
   - Test: Run install_subscription_public_tls with a real domain pointing to VPS
   - Expected: certbot succeeds, https://<domain>/sub/<token> returns 200 with HAPP body
   - Why human: requires real DNS + Let's Encrypt rate-limit window

3. **constant-time 404 timing**
   - Test: Curl with valid token vs random invalid token, measure response time
   - Expected: Both >= 100ms with similar standard deviation (no timing oracle)
   - Why human: timing-side-channel measurement requires real network

4. **revoke without restart**
   - Test: Active HAPP client polling subscription → revoke → next poll returns 404 while existing vless connection remains alive
   - Expected: New URL works, old URL 404s, no Xray restart observed
   - Why human: real-time client polling behavior

5. **port preflight when Xray listens on 443**
   - Test: Configure Xray inbound on port 443 (Reality), then run install_subscription_public_tls
   - Expected: `_select_subscription_port` detects xray process, falls back to 8443, prints warning
   - Why human: requires real Xray inbound with TCP transport on 443

### Gaps Summary

**No gaps found.** All 13 observable truths verified, all 14 REQ-C requirements satisfied, all 8 audit-note corrections compliant, all 8 plan-checker invariants (B1, M4, M5, M6, M7, N8, N9, REQ-C08) maintained. Zero orphaned requirements, zero stubs, zero anti-pattern blockers.

The Phase 7 codebase delivers exactly what the goal promised:
- **One menu item → public TLS subscription endpoint** (menu 9 → happ_subscription_menu → option 1 public TLS)
- **Each profile = one HAPP subscription URL** (sub_token + _subscription_base_url + /sub/<token>)
- **HAPP one-tap imports routing + one vless:// line** (subhttp body order: comments → vless → routing, with routing as both HTTP header and body line)
- **revoke per-profile works** (safe_jq_write of new sub_token, no restart, old URL becomes 404)

### Recommendation

**PROCEED TO PHASE 8.**

Phase 7 (HAPP Subscription Server) is complete, verified, and ready for VPS smoke testing. The user can confidently test the combined Phase 6+7 build on a real VPS. The single deferred limitation (subscription-userinfo expire placeholder) is documented and the override hook is already wired for future post-v2.0 work.

Risk assessment for VPS smoke:
- LOW: bash syntax, function definitions, source-safety guard, helper logic — all verified locally
- MEDIUM: certbot --nginx flow depends on real DNS and Let's Encrypt rate-limits (mitigated via local-only fallback)
- LOW: systemd hardening flags — verified literal match against REQ-C09; if MemoryDenyWriteExecute breaks socat/bash on specific kernel, single config edit
- LOW: HAPP client compat — subscription body uses documented HAPP standard keys per audit notes

---

_Verified: 2026-05-11T08:43:55Z_
_Verifier: Claude (gsd-verifier, Opus 4.7)_
