---
phase: 07-happ-subscription-server
plan: 02
type: execute
wave: 2
depends_on:
  - "07-01"
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-C01
  - REQ-C05
  - REQ-C06
  - REQ-C07
  - REQ-C09

must_haves:
  truths:
    - "В xrayebator появилась функция `install_subscription_server()` которая heredoc-генерирует ТРИ файла: `/usr/local/bin/subhttp.sh` (handler), `/etc/systemd/system/xrayebator-sub.service` (systemd unit), `/usr/local/etc/xray/.happ_defaults.env` (configurable HAPP metadata defaults). Файлы создаются ТОЛЬКО когда оператор явно вызывает функцию через меню (Plan 7.3) — никаких авто-создания при `source xrayebator`"
    - "В xrayebator определён shared helper `_subscription_base_url()` который читает /usr/local/etc/xray/.subscription_domain и /usr/local/etc/xray/.subscription_port (созданные Plan 7.3) и возвращает через stdout канонично-сформированный base URL: `http://127.0.0.1:8080` для local-only, `https://<domain>` если port=443, `https://<domain>:<port>` иначе. Plan 7.3 (manage_subscription_menu, create_profile success-screen, happ_subscription_menu status-line) — единственные консьюмеры этого helper-а; никакого инлайн-построения URL в Plan 7.3"
    - "subhttp.sh принимает HTTP-запрос на stdin/stdout (через socat/nginx fastcgi-style fork), парсит request-line, и для path соответствующего регексу `^/sub/[a-f0-9]{32}$` ищет profile JSON в /usr/local/etc/xray/profiles/ с полем `.sub_token == <32-hex>`. На match — отдаёт HTTP 200 с HAPP subscription body. На любой другой path / token не найден / некорректный method (не GET) — отдаёт constant-time 404"
    - "Constant-time 404: ВСЕГДА `sleep 0.1` ПЕРЕД ответом + ВСЕГДА идентичное body (`Not Found\\n`) и идентичные headers — чтобы token enumeration через timing-side-channel не работал. Sleep 0.1s применяется и к token-not-found, и к bad-path, и к bad-method"
    - "Body subscription для валидного запроса содержит (в указанном порядке — N9 fix): (1) HAPP metadata comment-lines в формате `#profile-update-interval: 24`, `#profile-title: base64:<base64-utf8>`, `#subscription-userinfo: upload=0; download=0; total=0; expire=<EXPIRE>`, `#support-url: <url>`, `#profile-web-page-url: <url>`, `#announce: base64:<base64-utf8>` (если задано); (2) ОДНУ vless:// строку, полученную через `_generate_vless_url_pure` (Plan 7.1) для profile JSON, найденного по sub_token; (3) routing import line `happ://routing/onadd/<base64url-json>` ПОСЛЕ vless:// (некоторые HAPP-парсеры считают первую `://` строку primary connection — vless должен быть до happ://routing)"
    - "subscription-userinfo expire берётся через `jq -r '.expire // 4102444800' \"$pfile\"` — поле .expire из profile JSON переопределяет hardcoded placeholder 4102444800 (год 2099). Это позволяет post-v2.0 добавить real-time expiration tracking БЕЗ изменения subhttp.sh кода — достаточно записать .expire в profile JSON. v2.0 hardcoded-fallback intentionally документирован как deferred limitation"
    - "ВСЕ те же metadata-ключи дублируются как HTTP response headers с теми же именами и значениями (HAPP принимает оба). Header `routing: happ://routing/onadd/<base64url-json>` обязательно присутствует. Headers `content-type: text/plain; charset=utf-8` и `content-disposition: attachment; filename=\"xrayebator-${token:0:8}.txt\"` присутствуют всегда"
    - "Base64-encoding для `profile-title` и `announce` идёт через `printf '%s' \"$value\" | base64 -w0` (БЕЗ переносов, UTF-8 safe для кириллицы/эмодзи)"
    - "subhttp.sh source-ит `/usr/local/bin/xrayebator` для доступа к `_generate_vless_url_pure` И `_subscription_base_url` — guard из Plan 7.1 предотвращает исполнение root-check/main_menu в источенном режиме"
    - "subhttp.sh source-ит `/usr/local/etc/xray/.happ_defaults.env` НА КАЖДЫЙ request — изменения применяются без рестарта (REQ-C13 prerequisite — Plan 7.3 строит UI поверх этого)"
    - "systemd unit `/etc/systemd/system/xrayebator-sub.service` определяет: `User=xray`, `Group=xray`, `ExecStart=/usr/bin/socat TCP-LISTEN:8080,reuseaddr,fork,bind=127.0.0.1 EXEC:/usr/local/bin/subhttp.sh`, `ProtectSystem=strict`, `ReadOnlyPaths=/usr/local/etc/xray /usr/local/bin/xrayebator`, `MemoryDenyWriteExecute=yes`, `NoNewPrivileges=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, `Restart=on-failure`. Юнит ОПТ-ИН (не enable по умолчанию)"
    - "Файл `.happ_defaults.env` имеет права 644 + ownership xray:xray и содержит дефолтные значения для всех configurable HAPP метаданных: HAPP_SUPPORT_URL, HAPP_WEB_URL, HAPP_PROFILE_UPDATE_INTERVAL=24, HAPP_ANNOUNCE_FILE=/usr/local/etc/xray/announce.txt (опциональный), HAPP_ROUTING_JSON_FILE=/usr/local/etc/xray/.happ_routing.json (опциональный — если отсутствует, эмиттим default routing import)"
    - "Marker `/usr/local/etc/xray/.subscription_installed` ставится в конце `install_subscription_server()` — Plan 7.3 использует его как флаг 'opt-in активирован' для меню/preflight"
    - "bash -n xrayebator проходит; ровно 2 вхождения маркера `^SUBHTTP_EOF$` в xrayebator (открытие + закрытие heredoc — N8 invariant); при ручном manual-test (`echo -e \"GET /sub/<valid_token> HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n\" | bash -c 'source xrayebator; subhttp.sh < /dev/stdin'` после генерации файлов в /tmp/) — на валидный токен отдаётся HTTP/1.1 200 + body начинается с `#profile-update-interval`"
    - "v2.0 documented intentional limitation: subscription-userinfo expire является placeholder (4102444800 = год 2099). Real-time stats (upload/download bytes, real expire) deferred к post-v2.0. Хук для override через `.expire` в profile JSON уже встроен — никакого refactoring субхэндлера не потребуется когда tracking появится"
  artifacts:
    - path: "xrayebator"
      provides: "_subscription_base_url() shared helper + install_subscription_server() function — heredoc-генерация subhttp.sh + xrayebator-sub.service + .happ_defaults.env + chown/chmod + touch .subscription_installed"
      contains: "install_subscription_server"
      min_lines: 4130
    - path: "/usr/local/bin/subhttp.sh (созданный install_subscription_server)"
      provides: "HTTP handler: source xrayebator → парсинг request → strict regex → constant-time 404 / 200+HAPP body (vless до happ://routing); jq-based expire extraction"
      contains: "_generate_vless_url_pure"
    - path: "/etc/systemd/system/xrayebator-sub.service (созданный install_subscription_server)"
      provides: "systemd unit с hardening (User=xray, ProtectSystem=strict, ReadOnlyPaths, MemoryDenyWriteExecute=yes, NoNewPrivileges=yes, RestrictAddressFamilies)"
      contains: "MemoryDenyWriteExecute=yes"
    - path: "/usr/local/etc/xray/.happ_defaults.env (созданный install_subscription_server)"
      provides: "Configurable HAPP metadata defaults (title/support_url/web/announce/routing); 644 + xray:xray"
      contains: "HAPP_SUPPORT_URL"
    - path: "/usr/local/etc/xray/.subscription_installed"
      provides: "Marker — установка выполнена; используется Plan 7.3 для меню preflight"
      contains: ""
  key_links:
    - from: "subhttp.sh (request handler)"
      to: "/usr/local/bin/xrayebator (pure function + URL helper)"
      via: "source /usr/local/bin/xrayebator → _generate_vless_url_pure \"$profile_file\""
      pattern: "source /usr/local/bin/xrayebator"
    - from: "subhttp.sh"
      to: "/usr/local/etc/xray/.happ_defaults.env"
      via: "source /usr/local/etc/xray/.happ_defaults.env (на каждый request)"
      pattern: "source.*\\.happ_defaults\\.env"
    - from: "subhttp.sh path-validator"
      to: "constant-time 404 path"
      via: "if ! [[ \"$path\" =~ ^/sub/[a-f0-9]{32}$ ]]; then sleep 0.1; printf '404 ...'; fi"
      pattern: "\\^/sub/\\[a-f0-9\\]\\{32\\}\\$"
    - from: "xrayebator-sub.service"
      to: "subhttp.sh + socat"
      via: "ExecStart=/usr/bin/socat TCP-LISTEN:8080,...,bind=127.0.0.1 EXEC:/usr/local/bin/subhttp.sh"
      pattern: "EXEC:/usr/local/bin/subhttp\\.sh"
    - from: "install_subscription_server()"
      to: ".subscription_installed marker"
      via: "touch /usr/local/etc/xray/.subscription_installed (в конце функции)"
      pattern: "touch.*\\.subscription_installed"
    - from: "_subscription_base_url() (shared helper)"
      to: "Plan 7.3 menus + subhttp.sh self-test"
      via: "echo URL based on .subscription_domain + .subscription_port markers"
      pattern: "_subscription_base_url"
