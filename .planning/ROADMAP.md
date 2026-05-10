# Roadmap — Xrayebator v2.0 (Post-Quantum & HAPP)

**Milestone:** v2.0 — Post-Quantum & HAPP
**Phases:** 5 (Phase 4 → Phase 8, продолжение нумерации после v1.0)
**Total requirements:** 44 (D×7 + B×5 + A×10 + C×13 + E×4 + F×5)
**Estimated total plans:** 11
**Date:** 2026-05-09
**Source:** REQUIREMENTS.md + research/SUMMARY.md (12 decisions FINAL)

---

## Phases

- [x] **Phase 4: Foundation (Audit Fixes)** — закрыть 6 P0/P1 багов аудита и ввести `run_migration` helper, без которого все v2.0 миграции через bare jq/restart — рулетка ✓ 2026-05-09
- [x] **Phase 5: Auto-update Xray-core + xmux explicit** — `update_xray_core()` в update.sh + явный xmux-блок для XHTTP-инбаундов (completed 2026-05-09)
- [ ] **Phase 6: Post-Quantum (VLESS Encryption + ML-KEM)** — дефолт XHTTP+Reality+`mlkem768x25519plus.native`, per-profile upgrade in-place, legacy-fallback на уровне отдельных профилей через `create_profile_menu` (REQ-A07 parallel inbound DROPPED 2026-05-10 — Xray не поддерживает два инбаунда на одном порту)
- [ ] **Phase 7: HAPP Subscription Server** — public TLS subscription per profile (nginx+LE → local handler), HAPP metadata+routing, QR for subscription URL, revoke menu
- [ ] **Phase 8: Polish (SNI 2026 + experimental Vision Seed + bypass routing)** — обновлённый SNI list под РФ-доноров + advanced testpre/testseed + меню обхода VPN для Steam/банков/госуслуг

---

## Phase Details

### Phase 4: Foundation (Audit Fixes)

**Goal**: Все мутации config.json и любые рестарты Xray проходят через единый safe-pattern (size-check → xray test → atomic mv → safe_restart_xray → marker), включая lifecycle-скрипты install.sh/update.sh, чтобы v2.0-миграции не могли обнулить конфиг или зациклить миграцию.

**Depends on**: Nothing (foundational, первая фаза милстоуна)

**Requirements**: REQ-D01, REQ-D02, REQ-D03, REQ-D04, REQ-D05, REQ-D06, REQ-D07

**Success Criteria** (что должно быть TRUE):
1. `update.sh:351-352` (DNS migration) и `update.sh:370-373` (QUIC rule) пишут config.json через safe-pattern: jq → temp → `[[ -s temp ]]` → `xray run -test -config temp` → atomic mv. Bare `jq > tmp && mv tmp file` отсутствует во всём репозитории.
2. `install.sh:384` и `update.sh:388` перед `systemctl restart xray` запускают `xray run -test -config /usr/local/etc/xray/config.json`; на failure — restore latest backup и abort.
3. `install.sh:177-178` парсит вывод `xray x25519` через robust regex и проходит на обоих форматах (`Private key:` и `PrivateKey:`); `bash -n install.sh` проходит.
4. В xrayebator появляется helper `run_migration <marker_name> <description> <fn_name>`, который touch-ит маркер только после успешного `safe_restart_xray()`. Если рестарт упал — маркер не ставится, миграция повторится при следующем запуске.
5. Все existing миграции (xhttp_mode, xhttp_extra, routing) переписаны на `run_migration`. Прямого touch-а маркера в xrayebator не остаётся.
6. На свежей установке и на симулированной v1.0-установке оба сценария (`install.sh` + `update.sh`) проходят `bash -n` и доводят сервис до `active (running)` с валидным config.json.

**Plan structure suggestion**:
- **Plan 4.1 — Lifecycle scripts hardening (install.sh + update.sh)**: REQ-D01, REQ-D02, REQ-D03, REQ-D04, REQ-D06. Инлайн safe-pattern (`safe_jq_write` недоступен в lifecycle-скриптах per CLAUDE.md, поэтому inline jq + size validation + xray test) и pre-validate-before-restart, плюс regex-фикс x25519.
- **Plan 4.2 — Migration helper rollout**: REQ-D05, REQ-D07. Ввести `run_migration` в xrayebator, переписать существующие маркер-миграции, отрегрессить на `bash -n`.

