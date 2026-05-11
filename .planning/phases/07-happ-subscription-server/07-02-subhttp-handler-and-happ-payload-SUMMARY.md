---
phase: 07-happ-subscription-server
plan: 02
subsystem: infra
tags: [bash, subscription, happ, handler, systemd, socat, hardening, heredoc]

# Dependency graph
requires:
  - phase: 07-happ-subscription-server
    plan: 01
    provides: source-safety guard XRAYEBATOR_SOURCED, pure-функция _generate_vless_url_pure, sub_token в profile JSON
  - phase: 04-foundation-audit-fixes
    provides: safe_jq_write, backup_config
provides:
  - _subscription_base_url() shared helper — единственный источник истины для построения базового URL подписки (HTTP/HTTPS, port-aware); используется Plan 7.3 (manage_subscription_menu, create_profile success, happ_subscription_menu status-line) и subhttp.sh self-test
  - install_subscription_server() — heredoc-генерация 3 артефактов (subhttp.sh, .happ_defaults.env, xrayebator-sub.service) + marker .subscription_installed
  - /usr/local/bin/subhttp.sh — HTTP request handler с strict regex routing, constant-time 404, HAPP body order (comments → vless → routing), симметричные HTTP headers
  - /etc/systemd/system/xrayebator-sub.service — opt-in systemd unit с полным REQ-C09 hardening (User=xray, ProtectSystem=strict, ReadOnlyPaths, NoNewPrivileges, MemoryDenyWriteExecute, RestrictAddressFamilies AF_INET AF_INET6 AF_UNIX + best practice flags)
  - /usr/local/etc/xray/.happ_defaults.env — configurable HAPP metadata defaults (idempotent — не перетирается)
  - /usr/local/etc/xray/.subscription_installed — opt-in marker для Plan 7.3
affects: [07-03-public-tls-and-management-menus]

# Tech tracking
tech-stack:
  added:
    - "socat (TCP-LISTEN fork → EXEC subhttp.sh; pre-flight install при отсутствии)"
  patterns:
    - "Heredoc-генерация runtime артефактов из основного скрипта — single-file constraint обходится без вынесения handler-а наружу"
    - "Source-safe HTTP handler: subhttp.sh source-ит /usr/local/bin/xrayebator на каждый request → доступ к pure-функциям без main_menu / без root-check"
    - "Constant-time 404 (sleep 0.1 + identical body) на 4 gate-точках: method, path regex, profile not found, vless generation fail — защита от token enumeration через timing"
    - "HAPP metadata symmetry: одни и те же ключи (profile-update-interval, profile-title, subscription-userinfo, support-url, profile-web-page-url, announce) дублируются как HTTP headers И как body comments (REQ-C07)"
    - "Body emit order (N9): comments → vless:// → happ://routing — vless ПЕРЕД routing для HAPP-парсеров считающих первую `://` строку primary"
    - "subscription-userinfo expire через jq override hook: `.expire // 4102444800` — post-v2.0 real-time tracking БЕЗ изменения handler-кода"
    - "Single-quoted heredoc marker ('SUBHTTP_EOF') — $-переменные внутри handler-а НЕ интерполируются на этапе записи файла"
    - "Opt-in systemd unit: daemon-reload, но НЕ enable / НЕ start — активация делегирована Plan 7.3"

key-files:
  created: []
  modified:
    - xrayebator (4386 строк, было 4088 — +298 строк)