---

<objective>
Реализовать ядро Phase 7: heredoc-генерируемый из xrayebator handler `subhttp.sh`, который читает HTTP request, валидирует path strict regex'ом, ищет profile по `sub_token` и отдаёт HAPP-совместимое subscription body (metadata комментарии + vless:// строка через `_generate_vless_url_pure` из Plan 7.1 + routing import line ПОСЛЕ vless). Плюс systemd unit с полным набором hardening-флагов (REQ-C09), configurable env-файл для HAPP defaults, и shared helper `_subscription_base_url()` (предотвращает дублирование URL-логики в Plan 7.3).

Purpose: subhttp.sh — единственный кусок runtime-кода, который не живёт в xrayebator (single-file constraint обходится heredoc-генерацией ИЗ xrayebator). Source-safety guard из Plan 7.1 уже обеспечивает безопасный source. Plan 7.2 НЕ занимается nginx/TLS/UFW — только локальный handler на 127.0.0.1:8080. Public TLS обвязка — Plan 7.3. Helper `_subscription_base_url()` живёт в Plan 7.2 потому что эта плана владеет `.subscription_domain` / `.subscription_port` markers (формально их пишет Plan 7.3, но контракт чтения принадлежит handler-у — единственный честный owner).

Output:
- Shared helper `_subscription_base_url()` в xrayebator.
- Функция `install_subscription_server()` в xrayebator (heredoc-генератор всех артефактов).
- Артефакты, генерируемые этой функцией:
  - `/usr/local/bin/subhttp.sh` (executable, 755, root:root) — request handler.
  - `/etc/systemd/system/xrayebator-sub.service` (644, root:root) — opt-in юнит с полным hardening.
  - `/usr/local/etc/xray/.happ_defaults.env` (644, xray:xray) — defaults для HAPP metadata.
  - `/usr/local/etc/xray/.subscription_installed` (marker).