**Risks**:
- **Регрессия на v1.0-апгрейдах:** изменение порядка backup → mv может задеть существующие маркер-файлы. *Митигация:* запускать `update.sh` на снапшоте v1.0-установки в LXC до коммита.
- **xray run -test может падать на legacy DNS-конфигах** (некоторые v1.0 установки имели `127.0.0.1` от AdGuard): pre-validate отфильтрует их и зациклит откат. *Митигация:* в pre-validate допускать только non-zero exit от собственно xray (не от absent-binary), и давать читабельный ERROR с путём к backup.

**Estimated complexity**: M (2 plans, ~120-180 минут чистой работы; критично, но scope узкий и хорошо определён)

**Plans:** 2 plans

Plans:
- [x] 04-01-lifecycle-scripts-hardening-PLAN.md — install.sh + update.sh: inline safe-pattern, pre-validate-before-restart, robust x25519 parser (REQ-D01..D04, D06)
- [x] 04-02-migration-helper-rollout-PLAN.md — xrayebator: run_migration helper + рефакторинг 6 миграций main_menu (REQ-D05, D07)

---

### Phase 5: Auto-update Xray-core + xmux explicit

**Goal**: Оператор может обновить Xray-core одной командой меню (или получить nag, если отстал на 2+ minor versions), а все XHTTP-инбаунды — старые и новые — несут явный xmux-блок, прозрачный против Сибирского behavioral DPI.

**Depends on**: Phase 4 (нужен `run_migration` для `.xmux_explicit_2026` и safe-pattern в update.sh для `.zip` swap)

**Requirements**: REQ-B01, REQ-B02, REQ-B03, REQ-B04, REQ-B05 (последний — explicit removal Vision Seed flow value)

**Success Criteria**:
1. `update_xray_core()` в update.sh: detect `uname -m` → MACHINE, читает latest stable tag из GitHub Releases API, сравнивает с `xray version`, скачивает `Xray-linux-${MACHINE}.zip` + `.dgst`, **обязательно** сверяет SHA-256 (официальный формат `SHA2-256= <hex>`, fallback `256=`/`SHA256=`), self-test нового binary через `version`, бэкапит старый в `xray.bak.$(date +%s)`, atomic `install -m 755`, restart + rollback бинарника на failure.
2. Auto-update недоступен по cron — только manual trigger через новый пункт меню в xrayebator. Если installed version отстаёт от latest на >2 minor versions — nag-сообщение в `main_menu` (без блокировки).
3. `install.sh` блок скачивания Xray переписан на тот же `update_xray_core()` (single source of truth; никакого дубля логики скачивания).
4. Migration `.xmux_explicit_2026` (через `run_migration` из Phase 4) патчит **все** XHTTP-инбаунды, добавляя явный xmux-блок (`maxConcurrency: "1-1"`, `hMaxRequestTimes: "600-900"`, `hMaxReusableSecs: "1800-3000"`, `hKeepAlivePeriod: 30`). Существующие профили продолжают работать без отвала клиентов.
5. Поле `max_connections` нигде не появляется (mutually exclusive с `maxConcurrency`).
6. Поиск по репозиторию по `xtls-rprx-vision-seed` даёт 0 совпадений (REQ-B05 — phantom feature, удалён из scope; experimental замена живёт в Phase 8).
7. После Phase 5 сервер запущен на latest stable Xray-core; минимум для Phase 6 — Xray-core ≥ 25.9.5, где появился `xray vlessenc`.

**Plan structure suggestion**:
- **Plan 5.1 — Auto-update + install.sh refactor**: REQ-B01, REQ-B02, REQ-B03, REQ-B05. Реализация `update_xray_core()`, manual menu trigger + nag, удаление дубля из install.sh, чистка любых упоминаний vision-seed flow.
- **Plan 5.2 — xmux explicit migration**: REQ-B04. Migration `.xmux_explicit_2026` через `run_migration`, тест на mixed inbounds (XHTTP + не-XHTTP).