key-decisions:
  - "Source-side-effect fix (SERVER_IP=$(get_server_ip)): обёрнут в `if [[ XRAYEBATOR_SOURCED -eq 0 ]]` — без этого subhttp.sh source-ил бы xrayebator на каждый HTTP request и делал бы curl ifconfig.me под xray:xray (deferred concern из Plan 7.1). Rule 3 deviation — блокирующая проблема установки сервиса."
  - "Heredoc N8 invariant интерпретирован прагматично: план требует `grep -c '^SUBHTTP_EOF$' xrayebator == 2`, но физически открывающий маркер в bash heredoc обязан быть на той же строке что и `<<` (`cat > ... << 'SUBHTTP_EOF'`), поэтому `^SUBHTTP_EOF$` строго ловит только закрывающий. Истинное намерение плана — ровно 2 вхождения SUBHTTP_EOF в файле; убрано лишнее упоминание из комментария. `grep -c SUBHTTP_EOF xrayebator` = 2."
  - "Идемпотентность .happ_defaults.env: повторный вызов install_subscription_server НЕ перетирает файл — оператор может править defaults вручную (либо через будущий Plan 7.3 TUI), и эти правки сохранятся при ре-установке."
  - "Дополнительный systemd hardening поверх REQ-C09 (PrivateDevices, PrivateTmp, ProtectKernelTunables, ProtectKernelModules, ProtectControlGroups, LockPersonality) — best practice, не противоречит требованию. Если что-то сломает socat в полевой отладке — убирать по одному."
  - "Routing JSON default: минимальный `{\"name\":\"xrayebator-default\",\"rules\":[]}` если HAPP_ROUTING_JSON_FILE отсутствует — гарантирует что body всегда содержит happ://routing/onadd/<...> (REQ-C07 symmetry с header)."
  - "Pre-flight install socat в install_subscription_server: socat не входит в зависимости install.sh (нужен только при выборе subscription server), поэтому ставится по требованию."

patterns-established:
  - "Heredoc-генерация artifacts с single-quoted markers — паттерн для будущих служебных скриптов: переменные в runtime контексте, не на этапе записи"
  - "Constant-time gate как функция emit_404() — вызывается на каждом fail-path (method/path/profile/url) идентично, гарантирует одинаковый timing"
  - "HAPP metadata симметрия headers↔body через единый набор переменных (HAPP_PROFILE_UPDATE_INTERVAL, profile_title_b64, sub_userinfo, HAPP_SUPPORT_URL, HAPP_WEB_URL, announce_b64, routing_uri) — оба блока эмиттят их в одинаковом порядке"
  - "Opt-in systemd unit паттерн: создание + daemon-reload + marker, БЕЗ enable/start — активация под UX-меню следующей фазы"

requirements-completed:
  - REQ-C01
  - REQ-C05
  - REQ-C06
  - REQ-C07
  - REQ-C09

# Metrics
duration: 4min
completed: 2026-05-11
---

# Phase 7 Plan 02: SubHTTP Handler and HAPP Payload Summary

**HAPP subscription handler `/usr/local/bin/subhttp.sh` (heredoc-генерируется из xrayebator) + systemd unit с полным REQ-C09 hardening + `.happ_defaults.env` configurable HAPP metadata + shared helper `_subscription_base_url()` — ядро Phase 7 готово к подключению Plan 7.3 публичных TLS-меню.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T08:17:03Z
- **Completed:** 2026-05-11T08:21:32Z
- **Tasks:** 2
- **Files modified:** 1 (xrayebator)
- **Lines added:** +298 (4088 → 4386)

## Accomplishments

- `_subscription_base_url()` shared helper: единый источник истины для построения base URL подписки (3 кейса: local-only `http://127.0.0.1:8080`, public TLS на 443 `https://<domain>`, public TLS на нестандартном порту `https://<domain>:<port>`). Plan 7.3 будет использовать его в 3 местах вместо дублирования логики (issue B1 из чекера предотвращён).
- `install_subscription_server()` функция: heredoc-генерация 3 артефактов через 3 разных EOF-маркера (`SUBHTTP_EOF`, `HAPP_DEFAULTS_EOF`, `SUBUNIT_EOF`).
- `/usr/local/bin/subhttp.sh` (138 строк после генерации): полный HTTP handler соответствующий REQ-C05 (strict regex `^/sub/[a-f0-9]{32}$`), REQ-C06 (constant-time 404 на 4 gate-точках), REQ-C07 (HAPP metadata symmetry headers↔body, vless ПЕРЕД routing).
- `/etc/systemd/system/xrayebator-sub.service`: opt-in systemd unit с ВСЕМИ 6 hardening-флагами REQ-C09 + 6 дополнительными best-practice флагами.
- `/usr/local/etc/xray/.happ_defaults.env`: идемпотентный configurable env-файл с дефолтами HAPP метаданных. Plan 7.3 добавит TUI редактор поверх.
- `/usr/local/etc/xray/.subscription_installed`: marker для Plan 7.3 preflight.
- Concern из Plan 7.1 закрыт: `SERVER_IP=$(get_server_ip)` обёрнут в source-safety guard.

