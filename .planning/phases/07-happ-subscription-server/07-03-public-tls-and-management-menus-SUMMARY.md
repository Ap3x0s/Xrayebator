---
phase: 07-happ-subscription-server
plan: 03
subsystem: ux
tags: [bash, subscription, happ, nginx, certbot, ufw, tui, menu, qr, revoke]

# Dependency graph
requires:
  - phase: 07-happ-subscription-server
    plan: 01
    provides: source-safety guard XRAYEBATOR_SOURCED, pure-функция _generate_vless_url_pure, sub_token в profile JSON
  - phase: 07-happ-subscription-server
    plan: 02
    provides: _subscription_base_url() helper, install_subscription_server(), .subscription_installed marker, .happ_defaults.env
  - phase: 04-foundation-audit-fixes
    provides: safe_jq_write
provides:
  - _select_subscription_port() — 443/8443 preflight через ss
  - install_subscription_public_tls() — domain prompt + DNS preflight + certbot --non-interactive + ufw limit (REQ-C08) + nginx site config
  - install_subscription_local_only() — без nginx/certbot, без UFW (loopback bypass)
  - manage_subscription_menu() — URL + QR + revoke (safe_jq_write) + PQ-aware raw vless gate
  - happ_settings_menu() — TUI editor для .happ_defaults.env (5 ключей)
  - _happ_edit_field() — атомарная замена через awk + mktemp + mv
  - happ_subscription_menu() — главный wrapper (4 пункта: public/local/manage/settings)
  - main_menu пункт 9 «Подписка HAPP» в секции HAPP SUBSCRIPTION
  - create_profile success-screen теперь показывает subscription URL+QR как primary (если .subscription_installed)
  - /etc/nginx/sites-available/xrayebator-sub — nginx site config (создаётся install_subscription_public_tls)
  - /usr/local/etc/xray/.subscription_port — выбранный публичный порт (443 или 8443)
  - /usr/local/etc/xray/.subscription_domain — публичный домен (или 127.0.0.1 для local-only)
affects: [user-facing operator flow]

# Tech tracking
tech-stack:
  added:
    - "nginx (apt install в install_subscription_public_tls)"
    - "python3-certbot-nginx (apt install в install_subscription_public_tls)"
  patterns:
    - "Port preflight через ss -ltnp 'sport = :443' — авто-fallback на 8443 если 443 занят Xray/чужим сервисом"
    - "certbot non-interactive: --nginx -d <domain> --non-interactive --agree-tos -m <email> --redirect — нулевой UI после prompt-а домена/email"
    - "UFW limit (НЕ allow) на публичный порт — rate-limit защита (REQ-C08) от brute-force на subscription endpoint"
    - "Loopback bypass для local-only fallback: UFW НЕ открывается на 8080 (127.0.0.1 не подчиняется firewall)"
    - "DNS preflight soft (warning + опция продолжить) — split-DNS / Cloudflare proxied не блокируют операцию"
    - "_subscription_base_url() — единственный источник истины URL в 4+ call sites (B1 invariant): public-TLS summary, manage_subscription_menu, create_profile success, happ_subscription_menu status-line"
    - "PQ-aware QR gate через jq .pq_enabled — точный сигнал из profile JSON, НЕ threshold-based по длине строки (М5: не блокирует legacy профили с длинными SNI)"
    - "Атомарная замена в _happ_edit_field: awk + mktemp + mv (НЕ sed -i — риск partial write)"
    - "Sanitization _happ_edit_field: запрет \" \\ \$ \` — защита от shell-инъекции при source в subhttp"
    - "Revoke без рестарта subhttp — handler читает .sub_token из profile JSON на каждый request"
    - "Subscription URL+QR теперь primary в create_profile success-screen; raw vless остаётся через 'Подключиться по профилю' меню"

key-files:
  created: []
  modified:
    - xrayebator (4386 → 4873 строки, +487)