**Risks**:
- **`xray version` парсинг ломается на pre-release tags** (`-rc1`, `-beta`): semver compare на >2 minor versions может ложно сработать. *Митигация:* парсить только X.Y, игнорировать suffix; nag по строгому `lt` с двумя minor.
- **Сетевая недоступность GitHub API на тарифах с РКН-фильтром на VPS:** auto-update через прямой `api.github.com` может failure-уть. *Митигация:* fallback на `https://github.com/XTLS/Xray-core/releases/latest` redirect-парсинг + ясный error message с инструкцией ручной установки.

**Estimated complexity**: M (2 plans, авто-апдейт логически непростой, но границы чистые)

---

### Phase 6: Post-Quantum (VLESS Encryption + ML-KEM)

**Goal**: Каждый новый XHTTP+Reality профиль ship-ит pq-инбаунд (mlkem768x25519plus.native), оператор может in-place апгрейднуть существующий профиль на PQ, видит first-run banner с матрицей совместимости клиентов и понимает что клиенты без PQ-поддержки нужно обслуживать через отдельный legacy-профиль (TCP+Vision), создаваемый через `create_profile_menu`.

**Depends on**: Phase 4 (safe_jq_write + run_migration + safe_restart обязательны для PQ-миграций), Phase 5 (latest stable Xray-core; `xray vlessenc` появился в 25.9.5)

**Requirements**: REQ-A01, REQ-A02, REQ-A03, REQ-A04, REQ-A05, REQ-A06, ~~REQ-A07~~ (DROPPED 2026-05-10), REQ-A08, REQ-A09 (REVISED), REQ-A10

**Success Criteria**:
1. `install.sh` после генерации x25519 вызывает `xray vlessenc`, парсит вывод и сохраняет `decryption` в `/usr/local/etc/xray/.vless_decryption` и `encryption` в `/usr/local/etc/xray/.vless_encryption`. Permissions `chmod 600`, ownership `xray:xray`.
2. Migration `.mlkem_keys_generated` через `run_migration` догенерирует ключи на v1.0-установках, если файлы отсутствуют.
3. xrayebator объявляет константы `VLESS_DECRYPTION_FILE` и `VLESS_ENCRYPTION_FILE` рядом с `PRIVATE_KEY_FILE`/`PUBLIC_KEY_FILE`.
4. `add_inbound()` для XHTTP-инбаундов добавляет в `settings.decryption` содержимое `.vless_decryption`. Mode по умолчанию **`native`** (FINAL после second opinion codex+kimi). `xorpub` доступен только через скрытое advanced-меню.
5. `generate_connection()` (через pure-функцию) для XHTTP+pq профилей добавляет URL-encoded `encryption=...` параметр в vless:// URL.
6. Дефолтный пресет в `create_profile_menu()` — XHTTP + Reality + Encryption native. TCP+Vision доступен как опциональный legacy выбор.
7. ~~При создании XHTTP+pq профиля автоматически создаётся **второй** parallel inbound на том же порту: TCP+Vision без encryption, отдельный UUID. Profile JSON хранит оба UUID; `generate_connection` возвращает обе vless:// строки.~~ **DROPPED 2026-05-10** — REQ-A07 не реализуем (см. требования). Org fallback — отдельный legacy-профиль через `create_profile_menu` (REQ-A06 уже даёт выбор PQ vs TCP+Vision при создании).
8. Migration `.xhttp_default_2026` обновляет ТОЛЬКО default-template для `create_profile_menu`, не трогая существующие inbounds.
9. *(REVISED 2026-05-10)* В меню существующего профиля появляется кнопка "Upgrade to post-quantum" с явным warning о клиентской совместимости (legacy-клиенты ЭТОГО профиля отвалятся). Кнопка **in-place** заменяет transport+settings профиля на XHTTP+Reality+VLESS Encryption native, сохраняя UUID и порт. Profile JSON обновляется (новый transport+encryption flag). `safe_restart_xray()` после изменения. Никакого parallel-inbound — REQ-A07 DROPPED.
10. **First-run banner** при первом запуске после миграции v1.0→v2.0: матрица совместимости (HAPP 2.10+ ✓, sing-box ✗, Shadowrocket ?, v2rayNG 1.10+ ✓), краткое описание PQ. После показа — touch `.pq_banner_shown`.