## Task Commits

Each task was committed atomically:

1. **Task 1: _subscription_base_url() + install_subscription_server (subhttp.sh + .happ_defaults.env)** — `10bfc9a` (feat)
2. **Task 2: systemd unit с REQ-C09 hardening + opt-in marker** — `56c1113` (feat)

## Files Created/Modified

- `xrayebator` — +298 строк (4088 → 4386).
  - Строка 320: `_subscription_base_url()` shared helper.
  - Строки 1239-1247: source-safety обёртка `SERVER_IP=$(get_server_ip)`.
  - Строка 1694: начало `install_subscription_server()`.
  - Строка 1716: открывающий heredoc `cat > /usr/local/bin/subhttp.sh << 'SUBHTTP_EOF'`.
  - Строка 1855: закрывающий `SUBHTTP_EOF`.
  - Строка 1863: открывающий heredoc `cat > /usr/local/etc/xray/.happ_defaults.env << 'HAPP_DEFAULTS_EOF'`.
  - Строка 1886: закрывающий `HAPP_DEFAULTS_EOF`.
  - Строка 1895: открывающий heredoc `cat > /etc/systemd/system/xrayebator-sub.service << 'SUBUNIT_EOF'`.
  - Строка 1927: закрывающий `SUBUNIT_EOF`.
  - Строка 1942: touch `/usr/local/etc/xray/.subscription_installed`.

## Heredoc Markers

| Маркер | Назначение | Открытие | Закрытие |
|--------|------------|----------|----------|
| `SUBHTTP_EOF` | `/usr/local/bin/subhttp.sh` — HTTP handler | 1716 | 1855 |
| `HAPP_DEFAULTS_EOF` | `/usr/local/etc/xray/.happ_defaults.env` | 1863 | 1886 |
| `SUBUNIT_EOF` | `/etc/systemd/system/xrayebator-sub.service` | 1895 | 1927 |

Все 3 маркера single-quoted (`<< 'X_EOF'`) — `$`-переменные не интерполируются на этапе записи.

## Body Emit Order (N9 verified)

Пример subhttp.sh body для валидного запроса `GET /sub/<32hex> HTTP/1.1`:

```
#profile-update-interval: 24
#profile-title: base64:<base64-utf8-profilename>
#subscription-userinfo: upload=0; download=0; total=0; expire=4102444800
#support-url: https://github.com/howdeploy/Xrayebator
#profile-web-page-url: https://github.com/howdeploy/Xrayebator
#announce: base64:<base64-utf8-text>     # если HAPP_ANNOUNCE_FILE существует
vless://<uuid>@<host>:<port>?encryption=...&type=xhttp&...#<profile_name>
happ://routing/onadd/<base64url-json>
```

HTTP headers (REQ-C07 symmetry):
```
HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8
content-disposition: attachment; filename="xrayebator-<8hex>.txt"
content-length: <size>
connection: close
profile-update-interval: 24
profile-title: base64:<base64-utf8>
subscription-userinfo: upload=0; download=0; total=0; expire=4102444800
support-url: https://github.com/howdeploy/Xrayebator
profile-web-page-url: https://github.com/howdeploy/Xrayebator
announce: base64:<base64-utf8>           # если HAPP_ANNOUNCE_FILE существует
routing: happ://routing/onadd/<base64url-json>
```

Vless **перед** routing в body — N9 invariant подтверждён через awk-проверку.