key-decisions:
  - "Verify-границы awk `/^fn\\(\\)/,/^}$/` ломаются на одиночных `}` внутри nginx heredoc (location { ... }) — это false-positive плана, реальный код корректен. Verify по точному диапазону sed -n строк работает безошибочно."
  - "False-positive в B1-проверке: regex `https?://\\${domain}` ловит даже комментарий ОБЪЯСНЯЮЩИЙ что мы не делаем инлайн. Уточнено в verify до `^[^#]*` (исключение комментариев)."
  - "DNS preflight soft (warning + опция продолжить) — split-DNS / Cloudflare orange-cloud / proxied A-record дают false-negatives. Operator знает свою сеть лучше getent."
  - "Email valid regex простой `^[^@]+@[^@]+\\.[^@]+$` — детальной RFC2822 валидации не нужно, certbot отверждает сам."
  - "Domain regex простой `^[a-zA-Z0-9.-]+$` — Punycode и LDH IDN не поддерживаются на этом уровне; certbot всё равно проверит."
  - "certbot --redirect — автоматически HTTP→HTTPS redirect, никакой `if (ssl)` логики в nginx config не нужно."
  - "В local-only fallback NORM UFW не трогаем (loopback bypass) — но БРОСАЕМ операцию в Plan 7.3 (НЕ Plan 7.2): идемпотентно при ре-вызове."
  - "Revoke без рестарта xrayebator-sub — handler subhttp.sh source-ит profile JSON на каждый request, кэш отсутствует. Меньше attack surface (нет stale token cache) и одноразовая операция."
  - "Регистрация пункта 9 в main_menu, не 8 — пункт 8 уже занят upgrade_profile_to_pq_menu (Phase 6). HAPP-секция в menu отдельным MAGENTA-заголовком, логически отделена от POST-QUANTUM."
  - "PQ-aware QR gate — точный сигнал, НЕ threshold. Длина vless строки зависит от: SNI (короткий vk.com vs длинный subdomain.lookout.example.com), xhttp_path, encryption ключа. PQ encryption (~2KB) — гарантированный over-limit; legacy без PQ может быть и 150 и 250 чар, и threshold всегда либо false-negative либо false-positive."

patterns-established:
  - "Port preflight через `ss -ltnp 'sport = :PORT' | tail -n +2` — пустой output = свободно. Затем pattern-match на listener name для определения owner (xray / nginx / unknown)."
  - "certbot non-interactive: 4 флага (--non-interactive --agree-tos -m <email> --redirect) + 1 -d <domain>. Лог в /tmp/certbot.log + tail -20 при failure."
  - "UFW conditional limit: `if command -v ufw && ufw status | grep 'Status: active'; then ufw limit X/tcp; fi` — не падает на VPS без UFW."
  - "Markers для shared helper'а: `_subscription_base_url` читает 2 файла, installer-ы пишут 2 файла. Нет общего state — простой контракт."
  - "TUI editor pattern: source файла → echo текущих значений → choice → _edit_field(file, key, current) → awk-replace → mv. Никаких индивидуальных read для каждого поля в главном меню — диспетчер."
  - "Sanitization для shell env-файлов: запрет 4 metacharacters \" \\ \$ \` блокирует command substitution / variable expansion при source. Простое regex `[\"\\\\\\$\\`]` достаточно."

requirements-completed:
  - REQ-C02
  - REQ-C03
  - REQ-C08
  - REQ-C12
  - REQ-C13
  - REQ-C14

# Metrics
duration: 5min
completed: 2026-05-11
---

# Phase 7 Plan 03: Public TLS and Management Menus Summary

**Завершён operator-flow HAPP subscription. Public TLS (nginx + certbot + ufw limit) — default, local-only — fallback. TUI меню для управления (URL/QR/revoke + редактор .happ_defaults.env). PQ-aware QR policy. Phase 7 COMPLETE.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-11T08:26:47Z
- **Completed:** 2026-05-11T08:32:30Z (approx)
- **Tasks:** 3
- **Files modified:** 1 (xrayebator)
- **Lines added:** +487 (4386 → 4873)
- **Commits:** 3 (a95bd99 + 692732d + f375954)

## Accomplishments