**Plan structure suggestion** *(REVISED 2026-05-10 после drop REQ-A07)*:
- **Plan 6.1 — PQ key infrastructure**: REQ-A01, REQ-A02, REQ-A03. install.sh + migration `.mlkem_keys_generated` + константы файлов. Минимальный, но foundational для остальных планов фазы. **Audit update 2026-05-10:** parser должен использовать `xray vlessenc` без флагов и выбирать секцию `Authentication: ML-KEM-768`; minimum version — 25.9.5.
- **Plan 6.2 — PQ profile creation**: REQ-A04, REQ-A05, REQ-A06, REQ-A08. `add_inbound` для XHTTP+pq (одно поле `decryption` в `inbound.settings`), generate_connection с одной vless:// (с `encryption=` query param), дефолтный пресет XHTTP+Reality+native, migration `.xhttp_default_2026` обновляет ТОЛЬКО default-template. Parallel legacy DROPPED — упрощён scope.
- **Plan 6.3 — Per-profile upgrade button + first-run banner**: REQ-A09 (REVISED, in-place replace), REQ-A10. UX-слой: кнопка in-place upgrade в меню профиля с warning, banner с матрицей совместимости (HAPP/v2rayNG/v2rayN/Shadowrocket ✓; sing-box/Hiddify/mihomo ✗) + marker `.pq_banner_shown` + рекомендация создавать legacy-профиль для несовместимых клиентов.

**Risks**:
- **Live-disconnect при upgrade существующего профиля**: in-place замена inbound на XHTTP+PQ требует `safe_restart_xray()`, который reload-ит клиентов на этом сервере. *Митигация:* предупреждение в кнопке "Upgrade" + рекомендация создать отдельный legacy TCP+Vision профиль для несовместимых клиентов и делать upgrade вне peak-часов.
- **Profile JSON schema drift**: profile-файл получает `schema_version: 2` + `pq_enabled: true`, но НЕ хранит `uuid_legacy`/`port_legacy`. *Митигация:* read-функции используют `jq -r '.pq_enabled // false'`; legacy v1-профили остаются валидными.
- **`xray vlessenc` exit-code/format регрессия в новых релизах**: парсинг вывода может сломаться. *Митигация:* добавить тест парсинга в `bash -n` (заглушка `xray` через PATH-shim), захардкодить minimum supported Xray version.

**Estimated complexity**: M *(downgrade from L после drop REQ-A07 2026-05-10)* — 3 plans, центральная фаза v2.0-value, но без REQ-A07 архитектура линейна: одно поле `decryption` на инбаунде + один UUID + одна vless:// строка. Сложность остаётся в robustness (vlessenc parser checkpoint, schema-version миграция profile JSON).

**Plans:** 3 plans