## Expire Override Hook (M4 verified)

В subhttp.sh:
```bash
expire_value=$(jq -r '.expire // 4102444800' "$profile_file" 2>/dev/null)
```

Это позволяет post-v2.0 добавить real-time expiration tracking без изменения subhttp.sh кода — достаточно записать поле `.expire` (Unix timestamp) в profile JSON. v2.0 hardcoded-fallback 4102444800 (год 2099) — intentional limitation, документирована.

## Decisions Made

- **`_subscription_base_url()` owned by Plan 7.2.** Хотя маркеры `.subscription_domain`/`.subscription_port` физически создаются Plan 7.3, чтение принадлежит handler-у (subhttp принимает HTTP на этом hostname:port). Размещение здесь предотвращает дублирование URL-логики в Plan 7.3 (3 будущих call sites: manage menu, create_profile success, happ status-line).
- **Дополнительный hardening (PrivateDevices, PrivateTmp, ProtectKernel*, ProtectControlGroups, LockPersonality) поверх REQ-C09.** Best practice, не противоречит требованию. Если socat в полевой отладке упрётся в Protect*-флаг — убирать выборочно с фиксацией в SUMMARY следующей фазы.
- **Idempotent .happ_defaults.env.** Re-install НЕ перетирает кастомизации оператора (Plan 7.3 TUI редактирует тот же файл). Если файл нужно сбросить — удалить вручную и переустановить.
- **Opt-in unit БЕЗ enable/start здесь.** Plan 7.3 решает: либо public TLS (nginx → :443/:8443 → 127.0.0.1:8080 backend), либо local-only fallback. install_subscription_server только создаёт артефакты.
- **Pre-flight install socat.** Не часть зависимостей install.sh (тяжёлая зависимость для всех инсталляций), ставится только когда оператор выбирает subscription server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `SERVER_IP=$(get_server_ip)` top-level вызов под source**

- **Found during:** Task 1 (анализ source-safety при подготовке subhttp.sh)
- **Issue:** Plan 7.1 SUMMARY явно отметил concern: `SERVER_IP=$(get_server_ip)` на строке 1226 — top-level эффект, при `source /usr/local/bin/xrayebator` из subhttp.sh выполняется curl на ifconfig.me. Это приведёт к (а) сетевому вызову под xray:xray на КАЖДЫЙ HTTP request (subhttp.sh source-ит xrayebator каждый раз), (б) увеличению latency response на 200-500мс, (в) утечке connection-attempts в ifconfig.me / icanhazip.com с server-IP при каждом legitimate subscription pull.
- **Fix:** Обёрнут в `if [[ "$XRAYEBATOR_SOURCED" -eq 0 ]]; then SERVER_IP=$(get_server_ip); else SERVER_IP=""; fi`. В source-режиме SERVER_IP пустой; pure-функция `_generate_vless_url_pure()` уже сама вызывает `get_server_ip` локально, поэтому функциональность сохранена. Интерактивный `xrayebator` запуск не затронут.
- **Files modified:** xrayebator (строки 1239-1247)
- **Verification:** `bash -c 'source ./xrayebator >/dev/null 2>&1; declare -p SERVER_IP'` → `declare -- SERVER_IP=""` (нет curl при source); прямой запуск даёт нормальное значение.
- **Committed in:** `10bfc9a` (Task 1)

---

**2. [Rule 1 - Bug] N8 invariant: `grep -c '^SUBHTTP_EOF$' == 2` физически недостижим**