- Constant-time 404 для всех некорректных запросов (защита от token enumeration).
- HAPP metadata symmetry: те же ключи как HTTP headers И как body comments.
- Body order: comments → vless:// → happ://routing (vless до routing для совместимости с HAPP-парсерами).
- subscription-userinfo expire через jq override hook (.expire в profile JSON; default 4102444800).
- Корректное base64-кодирование `profile-title`/`announce` для UTF-8.
</objective>

<execution_context>
@/home/kosya/.claude/get-shit-done/workflows/execute-plan.md
@/home/kosya/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/07-happ-subscription-server/07-AUDIT-NOTES.md

# Plan 7.1 SUMMARY — нужен потому что Plan 7.2 source-ит xrayebator и полагается на pure-функцию + guard
@.planning/phases/07-happ-subscription-server/07-01-pure-vless-url-and-token-migration-SUMMARY.md

# Существующая install_*-функция в качестве примера паттерна heredoc-генерации
@xrayebator
</context>

<tasks>

<task type="auto">
  <name>Task 1: _subscription_base_url() helper + install_subscription_server() — heredoc-генерация subhttp.sh + .happ_defaults.env</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — Объявить shared helper `_subscription_base_url()` в xrayebator (рядом с другими `_*` helper-ами; разместить ПЕРЕД `install_subscription_server`). Контракт:

```
# Phase 7: shared subscription URL builder.
# Читает /usr/local/etc/xray/.subscription_domain и .subscription_port (созданные Plan 7.3 после установки).
# stdout: канонично-сформированный base URL (без trailing slash, без /sub/<token>).
#   - "http://127.0.0.1:8080"   (если domain == "127.0.0.1" → local-only fallback)
#   - "https://<domain>"        (если port == "443")
#   - "https://<domain>:<port>" (иначе — public TLS на 8443/etc.)
# return: 0 всегда (даже если markers отсутствуют — отдаёт fallback http://127.0.0.1:8080).
# Единственный источник истины для Plan 7.3 manage_subscription_menu / create_profile success / status-line.
_subscription_base_url() {
  local domain port
  domain=$(cat /usr/local/etc/xray/.subscription_domain 2>/dev/null || echo "127.0.0.1")
  port=$(cat /usr/local/etc/xray/.subscription_port 2>/dev/null || echo "8080")
  if [[ "$domain" == "127.0.0.1" ]]; then
    echo "http://${domain}:${port}"
  elif [[ "$port" == "443" ]]; then
    echo "https://${domain}"
  else
    echo "https://${domain}:${port}"
  fi
  return 0
}
```

ВАЖНО: helper ЖИВЁТ в Plan 7.2 (а не в Plan 7.3) потому что:
- Маркеры `.subscription_domain` / `.subscription_port` логически связаны с handler-ом (subhttp принимает HTTP на этом hostname:port);
- Plan 7.3 будет ЕДИНСТВЕННЫМ консьюмером (3 call sites: `manage_subscription_menu`, `create_profile` success-screen, `happ_subscription_menu` header status-line);
- Размещение в Plan 7.2 предотвращает дублирование URL-логики в Plan 7.3 (issue B1 из чекера).

ШАГ 2 — Объявить функцию `install_subscription_server()` в xrayebator (логически — рядом с другими `install_*` функциями; искать секцию вроде `install_adguard_home` или просто перед `main_menu()`). Функция:

1. Pre-flight: проверяет, что нужные утилиты есть (`socat`, `openssl`, `base64`, `jq`). Если `socat` отсутствует — `apt-get install -y socat` через sudo (мы внутри xrayebator, который сам уже под sudo).
2. Создаёт `/usr/local/bin/subhttp.sh` через heredoc (см. ШАГ 3).
3. Создаёт `/usr/local/etc/xray/.happ_defaults.env` через heredoc (см. ШАГ 4) ЕСЛИ файл ещё не существует (idempotent — не перетирает кастомизации оператора).
4. После создания файлов: `chmod 755 /usr/local/bin/subhttp.sh && chown root:root /usr/local/bin/subhttp.sh`; `chmod 644 /usr/local/etc/xray/.happ_defaults.env && chown xray:xray /usr/local/etc/xray/.happ_defaults.env`.
5. Touch marker `/usr/local/etc/xray/.subscription_installed` + chown xray:xray.
6. ВЫВОД пользователю — короткий summary "созданы файлы X/Y/Z; для запуска используйте Plan 7.3 menu". В этом плане функция НЕ создаёт systemd unit и НЕ запускает сервис — это последняя task ниже.

ШАГ 3 — Heredoc-блок subhttp.sh (внутри функции, использовать `cat > /usr/local/bin/subhttp.sh << 'SUBHTTP_EOF'` — single-quoted EOF чтобы $-переменные НЕ раскрывались на момент heredoc):

```bash
#!/bin/bash
# xrayebator subhttp.sh — HAPP subscription handler (heredoc-generated from xrayebator).
# Сценарий: socat fork-ит этот скрипт на каждый TCP-connect; stdin = HTTP request, stdout = HTTP response.
# REQ-C05/C06/C07: strict regex routing + constant-time 404 + HAPP metadata symmetry.

set -u

# Source xrayebator для доступа к _generate_vless_url_pure() и константам.
# Guard в начале xrayebator (Plan 7.1 REQ-C10) гарантирует, что source НЕ вызовет main_menu.
source /usr/local/bin/xrayebator

# Source HAPP defaults — на каждый request, чтобы Plan 7.3 (TUI редактирование) работало без рестарта.
HAPP_DEFAULTS=/usr/local/etc/xray/.happ_defaults.env
[[ -f "$HAPP_DEFAULTS" ]] && source "$HAPP_DEFAULTS"

# Defaults на случай если переменная не задана в .happ_defaults.env
HAPP_PROFILE_UPDATE_INTERVAL="${HAPP_PROFILE_UPDATE_INTERVAL:-24}"
HAPP_SUPPORT_URL="${HAPP_SUPPORT_URL:-https://github.com/howdeploy/Xrayebator}"
HAPP_WEB_URL="${HAPP_WEB_URL:-https://github.com/howdeploy/Xrayebator}"
HAPP_ANNOUNCE_FILE="${HAPP_ANNOUNCE_FILE:-/usr/local/etc/xray/announce.txt}"
HAPP_ROUTING_JSON_FILE="${HAPP_ROUTING_JSON_FILE:-/usr/local/etc/xray/.happ_routing.json}"

# Read & parse HTTP request line (e.g. "GET /sub/abc123... HTTP/1.1\r")
read -r request_line || true
method=$(printf '%s' "$request_line" | awk '{print $1}')
path=$(printf '%s' "$request_line" | awk '{print $2}')

# Drain remaining headers (we don't need them; just consume so socat doesn't block client).
while IFS= read -r header_line; do
  # CRLF terminator на пустой строке
  [[ "$header_line" == $'\r' || -z "$header_line" ]] && break
done

# Constant-time 404: identical body+headers, всегда sleep 0.1s ПЕРЕД ответом.
emit_404() {
  sleep 0.1
  printf 'HTTP/1.1 404 Not Found\r\n'
  printf 'content-type: text/plain; charset=utf-8\r\n'
  printf 'content-length: 10\r\n'
  printf 'connection: close\r\n'
  printf '\r\n'
  printf 'Not Found\n'
  exit 0
}

# Method check: только GET. Любой другой → 404 (НЕ 405 — мы НЕ раскрываем существование endpoint).
[[ "$method" == "GET" ]] || emit_404

# Strict regex check (REQ-C05): /sub/<32-hex>. Любой другой path → 404.
if ! [[ "$path" =~ ^/sub/[a-f0-9]{32}$ ]]; then
  emit_404
fi

token="${path#/sub/}"

# Найти profile JSON с .sub_token == $token.
profile_file=""
for pf in /usr/local/etc/xray/profiles/*.json; do
  [[ -f "$pf" ]] || continue
  if [[ "$(jq -r '.sub_token // ""' "$pf" 2>/dev/null)" == "$token" ]]; then
    profile_file="$pf"
    break
  fi
done

# Token не найден → constant-time 404. Защищает от enumeration через timing.
[[ -n "$profile_file" ]] || emit_404

profile_name=$(basename "$profile_file" .json)
short_token="${token:0:8}"

# Построить vless:// через pure-функцию из xrayebator (Plan 7.1 REQ-C10).
vless_url=$(_generate_vless_url_pure "$profile_file" 2>/dev/null) || emit_404

# HAPP metadata: profile-title и announce — base64 utf-8 без переносов.
profile_title_b64=$(printf '%s' "$profile_name" | base64 -w0)
announce_b64=""
if [[ -f "$HAPP_ANNOUNCE_FILE" ]]; then
  announce_text=$(cat "$HAPP_ANNOUNCE_FILE")
  announce_b64=$(printf '%s' "$announce_text" | base64 -w0)
fi

# HAPP routing import payload. Если есть кастомный JSON — base64url-кодируем его.
# Иначе эмиттим минимальный routing с пустым правилом (просто маркер для HAPP).
if [[ -f "$HAPP_ROUTING_JSON_FILE" ]]; then
  routing_json=$(cat "$HAPP_ROUTING_JSON_FILE")
else
  routing_json='{"name":"xrayebator-default","rules":[]}'
fi
# base64url (RFC 4648 §5): base64 → tr +/ -_ → strip padding.
routing_b64url=$(printf '%s' "$routing_json" | base64 -w0 | tr '+/' '-_' | tr -d '=')
routing_uri="happ://routing/onadd/${routing_b64url}"

# subscription-userinfo: M4 fix — extract .expire из profile JSON (override hook), fallback на placeholder.
# Это позволяет post-v2.0 добавить real-time expire tracking БЕЗ изменения handler-кода.
# v2.0: 4102444800 = год 2099 (placeholder, intentional limitation, deferred per REQUIREMENTS.md).
expire_value=$(jq -r '.expire // 4102444800' "$profile_file" 2>/dev/null)
sub_userinfo="upload=0; download=0; total=0; expire=${expire_value}"

# N9 fix: body order — comments → vless:// → happ://routing.
# Некоторые HAPP-парсеры считают первую `://` строку primary connection;
# vless должен быть до happ://routing чтобы parser выбрал правильный primary URL.
{
  printf '#profile-update-interval: %s\n' "$HAPP_PROFILE_UPDATE_INTERVAL"
  printf '#profile-title: base64:%s\n' "$profile_title_b64"
  printf '#subscription-userinfo: %s\n' "$sub_userinfo"
  printf '#support-url: %s\n' "$HAPP_SUPPORT_URL"
  printf '#profile-web-page-url: %s\n' "$HAPP_WEB_URL"
  if [[ -n "$announce_b64" ]]; then
    printf '#announce: base64:%s\n' "$announce_b64"
  fi
  printf '%s\n' "$vless_url"
  printf '%s\n' "$routing_uri"
} > /tmp/subhttp_body.$$

