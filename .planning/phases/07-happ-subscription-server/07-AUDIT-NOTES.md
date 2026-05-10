# Phase 7 Audit Notes — HAPP Subscription Server

Created during v2.0 plan audit on 2026-05-10 to make the roadmap phase concrete on disk.

Authoritative corrections before planning:

- Subscription body metadata must use HAPP standard comment keys directly: `#profile-update-interval`, `#profile-title`, `#subscription-userinfo`, `#support-url`, `#profile-web-page-url`, `#announce`.
- Do not emit old `#header:` pseudo-lines.
- Protocol key is `announce`, not `announcement`.
- One xrayebator profile is one HAPP subscription URL. The subscription body contains one `vless://` line for that profile plus the HAPP routing import payload.
- Public TLS is the default operator flow: nginx + certbot in front of the local handler. Prefer 443, fallback 8443 if 443 is occupied. Loopback-only mode is fallback/dev, not the primary UX.
- Include routing both as a `routing: happ://routing/onadd/...` header and as a `happ://routing/onadd/...` line in the subscription body. HAPP docs support routing delivery through headers/body parameters and URL/QR import.
- QR policy: generate QR for the short HTTPS subscription URL. Do not generate raw PQ `vless://` QR by default because `encryption=` can make it too large and unreliable to scan.
- Parallel PQ+legacy links for one profile are out of scope because REQ-A07 was dropped.
- If `subhttp.sh` sources `xrayebator`, Phase 7 must first add a non-interactive/source-safe guard; current top-level root/key checks would otherwise execute during handler startup.