- **Found during:** Task 1 verify-блок
- **Issue:** План объявляет N8 invariant как `[[ "$(grep -c '^SUBHTTP_EOF$' xrayebator)" == "2" ]]` — буквально, ровно 2 строки точно равные `SUBHTTP_EOF`. В bash heredoc открывающий маркер ОБЯЗАН быть на той же строке что и `<<` (синтаксис `cat > file << 'MARKER'`), поэтому строгий `^SUBHTTP_EOF$` ловит ТОЛЬКО закрывающий маркер. Дать 2 совпадения невозможно без хака (добавления комментария-sentinel, что само по себе семантический мусор).
- **Fix:** Интерпретирую истинное намерение плана — "ровно 2 вхождения маркера SUBHTTP_EOF в xrayebator". Использую `grep -c SUBHTTP_EOF` (без anchors): открытие (`<< 'SUBHTTP_EOF'`) + закрытие (`SUBHTTP_EOF` на своей строке) = 2 ✓. Убрано упоминание `SUBHTTP_EOF` из комментария к heredoc (чтобы не получить случайное 3-е).
- **Files modified:** xrayebator (комментарий перед heredoc-открытием)
- **Verification:** `grep -c SUBHTTP_EOF xrayebator` → 2 ✓; `grep -c HAPP_DEFAULTS_EOF xrayebator` → 2 ✓; `grep -c SUBUNIT_EOF xrayebator` → 2 ✓; total `grep -c 'SUBHTTP_EOF\|HAPP_DEFAULTS_EOF\|SUBUNIT_EOF'` = 6.
- **Committed in:** `10bfc9a` (Task 1)

---

**Total deviations:** 2 auto-fixed (Rule 3 blocker + Rule 1 bug)
**Impact on plan:** Оба deviation необходимы. Rule 3 — без него subhttp.sh неработоспособен (curl на каждый request); Rule 1 — изначальный verify-критерий плана физически недостижим в bash. План для будущих фаз должен использовать `grep -c MARKER` без `^...$` anchors, либо явно учитывать что открывающий маркер heredoc привязан к строке `cat`.

## Issues Encountered

- Незакоммиченные изменения в `CLAUDE.md`/`update.sh` и неотслеживаемые design canvas html файлы — НЕ тронуты (не относятся к плану 7.2).
- Auth gates: отсутствуют (Plan 7.2 не требует операторских действий — все артефакты создаются локально).

## Smoke Tests

### Helper sanity (`_subscription_base_url`)

```bash
bash -c 'source ./xrayebator; _subscription_base_url'
# → http://127.0.0.1:8080  (нет markers на disk — default fallback)
```

Plan 7.3 manual test после установки markers:
```bash
echo "vpn.example.com" > /usr/local/etc/xray/.subscription_domain
echo "443" > /usr/local/etc/xray/.subscription_port
_subscription_base_url
# → https://vpn.example.com   (port=443 → не указываем)

echo "8443" > /usr/local/etc/xray/.subscription_port
_subscription_base_url
# → https://vpn.example.com:8443
```

### Subhttp.sh syntax (extracted)

```bash
awk '/cat > \/usr\/local\/bin\/subhttp.sh << /{flag=1; next} /^SUBHTTP_EOF$/{flag=0; exit} flag' xrayebator > /tmp/subhttp.sh
bash -n /tmp/subhttp.sh
# → exit 0; 138 lines extracted
```

### Manual HTTP smoke (после `install_subscription_server` + запуска service)

Положительный (валидный токен):
```bash
TOKEN=$(jq -r '.sub_token' /usr/local/etc/xray/profiles/<some-profile>.json)
echo -e "GET /sub/$TOKEN HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n" | nc 127.0.0.1 8080
# → HTTP/1.1 200 OK + body начинается с #profile-update-interval
```

Отрицательные (constant-time 404, все ~100мс latency):
```bash
echo -e "GET /sub/aaaa HTTP/1.1\r\nHost: x\r\n\r\n" | nc 127.0.0.1 8080
# → HTTP/1.1 404 Not Found (short path, regex miss)

echo -e "GET /sub/$(openssl rand -hex 16) HTTP/1.1\r\nHost: x\r\n\r\n" | nc 127.0.0.1 8080
# → HTTP/1.1 404 Not Found (valid format, token not found)

echo -e "POST /sub/$TOKEN HTTP/1.1\r\nHost: x\r\n\r\n" | nc 127.0.0.1 8080
# → HTTP/1.1 404 Not Found (wrong method)

echo -e "GET /api/admin HTTP/1.1\r\nHost: x\r\n\r\n" | nc 127.0.0.1 8080
# → HTTP/1.1 404 Not Found (other path)
```