body_size=$(stat -c%s /tmp/subhttp_body.$$ 2>/dev/null || wc -c < /tmp/subhttp_body.$$)

# Response: те же metadata-ключи дублируются как headers (REQ-C07 symmetry).
{
  printf 'HTTP/1.1 200 OK\r\n'
  printf 'content-type: text/plain; charset=utf-8\r\n'
  printf 'content-disposition: attachment; filename="xrayebator-%s.txt"\r\n' "$short_token"
  printf 'content-length: %s\r\n' "$body_size"
  printf 'connection: close\r\n'
  printf 'profile-update-interval: %s\r\n' "$HAPP_PROFILE_UPDATE_INTERVAL"
  printf 'profile-title: base64:%s\r\n' "$profile_title_b64"
  printf 'subscription-userinfo: %s\r\n' "$sub_userinfo"
  printf 'support-url: %s\r\n' "$HAPP_SUPPORT_URL"
  printf 'profile-web-page-url: %s\r\n' "$HAPP_WEB_URL"
  if [[ -n "$announce_b64" ]]; then
    printf 'announce: base64:%s\r\n' "$announce_b64"
  fi
  printf 'routing: %s\r\n' "$routing_uri"
  printf '\r\n'
  cat /tmp/subhttp_body.$$
} 

rm -f /tmp/subhttp_body.$$
exit 0
SUBHTTP_EOF
```

ВАЖНО про heredoc:
- Используем `<< 'SUBHTTP_EOF'` (single-quoted) — гарантирует, что `$HAPP_*`, `${path:-}`, `$(...)` НЕ интерполируются на момент генерации. Они должны попасть в файл буквально.
- Маркер EOF `SUBHTTP_EOF` (а не просто `EOF`), чтобы не конфликтовать с другими heredoc в xrayebator.
- N8 invariant: маркер `SUBHTTP_EOF` встречается в xrayebator РОВНО 2 раза — открытие `<< 'SUBHTTP_EOF'` и закрытие `SUBHTTP_EOF` на отдельной строке. Если случайная третья строка `SUBHTTP_EOF` появится в комментарии или другом heredoc — ломается парсинг bash. Verify проверяет `grep -c '^SUBHTTP_EOF$' xrayebator == 2`.

ШАГ 4 — Heredoc для `.happ_defaults.env` (та же функция, второй cat). Используем double-quoted EOF для вычисления некоторых defaults (например server hostname), но строки `# comment` и export'ы должны быть аккуратно экранированы. Проще — single-quoted EOF + чисто статический контент:

```
if [[ ! -f /usr/local/etc/xray/.happ_defaults.env ]]; then
cat > /usr/local/etc/xray/.happ_defaults.env << 'HAPP_DEFAULTS_EOF'
# xrayebator HAPP subscription metadata defaults.
# Этот файл source-ится subhttp.sh на КАЖДЫЙ request — менять можно без рестарта сервиса.
# Plan 7.3 menu позволит редактировать через TUI; править руками тоже допустимо (синтаксис shell).

# URL поддержки (HAPP импортирует, кликабельно у юзера в клиенте):
HAPP_SUPPORT_URL="https://github.com/howdeploy/Xrayebator"

# URL веб-страницы профиля (HAPP покажет в info клиента):
HAPP_WEB_URL="https://github.com/howdeploy/Xrayebator"

# Интервал автообновления подписки в часах (HAPP читает как hint):
HAPP_PROFILE_UPDATE_INTERVAL=24

# Файл с announcement-сообщением для HAPP (опционально). Plan 8 (REQ-E04) позволит редактировать через TUI.
# Если файл существует и не пуст — его содержимое попадёт в #announce: base64:... (UTF-8 safe).
HAPP_ANNOUNCE_FILE="/usr/local/etc/xray/announce.txt"

# Файл с кастомным HAPP routing JSON (опционально). Если отсутствует — отдаётся минимальный routing.
# Структура: {"name":"...","rules":[...]}. Base64url-кодируется в happ://routing/onadd/<...>.
HAPP_ROUTING_JSON_FILE="/usr/local/etc/xray/.happ_routing.json"
HAPP_DEFAULTS_EOF
chmod 644 /usr/local/etc/xray/.happ_defaults.env
chown xray:xray /usr/local/etc/xray/.happ_defaults.env 2>/dev/null || true
fi
```

ШАГ 5 — В конце функции, ДО создания systemd unit (Task 2):
```
chmod 755 /usr/local/bin/subhttp.sh
chown root:root /usr/local/bin/subhttp.sh
echo -e "${GREEN}  ✓ /usr/local/bin/subhttp.sh создан${NC}"
echo -e "${GREEN}  ✓ /usr/local/etc/xray/.happ_defaults.env готов${NC}"
```

ИНТЕГРАЦИЯ — НЕ регистрировать install_subscription_server() в main_menu в этом плане. Plan 7.3 добавит menu-entry. В этом плане функция доступна только через source (для smoke-тестов).
  </action>
  <verify>
bash -n xrayebator && \
# B1: shared helper определён
grep -q "^_subscription_base_url()" xrayebator && \
# install_subscription_server и heredocs
grep -q "^install_subscription_server()" xrayebator && \
grep -q "SUBHTTP_EOF" xrayebator && \
grep -q "HAPP_DEFAULTS_EOF" xrayebator && \
grep -q "_generate_vless_url_pure" xrayebator && \
# Heredoc маркер должен быть single-quoted в строке открытия (защита от $-интерполяции)
grep -qE "<< '?SUBHTTP_EOF'?" xrayebator && \
# N8: ровно 2 вхождения "^SUBHTTP_EOF$" (открытие + закрытие, без случайного третьего)
[[ "$(grep -c '^SUBHTTP_EOF$' xrayebator)" == "2" ]] && \
# M4: jq-based expire extraction в subhttp body
grep -q 'jq -r .*\.expire // 4102444800' xrayebator && \
# N9: vless:// emit идёт ПЕРЕД routing_uri в heredoc (структурно — номер строки vless_url меньше routing_uri в body block)
VLESS_LINE=$(awk '/<< .SUBHTTP_EOF./,/^SUBHTTP_EOF$/' xrayebator | grep -n "printf '%s\\\\n' \"\$vless_url\"" | head -1 | cut -d: -f1) && \
ROUTING_LINE=$(awk '/<< .SUBHTTP_EOF./,/^SUBHTTP_EOF$/' xrayebator | grep -n "printf '%s\\\\n' \"\$routing_uri\"" | head -1 | cut -d: -f1) && \
[[ -n "$VLESS_LINE" ]] && [[ -n "$ROUTING_LINE" ]] && [[ "$VLESS_LINE" -lt "$ROUTING_LINE" ]] && \
echo "PASS: helper + install_subscription_server определены; SUBHTTP_EOF=2; vless ПЕРЕД routing; jq expire override hook"
  </verify>
  <done>