- **`_select_subscription_port()`** (xrayebator:1955) — preflight 443 vs 8443 через `ss -ltnp 'sport = :443'`. Если порт занят xray-процессом → fallback на 8443 с предупреждением; если занят чужим сервисом → fallback + warning об источнике.
- **`install_subscription_public_tls()`** (xrayebator:1978) — REQ-C02 default flow:
  - Pre-flight: вызывает `install_subscription_server` (Plan 7.2) если `.subscription_installed` marker отсутствует
  - Domain prompt (regex `^[a-zA-Z0-9.-]+$`)
  - DNS preflight через `getent hosts` — soft warning при mismatch
  - Email prompt (regex `^[^@]+@[^@]+\.[^@]+$`)
  - Port preflight
  - `apt-get install -y nginx python3-certbot-nginx`
  - nginx site config heredoc (location /sub/ proxy_pass http://127.0.0.1:8080, location / return 404)
  - `nginx -t` валидация + reload
  - `certbot --nginx -d <domain> --non-interactive --agree-tos -m <email> --redirect`
  - `ufw limit <pub_port>/tcp` (REQ-C08 — НЕ allow!)
  - Запись markers: `.subscription_port`, `.subscription_domain`
  - `systemctl daemon-reload && systemctl enable --now xrayebator-sub.service`
  - Финальный summary URL через `_subscription_base_url` (B1)
- **`install_subscription_local_only()`** (xrayebator:2112) — REQ-C03 fallback:
  - Pre-flight install_subscription_server
  - Markers: 8080 + 127.0.0.1
  - `systemctl enable --now` БЕЗ nginx/certbot
  - UFW НЕ трогаем (loopback bypass)
  - ssh-tunnel hint в output
- **`manage_subscription_menu()`** (xrayebator:2150) — REQ-C12:
  - Список профилей с `[token: 8hex...]` preview
  - URL + qrencode -t ANSIUTF8 для subscription URL (REQ-C14: ВСЕГДА QR для short HTTPS)
  - Revoke: `openssl rand -hex 16` + `safe_jq_write '.sub_token = $t'` + chown — БЕЗ рестарта subhttp
  - Advanced raw vless:// (M5 PQ-aware gate: `jq -r '.pq_enabled // false'` — если true → no QR + warning; если false → qrencode)
- **`happ_settings_menu()`** (xrayebator:2291) — REQ-C13:
  - Source env-file, отображает 5 ключей с текущими значениями
  - Диспетчер на `_happ_edit_field`
- **`_happ_edit_field()`** (xrayebator:2335) — атомарная замена:
  - read -r new_val (M6)
  - Sanitization запрет `" \ $ \``
  - awk + mktemp + mv (НЕ sed -i)
  - chmod 644 + chown xray:xray
- **`happ_subscription_menu()`** (xrayebator:2371) — главный wrapper:
  - Status-line через `_subscription_base_url` (B1)
  - 4 пункта: public TLS / local-only / manage / settings
  - Возврат в main_menu
- **`main_menu` интеграция** (xrayebator:2486 + 2503) — пункт 9 «Подписка HAPP» в новой секции HAPP SUBSCRIPTION
- **`create_profile` success-screen модификация** (xrayebator:2748-2767) — после `SNI:` показывается:
  - Если `.subscription_installed`: subscription URL + QR через `_subscription_base_url`
  - Если не установлено: подсказка «Включите через 'Главное меню → Подписка HAPP'»

## Task Commits

Each task was committed atomically:

1. **Task 1: public TLS + local-only installers + port preflight** — `a95bd99` (feat)
2. **Task 2a: manage_subscription_menu + create_profile success-screen** — `692732d` (feat)
3. **Task 2b: happ_settings_menu + _happ_edit_field + happ_subscription_menu wrapper** — `f375954` (feat)

## Files Created/Modified

- `xrayebator` — +487 строк (4386 → 4873).
  - Строка 1955: `_select_subscription_port()`
  - Строка 1978: `install_subscription_public_tls()`
  - Строка 2112: `install_subscription_local_only()`
  - Строка 2150: `manage_subscription_menu()`
  - Строка 2291: `happ_settings_menu()`
  - Строка 2335: `_happ_edit_field()`
  - Строка 2371: `happ_subscription_menu()`
  - Строка 2486: main_menu пункт 9 display
  - Строка 2503: main_menu пункт 9 case dispatch
  - Строка 2748-2767: create_profile success-screen Phase 7 block

## Operator Flow Diagram

```
Главное меню
    │
    ├─ 1) Создать новый профиль
    │     └─ create_profile (success-screen)
    │         ├─ if .subscription_installed:
    │         │     ├─ ═══ HAPP SUBSCRIPTION URL ═══
    │         │     ├─ URL: https://<domain>/sub/<32hex>  (via _subscription_base_url)
    │         │     └─ qrencode -t ANSIUTF8 <url>
    │         └─ else:
    │               └─ ℹ Включите через Главное меню → Подписка HAPP
    │
    └─ 9) Подписка HAPP                      ← НОВЫЙ ПУНКТ
          │
          ├─ Status: ✓ Установлено: https://<domain>      (или ⚠ Не установлено)
          │
          ├─ 1) Установить (public TLS) ─┐
          │     ├─ domain prompt          │
          │     ├─ DNS preflight          │
          │     ├─ email prompt           │
          │     ├─ port preflight 443/8443 │
          │     ├─ apt nginx + certbot    │
          │     ├─ nginx site config      │
          │     ├─ certbot --non-interactive --agree-tos --redirect
          │     ├─ ufw limit <port>/tcp   (НЕ allow!)
          │     ├─ markers .subscription_port + .subscription_domain
          │     └─ systemctl enable --now xrayebator-sub
          │
          ├─ 2) Установить (local-only) ─┐
          │     ├─ markers: 8080 + 127.0.0.1
          │     └─ systemctl enable --now (без nginx, без UFW)
          │
          ├─ 3) Управление подпиской
          │     └─ Список профилей → выбор
          │         ├─ 1) QR-код subscription URL  (REQ-C14)
          │         ├─ 2) Revoke (новый sub_token, безрестартный)
          │         └─ 3) Raw vless:// advanced (PQ-aware QR gate)
          │
          └─ 4) Настройки HAPP (.happ_defaults.env TUI)
                ├─ HAPP_SUPPORT_URL
                ├─ HAPP_WEB_URL
                ├─ HAPP_PROFILE_UPDATE_INTERVAL
                ├─ HAPP_ANNOUNCE_FILE
                └─ HAPP_ROUTING_JSON_FILE
                  (awk + mktemp + mv; без рестарта)
```

## Invariant Confirmations

### B1 — единственный источник истины для URL

`_subscription_base_url` (Plan 7.2) — единственный source of truth для build base URL подписки. Plan 7.3 имеет 4 call sites:

| Call site | Расположение | Файл-зависимость |
|-----------|--------------|------------------|
| `install_subscription_public_tls()` finals summary | xrayebator:2102 | `_summary_base=$(_subscription_base_url)` |
| `manage_subscription_menu()` URL build | xrayebator:2174 | `base_url=$(_subscription_base_url)` |
| `create_profile()` success-screen | xrayebator:2757 | `_base=$(_subscription_base_url)` |
| `happ_subscription_menu()` status-line | xrayebator:2381 | `_status_url=$(_subscription_base_url)` |

Никаких инлайн `https://${domain}/sub/...` / `http://127.0.0.1:8080/sub/...` в новых функциях. Полный grep: `_subscription_base_url` → 11 вхождений (определение + 10 references включая комментарии).

### M5 — PQ-aware QR gate (точный сигнал)

В `manage_subscription_menu()` для action 3 (Raw vless advanced):
```bash
pq_enabled=$(jq -r '.pq_enabled // false' "$pfile" 2>/dev/null)
if [[ "$pq_enabled" == "true" ]]; then
  # No QR — text + warning о ~2KB encryption=
else
  # Legacy — qrencode -t ANSIUTF8 "$raw"
fi
```

Threshold-based (`raw_len > 256`) проверка УДАЛЕНА. Pq_enabled поле введено Phase 6 REQ-A04 / schema_version:2 в `create_profile` для xhttp transport — гарантированный точный сигнал.

### M6 — все read calls с -r

| Функция | `read -r` count | `read` без -r |
|---------|-----------------|---------------|
| `install_subscription_public_tls` | 5 | 0 |
| `install_subscription_local_only` | 1 | 0 |
| `manage_subscription_menu` | 4 | 0 |
| `happ_settings_menu` | 2 | 0 |
| `_happ_edit_field` | 1 | 0 |
| `happ_subscription_menu` | 1 | 0 |
| **Итого новых read -r** | **14** | **0** |

### UFW invariant (REQ-C08)

`grep -c "ufw limit" xrayebator` → 2 (оба в `install_subscription_public_tls`). `grep -E 'ufw allow.*(8080|443|8443)' xrayebator` → 0. В local-only режиме UFW вообще не трогается (loopback bypass).

### systemd enable invariant

`grep -c "systemctl enable --now xrayebator-sub" xrayebator` → 3 (2 фактических enable + 1 в комментарии-документации). Activation выполняется ТОЛЬКО в Plan 7.3 install-функциях, после явного выбора оператора. Plan 7.2 unit создаёт opt-in без enable (подтверждено).

## Smoke Tests

### bash -n + install.sh syntax

```bash
bash -n xrayebator && echo OK    # → OK
bash -n install.sh && echo OK    # → OK
```

### Function definitions (source test)

```bash
COUNT=$(bash -c 'source ./xrayebator >/dev/null 2>&1; \
  declare -F install_subscription_public_tls install_subscription_local_only \
    manage_subscription_menu happ_settings_menu happ_subscription_menu \
    _select_subscription_port _happ_edit_field 2>/dev/null' | wc -l)
# → 7 (все 7 функций определены)
```

### Mock revoke smoke

```bash
TMP_PROF=$(mktemp /tmp/test_profile.XXXXXX.json)
echo '{"sub_token":"00000000000000000000000000000000"}' > "$TMP_PROF"
NEW_TOKEN=$(openssl rand -hex 16)
bash -c "source ./xrayebator >/dev/null 2>&1 && \
  safe_jq_write --arg t '$NEW_TOKEN' '.sub_token = \$t' '$TMP_PROF'"
jq -r '.sub_token' "$TMP_PROF"  # → 32-hex новый token, регекс ^[a-f0-9]{32}$ ✓
```

### Helper integration (live VPS smoke — план на post-merge)

После `install_subscription_public_tls vpn.example.com admin@example.com`:
```bash
cat /usr/local/etc/xray/.subscription_domain  # → vpn.example.com
cat /usr/local/etc/xray/.subscription_port    # → 443 (или 8443)
bash -c 'source /usr/local/bin/xrayebator; _subscription_base_url'
# → https://vpn.example.com   (если 443) или https://vpn.example.com:8443

curl -v https://vpn.example.com/sub/$(jq -r '.sub_token' /usr/local/etc/xray/profiles/<profile>.json)
# → 200 OK + HAPP body (header symmetry: profile-update-interval, profile-title-base64,
#                       subscription-userinfo, support-url, profile-web-page-url, routing)
```

### Mock _happ_edit_field smoke

```bash
TMP_ENV=$(mktemp /tmp/test_env.XXXXXX)
echo 'HAPP_SUPPORT_URL="https://old.example.com"' > "$TMP_ENV"
# Симулируем edit через прямой awk (тело функции)
awk -v k="HAPP_SUPPORT_URL" -v v="https://new.example.com" \
  'BEGIN{FS=OFS="="} $1==k {$0=k"=\""v"\""} {print}' "$TMP_ENV"
# → HAPP_SUPPORT_URL="https://new.example.com"   ✓
```

## Known Edge Cases for Final VPS Smoke

- **certbot за NAT**: если VPS за carrier NAT (CGNAT) — A-record указывает на NAT IP, HTTP-01 challenge упрётся. Workaround: DNS-01 challenge (требует API провайдера, out of scope). У operator-а будет explicit error в /tmp/certbot.log.
- **certbot LE rate-limit**: 5 certs/domain/week, 50 certs/subdomain/week. При повторных попытках → 429. tail -20 /tmp/certbot.log покажет.
- **UFW не активен**: `command -v ufw` присутствует, но `ufw status | grep 'Status: active'` пустой — limit пропускается без ошибки.
- **nginx уже занимает 443 системно (Apache/панели хостингов)**: `_select_subscription_port` определит чужой listener и fallback на 8443.
- **DNS split / Cloudflare orange-cloud**: A-record вернёт CF IP вместо VPS IP — preflight выдаст warning, оператор продолжает на свой страх. certbot обычно работает через Cloudflare (CF проксирует HTTP-01).
- **socat не установлен**: install_subscription_server (Plan 7.2) ставит socat при первом запуске. Plan 7.3 предполагает что Plan 7.2 уже отработал.
- **8080 занят другим сервисом**: socat unit упадёт после `systemctl enable --now`. Status-check `systemctl is-active --quiet` поймает и вернёт error. Operator должен освободить порт.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] План verify-границы `awk '/^fn\(\)/,/^}$/'` ломаются на одиночных `}` внутри heredoc**