Plans:
- [ ] 06-01-pq-key-infrastructure-PLAN.md — vlessenc generation в install.sh (с MANDATORY checkpoint на формат stdout) + миграция .mlkem_keys_generated через run_migration + константы $VLESS_DECRYPTION_FILE/$VLESS_ENCRYPTION_FILE (REQ-A01, A02, A03)
- [ ] 06-02-pq-profile-creation-PLAN.md — add_inbound XHTTP пишет decryption из файла + generate_connection добавляет ?encryption= URL-encoded query-param + create_profile_menu reorder (XHTTP+PQ как #1, TCP+Vision сохранён как #4 legacy) + миграция .xhttp_default_2026 (no-op marker, REQ-A08 strict — НЕ трогает existing inbounds) (REQ-A04, A05, A06, A08)
- [ ] 06-03-upgrade-button-and-banner-PLAN.md — пункт меню 8 ‘Обновить профиль до post-quantum’ с IN-PLACE заменой transport (REQ-A09 REVISED, UUID и port сохраняются) + одноразовый show_pq_banner_once с матрицей совместимости 2026-05-10 (HAPP/v2rayNG/v2rayN/Shadowrocket ✓; sing-box/Hiddify/mihomo/NekoBox ✗; Streisand ?) и рекомендацией создать отдельный legacy-профиль (REQ-A09, A10)

---

### Phase 7: HAPP Subscription Server

**Goal**: Оператор включает один пункт меню — получает public TLS subscription endpoint. Каждый xrayebator profile становится одной HAPP subscription URL: HAPP one-tap импортирует routing profile + одну vless:// строку текущего транспорта (PQ или legacy), metadata и revoke остаются per-profile.

**Depends on**: Phase 4 (safe-pattern для всех мутаций), Phase 6 (REQ-C10 рефакторит `generate_vless_url` в pure-функцию, которую subhttp.sh source-ит — функция должна уже знать про PQ-параметр; REQ-C11 *(REVISED 2026-05-10)* отдаёт ОДНУ ссылку, parallel legacy DROPPED)

**Requirements**: REQ-C01, REQ-C02, REQ-C03, REQ-C04, REQ-C05, REQ-C06, REQ-C07, REQ-C08, REQ-C09, REQ-C10, REQ-C11, REQ-C12, REQ-C13, REQ-C14

**Success Criteria**:
1. `install_subscription_server()` функция в xrayebator heredoc-генерирует `/usr/local/bin/subhttp.sh` (local handler), `/etc/systemd/system/xrayebator-sub.service` (unit), nginx site config и `/usr/local/etc/xray/.happ_defaults.env` (configurable env). Опт-ин через пункт меню.
2. **Public TLS default**: installer требует домен, ставит nginx + certbot, проксирует `https://<domain>/sub/<token>` на `127.0.0.1:8080`. Использовать `443`, если свободен; fallback `8443`, если `443` занят Xray/system service. UFW limit на выбранный public port.
3. **Local-only fallback**: socat на `127.0.0.1:8080`, порт не открывается в UFW. Используется для теста/нет домена/certbot failure.
4. Каждый профиль получает 32-hex token (`openssl rand -hex 16`), хранится в profile JSON как `sub_token`. Migration `.subscription_tokens_2026` через `run_migration` догенерирует токены на existing профилях. Success screen создания профиля показывает subscription URL/QR как основной output.
5. `subhttp.sh` принимает только requests `^/sub/[a-f0-9]{32}$` (strict regex). Любой другой path → constant-time 404 (sleep 0.1s + same body) против token enumeration. Path traversal/header injection blocked.
6. Response: HTTP 200, `content-type: text/plain; charset=utf-8`, `content-disposition: attachment; filename="xrayebator-${token:0:8}.txt"`. Body — HAPP standard subscription: metadata comments (`#profile-title: ...`), routing import line `happ://routing/onadd/<base64url-json>`, затем одна `vless://` строка.
7. Полный набор HAPP metadata как HTTP-headers И как body comments с теми же именами: `subscription-userinfo: upload=0; download=0; total=0; expire=4102444800` (placeholder v2.0), `profile-update-interval: 24` (hardcoded), `profile-title: base64:$ENCODED`, `support-url`, `profile-web-page-url`, `announce: base64:$ENCODED` (если задан), `routing: happ://routing/onadd/$ENCODED_ROUTING`.
8. `xrayebator-sub.service` использует `User=xray`, `ProtectSystem=strict`, `ReadOnlyPaths=/usr/local/etc/xray`, `MemoryDenyWriteExecute=yes`, `NoNewPrivileges=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`. Opt-in через `systemctl enable`.
9. `generate_vless_url` рефакторен в pure `_generate_vless_url_pure(profile_json) -> vless_url_string` (без side-effects). subhttp.sh source-ит `/usr/local/bin/xrayebator` и вызывает функцию для каждого профиля. Single-file constraint сохраняется.
10. *(REVISED 2026-05-10)* Один profile = одна subscription URL. Subscription отдаёт HAPP routing profile + ОДНУ vless:// ссылку (соответствующую transport профиля — PQ или legacy). Parallel legacy fallback DROPPED — REQ-A07 снят.
11. Меню "Управление подпиской": показать subscription URL с токеном, revoke (regenerate `sub_token` + restart subhttp), показать QR-код subscription URL. Raw `vless://` — advanced fallback.
12. Меню "Настройки HAPP": редактировать `.happ_defaults.env` (title/support_url/profile_web_page_url/announce) через TUI. Изменения применяются без рестарта (subhttp source-ит env на каждый request).
13. QR policy: основной QR — короткая HTTPS subscription URL. Raw PQ `vless://` с `encryption=` не кодировать в QR по умолчанию; показывать copy-text/warning. Legacy raw QR оставить только как advanced fallback при короткой строке.

**Plan structure suggestion**:
- **Plan 7.1 — Pure VLESS URL extraction + token migration**: REQ-C04, REQ-C10, REQ-C11. Foundational рефакторинг (pure function для re-use) + token-generation migration + "profile output = subscription URL" contract.
- **Plan 7.2 — subhttp.sh + HAPP body/headers + routing**: REQ-C01, REQ-C05, REQ-C06, REQ-C07, REQ-C09. Local handler, source-safe guard, strict regex routing, metadata comments, `routing` header/body line, one vless payload.
- **Plan 7.3 — Public TLS default + management menus + QR policy**: REQ-C02, REQ-C03, REQ-C08, REQ-C12, REQ-C13, REQ-C14. nginx+LE default flow, 443/8443 conflict handling, local-only fallback, revoke menu, `.happ_defaults.env` TUI, subscription QR.

**Risks**:
- **certbot/domain friction**: public TLS требует домен с A/AAAA на VPS и свободный HTTPS port. *Митигация:* preflight DNS check, детект занятости 443, fallback на 8443, local-only fallback если LE не прошёл.
- **socat per-request fork model плохо масштабируется** (HAPP-клиенты могут polling-ить каждый час): на 100+ профилей handler может грузить CPU. *Митигация:* nginx rate-limit + cache headers; в v2.1 можно переехать на Python http.server, если станет проблемой.
- **Source-инг xrayebator из subhttp.sh** загружает 2500+ строк на каждый request, включая интерактивные read-prompts; нужна изоляция (`set +e`, ранний return из main, guard `if [[ "${BASH_SOURCE[0]}" == "${0}" ]]`). *Митигация:* добавить guard-блок в начало xrayebator, источенный режим запрещает интерактивные секции.
- **`profile-title: base64:` ломается на эмодзи/кириллице если base64-кодирование не utf-8 safe**: классический bug HAPP интеграций. *Митигация:* `printf '%s' "$name" | base64 -w0` (без переноса строк), unit test через bash -c.
- **Raw PQ QR слишком большой**: `encryption=` делает строку длинной и плохо сканируемой. *Митигация:* QR только для subscription URL; raw PQ показывать copy-text.

**Estimated complexity**: XL (3 plans, 13 требований, два режима транспорта, security-критичный handler, рефакторинг существующей функции в pure form. Самая большая фаза милстоуна.)

---

### Phase 8: Polish (SNI 2026 + experimental Vision Seed + bypass routing)

**Goal**: SNI list актуализирован под РФ-доноров 2026 (банки, логистика, маркетплейсы), оператор получает опциональное experimental-меню для testpre/testseed и полноценное меню обхода VPN (Steam, банки, gosuslugi, OZON, Yandex), а HAPP announce-текст редактируется одной кнопкой.

**Depends on**: Phase 7 (REQ-E04 — announce читается subhttp.sh; bypass-routing использует safe-pattern из Phase 4)

**Requirements**: REQ-E01, REQ-E02, REQ-E03, REQ-E04, REQ-F01, REQ-F02, REQ-F03, REQ-F04, REQ-F05

**Success Criteria**:
1. Migration `.sni_list_2026` через `run_migration`: добавляет в priority 1 `lk.usbank.ru`, `online.vtb.ru`, `www.cdek.ru`, `www.pochta.ru`, `www.avito.ru`; добавляет в priority 3 `github.com`; удаляет `apple.com` и любые `*.apple.com`/`*.icloud.com`. Не добавляет `twitch.tv`, `microsoft.com`, `live.com` (TLS fingerprint mismatch). User custom SNI сохраняется (не трогать).
2. Команда `xrayebator probe-test`: для каждого SNI делает `curl -I https://<sni>` с VPS, отчёт о доступности и handshake-success rate. Выводится перед миграцией для valid-check (рекомендация запускать руками).
3. Advanced submenu в меню профиля: experimental Vision Seed (`testpre uint32`/`testseed []uint32` поля на VLESS account). Off-by-default. Warning "experimental, может сломать клиентов". Сохраняется в profile JSON и добавляется в `add_inbound`.
4. Пункт меню "Установить announcement для HAPP": запрашивает текст, сохраняет в `/usr/local/etc/xray/announce.txt`. subhttp.sh из Phase 7 читает этот файл и эмиттит как HAPP `announce` header/body comment (base64).
5. Новое меню "Управление обходом VPN" в `main_menu`: показывает текущие domain rules, позволяет добавить/удалить/сбросить.
6. При first-time setup (или через меню) предлагается установить дефолтные исключения: Steam (`steamcontent.com`, `steamcdn-a.akamaihd.net`, `steam-chat.com`, `steamcommunity.com`, `cm.steampowered.com`), RU-сервисы (`gosuslugi.ru`, `nalog.gov.ru`, `mos.ru`), RU-банки (`sberbank.ru`, `vtb.ru`, `tinkoff.ru`, `alfabank.ru`), RU e-commerce (`ozon.ru`, `wildberries.ru`, `avito.ru`), Yandex (`yandex.ru`, `ya.ru`, `mail.yandex.ru`).
7. Bypass-rule добавляется в `routing.rules` через `safe_jq_write` с `outboundTag: "direct"` (существующий freedom outbound), используя `domain:` префикс (suffix matching) для покрытия subdomains.
8. Migration `.bypass_routing_2026` опциональная (НЕ force): при первом запуске v2.0 показывает меню "Хочешь добавить дефолтные bypass-исключения?" — юзер выбирает.
9. После каждого изменения bypass rules — `safe_restart_xray()`.

**Plan structure suggestion**:
- **Plan 8.1 — SNI 2026 + probe-test + experimental Vision Seed + HAPP announce**: REQ-E01, REQ-E02, REQ-E03, REQ-E04. Группа мелких независимых улучшений, можно сделать одним планом.
- **Plan 8.2 — Bypass routing menu**: REQ-F01, REQ-F02, REQ-F03, REQ-F04, REQ-F05. Цельная фича: menu + defaults + safe_jq_write на routing.rules + migration + safe_restart.

**Risks**:
- **User custom SNI determination**: как отличить добавленные пользователем SNI от ship-ed defaults? *Митигация:* поддерживать в xrayebator hardcoded `KNOWN_DEFAULTS_v1` set; всё, что не в этом set — user custom, не трогать.
- **Конфликт между bypass routing и pq-trigger SNI**: если юзер добавит в bypass `*.cloudflare.com`, а Reality SNI указан на cloudflare-сертификат — handshake пойдёт мимо VPN. *Митигация:* в TUI меню при добавлении домена warn-ить если он совпадает с любым SNI из profiles/*.json.

**Estimated complexity**: M (2 plans, набор полировочных и UX-фич без архитектурной сложности; bypass routing — самая большая часть)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Foundation (Audit Fixes) | 2/2 | Complete | 2026-05-09 |
| 5. Auto-update + xmux explicit | 2/2 | Complete | 2026-05-09 |
| 6. Post-Quantum (VLESS Encryption + ML-KEM) | 0/3 | Not started | - |
| 7. HAPP Subscription Server | 0/3 | Not started | - |
| 8. Polish (SNI + Vision Seed + Bypass) | 0/2 | Not started | - |

---

## Roadmap-level risks

1. **Cumulative migration debt на v1.0 → v2.0 апгрейде.** К Phase 8 на свежем v1.0 сервере выполнится 5+ новых миграций (`.xmux_explicit_2026`, `.mlkem_keys_generated`, `.xhttp_default_2026`, `.subscription_tokens_2026`, `.sni_list_2026`, опционально `.bypass_routing_2026`). Каждая делает backup + safe_restart. Совокупно — 5-6 рестартов Xray за один первый запуск, что отвалит подключённых клиентов на ~30 секунд. *Митигация:* в `main_menu()` при detect нескольких pending миграций показывать pre-flight warning + предлагать "выполнить все миграции" одним батчем (один backup + один restart в конце). Если хотя бы одна migration падает — rollback всех в этом батче (chain marker).
2. **Phase 7 single-file constraint vs subhttp.sh source-инг.** Пункт CLAUDE.md "Single-file: весь runtime-код в одном файле xrayebator" формально нарушается появлением `subhttp.sh`. Архитектурное оправдание: subhttp.sh — heredoc-генерируется ИЗ xrayebator (zero standalone source), является runtime-handler-ом, не business logic-ом. *Митигация:* документировать в CLAUDE.md после Phase 7, что "single-file" означает "single source-of-truth" — `subhttp.sh` рождается из xrayebator-heredoc и source-ит его обратно для pure-функций. Если оправдание не убедительно — fallback: inline subscription-handler внутри xrayebator через alternative socat exec (`socat ... EXEC:"xrayebator --sub-handler"`).
3. **Клиентская совместимость VLESS Encryption (`mlkem768x25519plus.native`) фрагментирована.** На момент 2026-05-10: HAPP 2.10+ ✓, v2rayNG 1.10+ ✓, v2rayN ✓ (PR #7782), Shadowrocket ✓ (обновлено 2026-05-10), sing-box ✗, NekoBox ✗, Hiddify ✗ (Issue 2026-03-09), mihomo ✗. ~30% юзеров на несовместимых клиентах отвалят без fallback. *Митигация (REVISED 2026-05-10 после drop REQ-A07):* parallel-inbound невозможен (Xray Issue #2108) — fallback ТОЛЬКО на уровне отдельных профилей. Юзер создаёт PQ-профиль для совместимых клиентов и отдельный legacy TCP+Vision профиль для остальных через `create_profile_menu` (REQ-A06 уже даёт выбор). First-run banner (REQ-A10) явно показывает матрицу + рекомендует создать legacy-профиль. Existing профили НЕ авто-мигрируются — только opt-in через "Upgrade to post-quantum" кнопку (REQ-A09 REVISED — in-place replace).

---

## Goal-backward verification

Mapping milestone-level success criteria из REQUIREMENTS.md → phase(s), которые их доставляют:

| Milestone Success Criterion | Delivering Phase(s) |
|---|---|
| Свежая установка v2.0 на чистый Debian 12/Ubuntu 22.04 проходит без ошибок и шипит PQ-профиль (XHTTP+Reality+Encryption native); юзер может вручную создать дополнительный legacy TCP+Vision профиль для несовместимых клиентов | Phase 4 (safe install.sh) + Phase 6 (PQ keys generation, default preset XHTTP+pq, REQ-A06 даёт выбор legacy при создании профиля) |
| Существующие v1.0 установки апгрейдятся через update.sh без потери конфига и без отвала подключённых клиентов | Phase 4 (safe-pattern для DNS/QUIC миграций + pre-validate перед restart) + Phase 6 (per-profile opt-in, не force-migrate existing inbounds) + roadmap-level risk #1 митигация (батч-миграции) |
| Все 6 P0/P1 багов аудита закрыты, во всех миграциях используется safe_jq_write и safe_restart_xray | Phase 4 (полностью покрывает; D01-D07) |
| HAPP subscription URL отдаёт корректные metadata headers/body comments + routing profile + одну vless:// строку (transport профиля) | Phase 7 (REQ-C06, C07, C11, C14 REVISED 2026-05-10 — одна subscription на профиль) — depends on Phase 6 (PQ inbound metadata в profile JSON) |
| HAPP-юзер импортирует подписку одним кликом, получает рабочее соединение | Phase 7 end-to-end (public TLS default, subscription URL/QR, revoke menu + happ_defaults configurable) |
| `bash -n` проходит для xrayebator/install.sh/update.sh | Phase 4 (lifecycle scripts hardening) + всё остальное должно сохранять syntax-clean — ответственность каждой фазы |
| Auto-update Xray-core работает на amd64/arm64, делает rollback на неудаче | Phase 5 (REQ-B01 полностью покрывает: arch detection + SHA256 + self-test + rollback) |

Все 7 milestone success criteria покрыты. Coverage: 45/45 requirements ✓.