В xrayebator определены `_subscription_base_url()` (shared helper для Plan 7.3) и `install_subscription_server()`, которая через heredoc генерирует subhttp.sh + .happ_defaults.env. Heredoc-маркер single-quoted (`'SUBHTTP_EOF'`) — переменные внутри handler не интерполируются на этапе создания. Маркер `^SUBHTTP_EOF$` встречается ровно 2 раза. Body-emit order: comments → vless:// → happ://routing (vless ПЕРЕД routing per N9). Subscription-userinfo expire берётся через `jq -r '.expire // 4102444800'` (M4 override hook). Файлы получают корректные права (755 для skript, 644 для env). bash -n проходит.
  </done>
</task>

<task type="auto">
  <name>Task 2: systemd unit с hardening + opt-in marker</name>
  <files>xrayebator</files>
  <action>
ДОПОЛНИТЬ функцию `install_subscription_server()` (созданная в Task 1) heredoc-блоком для systemd unit. Вставить ПЕРЕД блоком установки прав subhttp.sh.

```
cat > /etc/systemd/system/xrayebator-sub.service << 'SUBUNIT_EOF'
[Unit]
Description=Xrayebator HAPP subscription handler (socat + subhttp.sh)
Documentation=https://github.com/howdeploy/Xrayebator
After=network-online.target xray.service
Wants=network-online.target

[Service]
Type=simple
User=xray
Group=xray
ExecStart=/usr/bin/socat TCP-LISTEN:8080,reuseaddr,fork,bind=127.0.0.1 EXEC:/usr/local/bin/subhttp.sh

# REQ-C09 hardening:
ProtectSystem=strict
ReadOnlyPaths=/usr/local/etc/xray /usr/local/bin/xrayebator /usr/local/bin/subhttp.sh
ReadWritePaths=/tmp
NoNewPrivileges=yes
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
PrivateDevices=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
LockPersonality=yes

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SUBUNIT_EOF
chmod 644 /etc/systemd/system/xrayebator-sub.service
chown root:root /etc/systemd/system/xrayebator-sub.service
echo -e "${GREEN}  ✓ /etc/systemd/system/xrayebator-sub.service создан${NC}"
```

ВАЖНО про hardening (REQ-C09 строгое соответствие):
- `User=xray` + `Group=xray` — НЕ root. Юнит работает с привилегиями того же пользователя, что и Xray.
- `ReadOnlyPaths=/usr/local/etc/xray` — handler не может писать в xray-конфиг (subhttp.sh только читает profile JSON).
- `ReadOnlyPaths=/usr/local/bin/xrayebator` — handler source-ит файл, но изменить не может.
- `ReadWritePaths=/tmp` — нужен потому что subhttp.sh пишет временный body в `/tmp/subhttp_body.$$`. БЕЗ этого с `ProtectSystem=strict` и `PrivateTmp=yes` всё равно даст rw-доступ к собственному private /tmp, но `ReadWritePaths=/tmp` явный для clarity.
- `MemoryDenyWriteExecute=yes` — критично против JIT-эксплойтов. Bash в этом режиме работает; если возникнут проблемы со специфическими утилитами — оставлять флаг как есть и менять утилиты.
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX` — буквально как в REQ-C09. AF_UNIX нужен для D-Bus/socket activation, AF_INET для socat listen, AF_INET6 на всякий.
- `NoNewPrivileges=yes` — стандартный (запрещает setuid внутри service).
- ДОПОЛНЕНИЯ за пределами REQ-C09 (best practice, безопасно): `PrivateDevices`, `PrivateTmp`, `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectControlGroups`, `LockPersonality`. Убрать любой из них, если он сломает socat в реальной отладке.

ВАЖНО про opt-in (REQ-C09):
- Юнит создаётся, но НЕ запускается и НЕ enable-ится автоматически.
- В конце install_subscription_server() добавить:
```
systemctl daemon-reload
echo -e "${YELLOW}  ⚠ Юнит создан, но НЕ запущен и НЕ enabled.${NC}"
echo -e "${YELLOW}    Запуск/активацию выполняет Plan 7.3 menu (после нажатия пользователем 'установить публичный TLS').${NC}"
touch /usr/local/etc/xray/.subscription_installed
chown xray:xray /usr/local/etc/xray/.subscription_installed 2>/dev/null || true
```

В этом плане НЕ зовём `systemctl enable` и НЕ запускаем сервис. Plan 7.3 добавляет UI, который сам решает — сначала ставит nginx+TLS (default flow) и только потом enable+start xrayebator-sub.service. Если оператор выбирает local-only fallback (REQ-C03) — Plan 7.3 же его и enable-ит.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "SUBUNIT_EOF" xrayebator && \
grep -q "MemoryDenyWriteExecute=yes" xrayebator && \
grep -q "RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX" xrayebator && \
grep -q "NoNewPrivileges=yes" xrayebator && \
grep -q "ProtectSystem=strict" xrayebator && \
grep -q "ReadOnlyPaths=/usr/local/etc/xray" xrayebator && \
grep -q "User=xray" xrayebator && \
grep -q "touch /usr/local/etc/xray/.subscription_installed" xrayebator && \
echo "PASS: systemd hardening flags + opt-in marker присутствуют"
  </verify>
  <done>
Heredoc для `/etc/systemd/system/xrayebator-sub.service` встроен в `install_subscription_server()`. Все 6 hardening-флагов из REQ-C09 присутствуют буквально (`User=xray`, `ProtectSystem=strict`, `ReadOnlyPaths=/usr/local/etc/xray`, `MemoryDenyWriteExecute=yes`, `NoNewPrivileges=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`). Юнит — opt-in: создан + daemon-reload, но НЕ enable и НЕ start. Marker `.subscription_installed` ставится в конце функции.
  </done>
</task>

</tasks>

<verification>
1. `bash -n xrayebator` — синтаксис чист.
2. Source-test: `bash -c 'source ./xrayebator >/dev/null 2>&1; declare -F install_subscription_server _subscription_base_url' | grep -q install_subscription_server` → возвращает имя функции.
3. Helper-sanity: `bash -c 'source ./xrayebator; _subscription_base_url'` (без markers на disk) возвращает `http://127.0.0.1:8080` (default fallback).
4. Heredoc count: `grep -c "SUBHTTP_EOF\|SUBUNIT_EOF\|HAPP_DEFAULTS_EOF" xrayebator` → ровно 6 (по 2 маркера на каждый heredoc).
5. N8 invariant: `[[ "$(grep -c '^SUBHTTP_EOF$' xrayebator)" == "2" ]]` (ровно 2 — открытие+закрытие, без accidental третьего вхождения).
6. Hardening keyword count: `grep -cE "User=xray|ProtectSystem=strict|MemoryDenyWriteExecute=yes|NoNewPrivileges=yes|RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX|ReadOnlyPaths=/usr/local/etc/xray" xrayebator` → ≥6.
7. Smoke handler test (без запуска xray, на локальной машине): сгенерировать через source функцию во временный mkdir, патчить пути, sanity-check что subhttp.sh синтаксически корректен — `bash -n /tmp/subhttp.sh`.
8. Constant-time 404 sanity: `grep -A2 "emit_404()" xrayebator` показывает блок с `sleep 0.1`.
9. Marker: `grep -c "touch /usr/local/etc/xray/.subscription_installed" xrayebator` ≥ 1.
10. Line count: `wc -l xrayebator` ≥ 4130.
</verification>