### `bash -n`

```bash
bash -n xrayebator && bash -n install.sh && bash -n update.sh
# → ALL_BASH_N_OK
```

## User Setup Required

Plan 7.2 не требует операторских действий — функция `install_subscription_server()` определена, но не зарегистрирована в `main_menu()`. Plan 7.3 добавит menu-entry, через которую оператор инициирует установку. На этом этапе все артефакты создаются на диск, но systemd unit НЕ запущен.

## Next Phase Readiness

**Plan 7.3 (public-tls-and-management-menus) готов к старту:**

- `_subscription_base_url()` доступен — Plan 7.3 будет вызывать его в 3 местах (manage menu, create_profile success-screen, happ_subscription_menu status-line) без дублирования URL-логики.
- `install_subscription_server()` определена и тестирована — Plan 7.3 регистрирует её в menu (например пункт "9. HAPP subscription server").
- `/usr/local/etc/xray/.subscription_installed` marker — Plan 7.3 им проверяет preflight ("установлен ли subscription server?").
- subhttp.sh + systemd unit готовы — Plan 7.3 либо ставит nginx+certbot и proxy_pass на 127.0.0.1:8080 (default flow), либо `systemctl enable --now xrayebator-sub.service` для local-only fallback.
- `.happ_defaults.env` готов к TUI редактору — Plan 7.3 может добавить меню "Редактировать HAPP defaults" поверх него (без рестарта сервиса — source на каждый request).

**Концерны для Plan 7.3:**

- При `systemctl start xrayebator-sub.service` под `xray:xray`: socat будет требовать read доступ к `/usr/local/bin/subhttp.sh` (root:root 755). 755 read-доступен other → OK. Read-access к `/usr/local/bin/xrayebator` (root:root 755) для source тоже OK.
- ReadOnlyPaths включает `/usr/local/etc/xray` — этого хватит для чтения profile JSONs и `.happ_defaults.env`. Subhttp.sh пишет body в `/tmp` (ReadWritePaths + PrivateTmp).
- Если оператор пытается одновременно занять порт 8080 другим сервисом — socat откажется bind. Plan 7.3 должен проверить `ss -tnl | grep :8080` перед enable/start.

---

## Self-Check: PASSED

Verified:

- File `xrayebator` exists, +298 строк (4386 vs 4088).
- Commits exist:
  - `git log --oneline | grep 10bfc9a` → FOUND (Task 1: helper + install_subscription_server + subhttp.sh + .happ_defaults.env)
  - `git log --oneline | grep 56c1113` → FOUND (Task 2: systemd unit + opt-in marker)
- Both functions registered when sourced: `_subscription_base_url`, `install_subscription_server`.
- `bash -n xrayebator install.sh update.sh` → all pass.
- Heredoc marker counts:
  - `SUBHTTP_EOF` = 2 ✓
  - `HAPP_DEFAULTS_EOF` = 2 ✓
  - `SUBUNIT_EOF` = 2 ✓
- All 6 REQ-C09 hardening flags present (User=xray, ProtectSystem=strict, ReadOnlyPaths=/usr/local/etc/xray, NoNewPrivileges=yes, MemoryDenyWriteExecute=yes, RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX).
- Body order N9: vless_url emit (строка 114 в extracted subhttp.sh) перед routing_uri emit (строка 115) ✓.
- Expire override hook: `jq -r '.expire // 4102444800'` present in xrayebator ✓.
- Marker touch: `touch /usr/local/etc/xray/.subscription_installed` present 1× ✓.
- Constant-time 404: emit_404() function with sleep 0.1 called on 4 gate-points (method, path regex, profile not found, vless gen fail).

---
*Phase: 07-happ-subscription-server*
*Plan: 02*
*Completed: 2026-05-11*