- **Found during:** Task 1 verify
- **Issue:** План использует `awk '/^install_subscription_public_tls\(\)/,/^}$/'` для извлечения тела функции. Но nginx site config heredoc (внутри функции) содержит строку `}` без отступа (закрытие `server { ... }`-блока). awk-range оператор останавливается на первом совпадении `^}$`, ОБРЫВАЯ извлечение посреди heredoc. Из-за этого следующая verify-проверка `grep -q '_subscription_base_url'` падала — финальный summary с helper-вызовом не попадал в извлечённое тело.
- **Fix:** Не модифицирую план, а корректирую verify-логику: использую sed-диапазон по точным строкам (`sed -n "${START},${END}p"`), вычисленный через grep по сигнатуре следующей функции. Все invariants проходят. Реальный код корректен — нагрузка только на верификационный regex плана.
- **Files modified:** Нет (issue в verify плана, не в коде)
- **Verification:** `bash -n xrayebator: OK`; `grep -c "_subscription_base_url" xrayebator: 11` (>=4); все 4 call sites используют helper.
- **Committed in:** n/a (verify methodology fix, no code change)

---

**2. [Rule 1 - Bug] False-positive в regex B1 `https?://\${domain}`**

- **Found during:** Task 1 verify
- **Issue:** План задаёт regex `https?://\$\{?domain\}?[^/]*$` для проверки отсутствия инлайн URL build. Но регекс ловит даже КОММЕНТАРИЙ объясняющий что мы НЕ делаем — конкретно: `# B1: shared helper — НЕ строим https://${domain} инлайн.`. False-positive.
- **Fix:** Уточнил regex до `^[^#]*https?://\$\{?domain\}?` — исключает строки начинающиеся с `#`. Семантически правильно — пояснительные комментарии должны иметь право упоминать чего мы избегаем.
- **Files modified:** Нет (методология verify, не сам код)
- **Verification:** `(! grep -E '^[^#]*https?://\$\{?domain\}?' BODY)` → exit 0 (no matches).
- **Committed in:** n/a (verify methodology fix)