<success_criteria>
- `_subscription_base_url()` shared helper определён в xrayebator (B1 — будет единственным источником URL для Plan 7.3, замена 3 inline блоков).
- `install_subscription_server()` определена в xrayebator и heredoc-генерирует ровно три файла: subhttp.sh / xrayebator-sub.service / .happ_defaults.env (последний — если ещё не существует).
- subhttp.sh использует `_generate_vless_url_pure` из Plan 7.1 (никакого дублирования логики транспорта).
- Body order: comments → vless:// → happ://routing (vless до routing для совместимости с HAPP-парсерами — N9).
- subscription-userinfo expire: `jq -r '.expire // 4102444800' "$pfile"` (override hook готов, default placeholder для v2.0 — M4).
- Strict regex `^/sub/[a-f0-9]{32}$` enforced; constant-time 404 (sleep 0.1 + identical body) на любом несовпадении.
- HAPP metadata symmetry: те же ключи как headers И как body comments (REQ-C07).
- Base64-encoding для profile-title/announce через `printf '%s' | base64 -w0` (UTF-8 safe).
- systemd unit имеет ВСЕ hardening-флаги из REQ-C09; opt-in (не enable/start автоматически).
- `.subscription_installed` marker создан — Plan 7.3 им проверяет наличие установки.
- N8: ровно 2 вхождения `^SUBHTTP_EOF$` в xrayebator (открытие + закрытие heredoc).
- `bash -n xrayebator` проходит чисто.
</success_criteria>

<output>
После завершения создать `.planning/phases/07-happ-subscription-server/07-02-subhttp-handler-and-happ-payload-SUMMARY.md`. В summary указать:
- Точные строки в xrayebator, где встроена `install_subscription_server()` и `_subscription_base_url()`.
- Полный список heredoc-маркеров (SUBHTTP_EOF, SUBUNIT_EOF, HAPP_DEFAULTS_EOF) и их назначение.
- Smoke-команды для проверки subhttp.sh: пример HTTP request + ожидаемые status codes (200 на валидный токен, 404 на остальное).
- Body emit order — пример output (comments → vless → routing).
- Подтверждение что expire берётся через jq override hook (.expire поле в profile JSON).
- Подтверждение, что юнит создан БЕЗ enable/start (Plan 7.3 ответственен за активацию).
</output>
</content>
</invoke>