---

**Total deviations:** 2 — обе по методологии verify плана (false-positives в regex/awk-range проверках). Реальный код плана соответствует invariants точно как требуется. Эти deviations НЕ потребовали изменения xrayebator-кода — только переинтерпретации verify-логики. Заметка для будущих фаз: avoid awk-range terminators которые могут совпадать внутри heredoc; всегда исключай комментарии (`^[^#]*`) из anti-pattern регексов.

## Issues Encountered

- Незакоммиченные сторонние изменения (`CLAUDE.md`, `update.sh`, design canvas html файлы, RESEARCH_REPORT.md) НЕ тронуты — не относятся к плану 7.3.
- Auth gates: отсутствуют (Plan 7.3 не требует операторских действий во время implementation — все функции локальные).
- Pre-existing warnings: отсутствуют.

## Phase 7 COMPLETE

Все три плана v2.0 Phase 7 завершены:

| Plan | Status | Provides |
|------|--------|----------|
| 07-01 pure-vless-url-and-token-migration | ✓ DONE | source-safety guard, _generate_vless_url_pure, sub_token |
| 07-02 subhttp-handler-and-happ-payload | ✓ DONE | _subscription_base_url, install_subscription_server, .subscription_installed marker, .happ_defaults.env |
| 07-03 public-tls-and-management-menus | ✓ DONE | public TLS / local-only installers, manage menu, settings menu, happ_subscription_menu wrapper |

Все REQ-C* satisfied: C01 ✓ C02 ✓ C03 ✓ C04 ✓ C05 ✓ C06 ✓ C07 ✓ C08 ✓ C09 ✓ C10 ✓ C11 ✓ C12 ✓ C13 ✓ C14 ✓.

Operator flow готов: единый клик в menu → public TLS endpoint → создание профиля выдаёт HAPP subscription URL + QR (primary).

## Next Phase Readiness

**v2.0 Phase 8 (final polish + AdGuard cleanup):**

- Phase 7 предоставила всё для финального release v2.0. Phase 8 — финальный polish (Plan 8.1 documentation, Plan 8.2 install.sh integration с opt-in subscription server prompt, Plan 8.3 deferred AdGuard cleanup).
- Open VPS smoke items: certbot на cleane VPS (LE rate-limit?), socat health-check after long runtime, revoke на live HAPP клиенте (форсит ли refresh).
- Subscription endpoint можно полевыми тестами проверить на staging VPS перед v2.0 GA release.

**Открытые наблюдения по Plan 7.3:**

- nginx site config жёсткий — не дублирует `proxy_set_header` для `X-Forwarded-For` / `X-Forwarded-Proto`. Для public TLS это не критично (subhttp не использует эти headers), но если в Phase 8 появятся real-IP-based rate-limiting / per-user logging — добавить.
- Email prompt в `install_subscription_public_tls` не сохраняется. Если certbot нужно renew через 60 дней, и email сменился — обновляется через `certbot register --update-registration`. Можно добавить opt-in confirm в Phase 8.
- `_select_subscription_port` сейчас простой fallback 443 → 8443. Если оба заняты — нужна более полная логика (8444, 8445, ...). Для v2.0 over-engineering; defer to v2.1 if reported.

---

## Self-Check: PASSED

Verified:

- File `xrayebator` exists, +487 строк (4873 vs 4386).
- All 3 commits exist:
  - `git log --oneline | grep a95bd99` → FOUND (Task 1: public TLS + local-only installers + port preflight)
  - `git log --oneline | grep 692732d` → FOUND (Task 2a: manage_subscription_menu + create_profile success)
  - `git log --oneline | grep f375954` → FOUND (Task 2b: happ_settings_menu + _happ_edit_field + wrapper)
- All 7 new functions defined when sourced: `_select_subscription_port`, `install_subscription_public_tls`, `install_subscription_local_only`, `manage_subscription_menu`, `happ_settings_menu`, `_happ_edit_field`, `happ_subscription_menu`.
- `bash -n xrayebator install.sh` → all pass.
- `_subscription_base_url` references: 11 (def + 10 use sites including comments).
- `ufw limit` count: 2 ✓; `ufw allow` for sub ports: 0 ✓.
- `systemctl enable --now xrayebator-sub` count: 3 (2 actual + 1 in doc-comment) ✓.
- PQ-aware gate `pq_enabled=$(jq` present in manage_subscription_menu ✓.
- Mock revoke smoke: PASS (safe_jq_write writes new 32-hex token successfully).
- Atomic mktemp + mv in _happ_edit_field ✓.
- main_menu integration: «Подписка HAPP» mentioned 3 раз (1 header + 1 line + 1 doc-comment); case `9) happ_subscription_menu` присутствует.
- create_profile success-screen modification: `Phase 7: subscription URL/QR` block присутствует на строке 2748.

---
*Phase: 07-happ-subscription-server*
*Plan: 03*
*Completed: 2026-05-11*
