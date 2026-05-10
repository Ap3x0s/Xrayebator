---
phase: 07-happ-subscription-server
plan: 03
type: execute
wave: 3
depends_on:
  - "07-02"
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-C02
  - REQ-C03
  - REQ-C08
  - REQ-C12
  - REQ-C13
  - REQ-C14

must_haves:
  truths:
    - "В главном меню xrayebator появляется новый пункт 'Подписка HAPP' (или эквивалентный label) — он ведёт в подменю с тремя действиями: 'Установить (public TLS, default)', 'Установить (local-only fallback)', 'Управление подпиской' (показ URL/QR/revoke), 'Настройки HAPP' (редактор .happ_defaults.env)"
    - "При выборе 'Установить (public TLS)': xrayebator (1) запрашивает домен у оператора, (2) проверяет, что A/AAAA домена резолвится и указывает на этот VPS, (3) делает port-conflict preflight: пытается bind 0.0.0.0:443 — если занят (Xray inbound на 443 ИЛИ другой системный сервис), переключается на 8443; (4) ставит nginx + python3-certbot-nginx через apt; (5) пишет nginx site config для `<domain>` с upstream `http://127.0.0.1:8080` и `location /sub/`; (6) запускает certbot non-interactive (`certbot --nginx -d <domain> --non-interactive --agree-tos -m <email> --redirect`) — email спрашивается у оператора; (7) применяет `ufw limit <port>/tcp` (НЕ allow — REQ-C08 требует rate-limit); (8) `systemctl enable --now xrayebator-sub`; (9) выводит summary с публичным URL `https://<domain>` и подсказкой 'Подписки на отдельные профили — через подменю Управление подпиской'"
    - "Если `certbot` упал (DNS не настроен, rate-limit LE, сертификат не выдан) — installer показывает явную ошибку, возвращает в подменю и предлагает 'Установить (local-only fallback)'. config.json не модифицируется. Стартованный было nginx site НЕ удаляется (для повторной попытки), но пользователь информируется"
    - "При выборе 'Установить (local-only)': xrayebator проверяет socat и `.subscription_installed` marker (от Plan 7.2), `systemctl enable --now xrayebator-sub` без nginx/certbot. Порт 8080 НЕ открывается в UFW (loopback bypass). В output подсказка: 'Подписки доступны только локально через ssh-tunnel `ssh -L 8080:127.0.0.1:8080 user@vps`'"
    - "B1 invariant: Plan 7.3 НЕ содержит инлайн-построения base URL (`https://${domain}` / `http://127.0.0.1:8080`). Все 3 call sites (manage_subscription_menu / create_profile success-screen / happ_subscription_menu status-line) вызывают `_subscription_base_url` (helper определён в Plan 7.2). Структурный grep в verify проверяет отсутствие raw-конкатенации `https?://\\\${domain}` / `https?://\\\${_sd}` в новых функциях"
    - "Меню 'Управление подпиской': показывает список профилей с их sub_token (первые 8 символов token-а). Для выбранного профиля: (a) полный URL `$(_subscription_base_url)/sub/<token>`; (b) QR-код этого URL через `qrencode -t ANSIUTF8 \"$url\"`; (c) опция 'revoke' — генерирует новый sub_token через `openssl rand -hex 16`, валидирует regex, пишет через `safe_jq_write` в profile JSON, выводит новый URL. Revoke НЕ требует рестарта subhttp (handler читает токен из profile JSON на каждый request)"
    - "QR policy (REQ-C14, M5 fix): QR ВСЕГДА для subscription URL (короткая HTTPS-строка). Raw `vless://` БЕЗ QR в этом меню. Если оператор хочет raw vless:// QR — есть отдельный пункт 'Показать raw vless:// (advanced)' который PQ-aware: читает `pq_enabled=$(jq -r '.pq_enabled // false' \"$pfile\")`. Если `pq_enabled == true` → QR DISABLED (copy-text + warning 'PQ vless имеет ~2KB encryption=, QR будет нечитаем'). Если `pq_enabled == false` → qrencode выполняется. Threshold-based (длина строки > N) gate УДАЛЁН — может ложно блокировать legacy профили. Rationale в комментарии функции"
    - "Меню 'Настройки HAPP': читает `/usr/local/etc/xray/.happ_defaults.env`, показывает текущие значения `HAPP_SUPPORT_URL` / `HAPP_WEB_URL` / `HAPP_PROFILE_UPDATE_INTERVAL` / `HAPP_ANNOUNCE_FILE` / `HAPP_ROUTING_JSON_FILE`, позволяет отредактировать каждое через `read -r -p` (M6: ВСЕ read используют -r чтобы не глотать backslash в путях/URL). Запись через атомарную замену: `awk ... > tmp; mv tmp /usr/local/etc/xray/.happ_defaults.env`. После записи — `chmod 644 + chown xray:xray`. Рестарт `xrayebator-sub` НЕ нужен (subhttp source-ит env на каждый request)"
    - "Создание нового профиля (`create_profile`) success-screen теперь дополнительно показывает subscription URL/QR (если `.subscription_installed` marker существует) ПЕРВЫМ — до raw vless://. URL собирается через `_subscription_base_url` (helper из Plan 7.2). Если установка НЕ сделана — показывается старый формат + подсказка 'Включите HAPP-подписку через Главное меню → Подписка HAPP → Установить'"
    - "443/8443 conflict logic: проверка через `ss -ltn 'sport = :443'` (или `lsof -i :443`); если порт занят процессом, имя которого содержит 'xray' — fallback на 8443; если занят системным nginx/apache — fallback на 8443 + warning. Выбранный порт сохраняется в `/usr/local/etc/xray/.subscription_port`, читается helper-ом `_subscription_base_url`"
    - "UFW: `ufw limit <port>/tcp` (НЕ `ufw allow`) — rate-limit REQ-C08. Для local-only порт НЕ открывается"
    - "M6 invariant: ВСЕ `read` calls в новых функциях (manage_subscription_menu, happ_settings_menu, _happ_edit_field, install_subscription_public_tls, install_subscription_local_only, happ_subscription_menu) используют `read -r` чтобы не терять backslashes в URL/путях/email"
    - "bash -n xrayebator проходит; все три install-флоу (public TLS / local-only / повторный install при существующем `.subscription_installed`) идемпотентны — повторный запуск не ломает существующее"
  artifacts:
    - path: "xrayebator"
      provides: "happ_subscription_menu() main entry + install_subscription_public_tls() + install_subscription_local_only() + manage_subscription_menu() + happ_settings_menu() + _happ_edit_field() + helper _select_subscription_port() + регистрация menu entry в main_menu(); все используют _subscription_base_url из Plan 7.2; все read с -r"
      contains: "happ_subscription_menu"
      min_lines: 4280
    - path: "/etc/nginx/sites-available/xrayebator-sub (созданный install_subscription_public_tls)"
      provides: "nginx site config: server_name <domain>, location /sub/ proxy_pass http://127.0.0.1:8080, certbot-managed certificates"
      contains: "proxy_pass http://127.0.0.1:8080"
    - path: "/etc/nginx/sites-enabled/xrayebator-sub (symlink)"
      provides: "Активация site конфига (symlink на sites-available)"
      contains: ""
    - path: "/usr/local/etc/xray/.subscription_port"
      provides: "Выбранный публичный порт (443 или 8443) — читается _subscription_base_url для сборки URL"
      contains: ""
    - path: "/usr/local/etc/xray/.subscription_domain"
      provides: "Публичный домен (если public TLS) ИЛИ '127.0.0.1' (если local-only) — читается _subscription_base_url"
      contains: ""
    - path: "/usr/local/etc/xray/.happ_defaults.env (после редактирования через menu)"
      provides: "Обновлённые значения HAPP_SUPPORT_URL/HAPP_WEB_URL/HAPP_PROFILE_UPDATE_INTERVAL/HAPP_ANNOUNCE_FILE/HAPP_ROUTING_JSON_FILE"
      contains: "HAPP_SUPPORT_URL"
  key_links:
    - from: "main_menu() (xrayebator:1520)"
      to: "happ_subscription_menu()"
      via: "Новый case option (например 9 или 10) → happ_subscription_menu"
      pattern: "happ_subscription_menu"
    - from: "install_subscription_public_tls()"
      to: "/usr/local/bin/certbot --nginx"
      via: "certbot --nginx -d <domain> --non-interactive --agree-tos -m <email> --redirect"
      pattern: "certbot --nginx"
    - from: "install_subscription_public_tls()"
      to: "ufw limit <port>/tcp"
      via: "ufw limit \"$pub_port\"/tcp (REQ-C08 — НЕ allow!)"
      pattern: "ufw limit"
    - from: "manage_subscription_menu() URL building"
      to: "_subscription_base_url() (Plan 7.2 helper)"
      via: "base_url=$(_subscription_base_url); url=\"${base_url}/sub/${token}\""
      pattern: "_subscription_base_url"
    - from: "manage_subscription_menu() revoke action"
      to: "profile JSON .sub_token (regenerated)"
      via: "safe_jq_write --arg t \"$new_token\" '.sub_token = $t' \"$pfile\""
      pattern: "safe_jq_write.*sub_token"
    - from: "create_profile() success screen"
      to: "subscription URL output via _subscription_base_url (до raw vless://)"
      via: "Если -f /usr/local/etc/xray/.subscription_installed → _base=$(_subscription_base_url) + qrencode"
      pattern: "_subscription_base_url"
    - from: "manage_subscription_menu() raw vless QR action"
      to: "PQ-aware gate (M5)"
      via: "pq_enabled=$(jq -r '.pq_enabled // false' \"$pfile\"); if pq_enabled==true → no QR"
      pattern: "pq_enabled.*pq_enabled"
---

<objective>
Завершить Phase 7: построить полный operator-flow HAPP subscription. Public TLS — default (REQ-C02), local-only — fallback (REQ-C03). Меню для управления подпиской (URL/QR/revoke per profile, REQ-C12). TUI-редактор `.happ_defaults.env` (REQ-C13). PQ-aware QR policy (REQ-C14): subscription URL — да, raw PQ vless:// — нет (gated по `pq_enabled`, не по длине строки). UFW `limit` (НЕ `allow`) на public port (REQ-C08). 443→8443 fallback логика для конфликтов с Xray inbound на 443.

Purpose: пользователь нажимает один пункт меню — получает рабочий публичный subscription endpoint. Каждый созданный профиль теперь презентуется как HAPP subscription URL/QR (primary), а raw vless:// — advanced fallback. Это финал v2.0 UX: оператор раздаёт юзерам ОДНУ короткую HTTPS-ссылку вместо длинной vless:// строки с PQ encryption.

Output (3 атомарных task — split B2):
- Task 1: install installers (public TLS + local-only) + port preflight helper.
- Task 2a: manage_subscription_menu (URL/QR/revoke + PQ-aware raw vless QR gate) + create_profile success-screen modification.
- Task 2b: happ_settings_menu + _happ_edit_field + happ_subscription_menu wrapper + регистрация в main_menu.
- Все read -r (M6). Все URL через `_subscription_base_url` (B1).
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

# Plan 7.1 SUMMARY — даёт _generate_vless_url_pure + sub_token
@.planning/phases/07-happ-subscription-server/07-01-pure-vless-url-and-token-migration-SUMMARY.md
# Plan 7.2 SUMMARY — даёт install_subscription_server, .subscription_installed marker, .happ_defaults.env, _subscription_base_url helper
@.planning/phases/07-happ-subscription-server/07-02-subhttp-handler-and-happ-payload-SUMMARY.md

# Существующий main_menu и create_profile success-screen
@xrayebator
</context>

<tasks>

<task type="auto">
  <name>Task 1: Public TLS installer + local-only fallback + port preflight</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — Helper `_select_subscription_port()`:

```
# Preflight для public HTTPS port. Возвращает (echo) 443 или 8443.
# Логика: если 443 свободен (никто не bind) → 443.
# Если занят процессом xray (значит юзер зашипил xray inbound на 443) → 8443.
# Если занят nginx/apache/др. → 8443 + warning (юзер сам разрулит).
_select_subscription_port() {
  # ss -ltn 'sport = :443' — пустой output если порт свободен.
  local listener
  listener=$(ss -ltnp 'sport = :443' 2>/dev/null | tail -n +2)
  if [[ -z "$listener" ]]; then
    echo 443
    return 0
  fi
  # Что слушает 443?
  if echo "$listener" | grep -q "xray"; then
    echo -e "${YELLOW}  ⚠ Порт 443 занят Xray inbound — fallback на 8443${NC}" >&2
  else
    echo -e "${YELLOW}  ⚠ Порт 443 занят ($listener) — fallback на 8443${NC}" >&2
  fi
  echo 8443
  return 0
}
```

ШАГ 2 — Функция `install_subscription_public_tls()`:

```
install_subscription_public_tls() {
  show_ascii
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}    УСТАНОВКА ПУБЛИЧНОЙ ПОДПИСКИ (HTTPS)      ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

  # Pre-flight: subhttp.sh должен быть установлен (Plan 7.2)
  if [[ ! -f /usr/local/etc/xray/.subscription_installed ]]; then
    echo -e "${CYAN}  → subhttp.sh ещё не установлен — устанавливаем...${NC}"
    install_subscription_server || return 1
  fi

  # Запрос домена — M6: read -r чтобы не терять backslash
  local domain email
  echo -n -e "${YELLOW}Введите домен (A/AAAA должна указывать на этот VPS): ${NC}"
  read -r domain
  if [[ -z "$domain" ]] || ! [[ "$domain" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    echo -e "${RED}✗ Некорректный домен${NC}"
    sleep 2; return 1
  fi

  # DNS sanity-check (мягкий — warning, не блокер; на серверах с split-DNS может ложно сработать)
  local server_ip resolved_ip
  server_ip=$(get_server_ip)
  resolved_ip=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1)
  if [[ -n "$resolved_ip" ]] && [[ "$resolved_ip" != "$server_ip" ]]; then
    echo -e "${YELLOW}  ⚠ DNS-резолв $domain → $resolved_ip, но VPS IP = $server_ip${NC}"
    echo -e "${YELLOW}    certbot скорее всего откажет. Продолжить? [y/N]${NC}"
    local cont; read -r cont
    [[ "$cont" =~ ^[yYдД]$ ]] || return 1
  fi

  echo -n -e "${YELLOW}Email для Let's Encrypt (восстановление аккаунта): ${NC}"
  read -r email
  if [[ -z "$email" ]] || ! [[ "$email" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
    echo -e "${RED}✗ Некорректный email${NC}"
    sleep 2; return 1
  fi

  # Port preflight: 443 vs 8443
  local pub_port
  pub_port=$(_select_subscription_port)
  echo -e "${CYAN}  → Публичный порт: $pub_port${NC}"

  # Установка nginx + certbot
  echo -e "${CYAN}  → Установка nginx + python3-certbot-nginx...${NC}"
  if ! apt-get install -y nginx python3-certbot-nginx >/dev/null 2>&1; then
    echo -e "${RED}✗ apt-get install не удалось${NC}"
    return 1
  fi

  # nginx site config
  cat > /etc/nginx/sites-available/xrayebator-sub << NGINX_EOF
server {
    listen ${pub_port};
    listen [::]:${pub_port};
    server_name ${domain};

    location /sub/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Catch-all для других путей — 404 (не утечка существования endpoint)
    location / {
        return 404;
    }
}
NGINX_EOF
  ln -sf /etc/nginx/sites-available/xrayebator-sub /etc/nginx/sites-enabled/xrayebator-sub
  if ! nginx -t >/dev/null 2>&1; then
    echo -e "${RED}✗ nginx -t failed${NC}"
    rm -f /etc/nginx/sites-enabled/xrayebator-sub
    return 1
  fi
  systemctl reload nginx

  # certbot --nginx --non-interactive
  echo -e "${CYAN}  → Запуск certbot для $domain...${NC}"
  if ! certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect >/tmp/certbot.log 2>&1; then
    echo -e "${RED}✗ certbot не смог выдать сертификат. Лог: /tmp/certbot.log${NC}"
    cat /tmp/certbot.log | tail -20
    echo -e "${YELLOW}  → Site config оставлен. Можно повторить попытку или выбрать local-only fallback.${NC}"
    return 1
  fi

  # UFW limit (REQ-C08 — НЕ allow!)
  if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw limit "${pub_port}/tcp" >/dev/null 2>&1
    ufw reload >/dev/null 2>&1
    echo -e "${GREEN}  ✓ UFW: limit ${pub_port}/tcp${NC}"
  fi

  # Zapomnить port + domain (читается _subscription_base_url из Plan 7.2)
  echo "$pub_port" > /usr/local/etc/xray/.subscription_port
  echo "$domain" > /usr/local/etc/xray/.subscription_domain
  chown xray:xray /usr/local/etc/xray/.subscription_port /usr/local/etc/xray/.subscription_domain 2>/dev/null || true

  # Активация юнита
  systemctl daemon-reload
  systemctl enable --now xrayebator-sub.service
  if ! systemctl is-active --quiet xrayebator-sub.service; then
    echo -e "${RED}✗ xrayebator-sub.service не запустился — проверьте journalctl -u xrayebator-sub${NC}"
    return 1
  fi

  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}    ✓ ПУБЛИЧНАЯ ПОДПИСКА АКТИВНА              ${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════${NC}\n"
  # B1: используем shared helper для display URL — никакого инлайн-построения
  local _summary_base
  _summary_base=$(_subscription_base_url)
  echo -e "${BLUE}URL:${NC} ${GREEN}${_summary_base}${NC} (порт ${pub_port})"
  echo -e "${CYAN}Подписки на профили — через подменю 'Управление подпиской'${NC}"
  echo ""
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"; read -r _
}
```

ШАГ 3 — Функция `install_subscription_local_only()`:

```
install_subscription_local_only() {
  show_ascii
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}    УСТАНОВКА ПОДПИСКИ (LOCAL-ONLY FALLBACK) ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"
  echo -e "${YELLOW}⚠ Подписки доступны только локально (127.0.0.1:8080).${NC}"
  echo -e "${YELLOW}  Доступ — через ssh-tunnel: ssh -L 8080:127.0.0.1:8080 user@vps${NC}\n"

  if [[ ! -f /usr/local/etc/xray/.subscription_installed ]]; then
    install_subscription_server || return 1
  fi

  echo "8080" > /usr/local/etc/xray/.subscription_port
  echo "127.0.0.1" > /usr/local/etc/xray/.subscription_domain
  chown xray:xray /usr/local/etc/xray/.subscription_port /usr/local/etc/xray/.subscription_domain 2>/dev/null || true

  systemctl daemon-reload
  systemctl enable --now xrayebator-sub.service
  if ! systemctl is-active --quiet xrayebator-sub.service; then
    echo -e "${RED}✗ xrayebator-sub.service не запустился${NC}"
    return 1
  fi

  echo ""
  echo -e "${GREEN}✓ Local-only handler запущен на 127.0.0.1:8080${NC}"
  echo -e "${CYAN}  UFW: порт НЕ открыт (loopback bypass).${NC}"
  echo ""
  echo -n -e "${YELLOW}Нажмите Enter для продолжения...${NC}"; read -r _
}
```

КРИТИЧНО:
- В local-only режиме UFW НЕ трогаем (REQ-C03 — порт НЕ открывается).
- В public TLS режиме `ufw limit`, НЕ `ufw allow` (REQ-C08 явно требует rate-limit).
- Domain validation regex простая — детальная валидация не нужна, certbot всё равно проверит DNS.
- DNS preflight — мягкий (warning + опция продолжить), потому что split-DNS / cloud DNS / proxied (Cloudflare orange-cloud) могут давать ложные negatives. Operator знает свою сеть.
- certbot --non-interactive --agree-tos --redirect — стандартные флаги для автоматизации без UI.
- Email валидация — простой regex (RFC2822 не нужен).
- M6: ВСЕ `read` calls — с флагом `-r` (4 шт в этом task: domain, cont, email, Enter-pause × 2).
- B1: для финального display URL зовём `_subscription_base_url` (Plan 7.2 helper). НЕ собираем `https://${domain}` инлайн.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "^_select_subscription_port()" xrayebator && \
grep -q "^install_subscription_public_tls()" xrayebator && \
grep -q "^install_subscription_local_only()" xrayebator && \
grep -q "certbot --nginx" xrayebator && \
grep -q "ufw limit" xrayebator && \
# B1: install_subscription_public_tls для display URL зовёт _subscription_base_url (НЕ строит инлайн)
awk '/^install_subscription_public_tls\(\)/,/^}$/' xrayebator | grep -q '_subscription_base_url' && \
# B1 структурно: в install_subscription_public_tls НЕТ инлайн-конкатенации https://${domain}
! awk '/^install_subscription_public_tls\(\)/,/^}$/' xrayebator | grep -E 'https?://\$\{?domain\}?[^/]*$' >/dev/null && \
# M6: все read в install_subscription_public_tls используют -r (минимум 4 read)
[[ "$(awk '/^install_subscription_public_tls\(\)/,/^}$/' xrayebator | grep -c 'read -r')" -ge 4 ]] && \
# M6: read без -r отсутствует (исключаем `read -r ...`)
! awk '/^install_subscription_public_tls\(\)/,/^}$/' xrayebator | grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r' >/dev/null && \
echo "PASS: установщики готовы; certbot + ufw limit + port preflight + B1 helper + M6 read -r"
  </verify>
  <done>
В xrayebator определены `_select_subscription_port`, `install_subscription_public_tls`, `install_subscription_local_only`. Public flow: domain prompt → DNS preflight → port preflight (443/8443) → apt nginx+certbot → nginx site config → certbot --non-interactive → ufw limit → enable+start xrayebator-sub. Local-only flow: enable+start без nginx/UFW. Оба пишут .subscription_port + .subscription_domain (читается `_subscription_base_url` из Plan 7.2). Display URL в обоих installer-ах строится через helper `_subscription_base_url` (B1 — никакого инлайна). Все `read` calls с `-r` (M6). bash -n проходит.
  </done>
</task>

<task type="auto">
  <name>Task 2a: manage_subscription_menu (URL/QR/revoke + PQ-aware raw vless QR gate) + create_profile success-screen</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — Функция `manage_subscription_menu()` — РЕВОК + URL/QR + advanced raw vless с PQ-aware gate:

```
manage_subscription_menu() {
  show_ascii
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}    УПРАВЛЕНИЕ ПОДПИСКОЙ                      ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

  if [[ ! -f /usr/local/etc/xray/.subscription_installed ]]; then
    echo -e "${RED}✗ Подписка не установлена. Сначала выберите 'Установить'.${NC}"
    sleep 2; return
  fi

  # B1: base_url ВСЕГДА через shared helper (Plan 7.2). Никакого инлайн-построения.
  local base_url
  base_url=$(_subscription_base_url)

  local profiles=($(ls -1 "$PROFILES_DIR" 2>/dev/null | sed 's/.json//'))
  if [[ ${#profiles[@]} -eq 0 ]]; then
    echo -e "${YELLOW}⚠ Нет профилей.${NC}"; sleep 2; return
  fi

  echo -e "${YELLOW}Выберите профиль:${NC}\n"
  local i=1
  for profile in "${profiles[@]}"; do
    local tok=$(jq -r '.sub_token // ""' "$PROFILES_DIR/$profile.json" 2>/dev/null)
    local short="${tok:0:8}"
    echo -e "${CYAN} $i)${NC} $profile ${BLUE}[token: ${short}...]${NC}"
    ((i++))
  done
  echo -e "${CYAN} 0)${NC} Назад\n"
  echo -n -e "${YELLOW}Профиль: ${NC}"
  local choice; read -r choice
  [[ "$choice" == "0" ]] && return
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ $choice -lt 1 ]] || [[ $choice -gt ${#profiles[@]} ]]; then
    echo -e "${RED}✗ Неверный выбор${NC}"; sleep 2; return
  fi

  local selected="${profiles[$((choice-1))]}"
  local pfile="$PROFILES_DIR/${selected}.json"
  local token=$(jq -r '.sub_token // ""' "$pfile" 2>/dev/null)
  if [[ ! "$token" =~ ^[a-f0-9]{32}$ ]]; then
    echo -e "${RED}✗ В профиле нет валидного sub_token. Запустите 'sudo xrayebator' — миграция .subscription_tokens_2026 догенерирует.${NC}"
    sleep 3; return
  fi

  while true; do
    show_ascii
    local url="${base_url}/sub/${token}"
    echo -e "${BLUE}═══ Профиль: ${selected} ═══${NC}\n"
    echo -e "${BLUE}Subscription URL:${NC}\n  ${GREEN}$url${NC}\n"
    echo -e "${CYAN} 1)${NC} Показать QR-код subscription URL"
    echo -e "${CYAN} 2)${NC} Revoke (сгенерировать новый sub_token)"
    echo -e "${CYAN} 3)${NC} Показать raw vless:// (advanced)"
    echo -e "${CYAN} 0)${NC} Назад\n"
    echo -n -e "${YELLOW}Выбор: ${NC}"
    local act; read -r act
    case "$act" in
      1)
        # REQ-C14: QR ВСЕГДА для короткого subscription URL
        echo ""
        qrencode -t ANSIUTF8 "$url"
        echo ""
        echo -n -e "${YELLOW}Enter для продолжения...${NC}"; read -r _
        ;;
      2)
        # Revoke
        local new_token
        new_token=$(openssl rand -hex 16)
        if [[ ! "$new_token" =~ ^[a-f0-9]{32}$ ]]; then
          echo -e "${RED}✗ Не удалось сгенерировать токен${NC}"; sleep 2; continue
        fi
        if ! safe_jq_write --arg t "$new_token" '.sub_token = $t' "$pfile"; then
          echo -e "${RED}✗ Запись в profile JSON не удалась${NC}"; sleep 2; continue
        fi
        chown xray:xray "$pfile" 2>/dev/null || true
        token="$new_token"
        echo -e "${GREEN}✓ Новый sub_token. Старая URL более не работает.${NC}"
        echo -e "${CYAN}  Новая URL: ${base_url}/sub/${token}${NC}"
        sleep 3
        ;;
      3)
        # M5 fix: raw vless:// QR — PQ-aware gate (НЕ threshold-based).
        # Rationale: PQ-профили имеют encryption=mlkem768x25519plus.<base64-2KB> → unscannable QR.
        # Legacy профили (без PQ) имеют ~150-200 char vless:// → корректно влазят в Version-25 QR с ECC L.
        # Threshold-based gate (length > N) рискует ложно блокировать legacy QR при необычных параметрах
        # (длинный SNI, длинный xhttp_path) — поэтому используем точный sygnal: pq_enabled из profile JSON.
        local raw pq_enabled
        raw=$(_generate_vless_url_pure "$pfile" 2>/dev/null) || {
          echo -e "${RED}✗ Не удалось построить vless://${NC}"; sleep 2; continue
        }
        pq_enabled=$(jq -r '.pq_enabled // false' "$pfile" 2>/dev/null)
        echo ""
        echo -e "${CYAN}Raw vless:// URL:${NC}"
        echo -e "${YELLOW}${raw}${NC}\n"
        if [[ "$pq_enabled" == "true" ]]; then
          echo -e "${RED}  ✗ QR не генерируется: PQ-профиль (encryption=mlkem... ~2KB).${NC}"
          echo -e "${YELLOW}  PQ vless:// строки нечитаемы как QR-код.${NC}"
          echo -e "${YELLOW}  Используйте subscription URL/QR (пункт 1 — короткий HTTPS-link).${NC}"
        else
          echo -e "${GREEN}  → legacy профиль (без PQ) — QR допустим${NC}"
          qrencode -t ANSIUTF8 "$raw"
        fi
        echo ""
        echo -n -e "${YELLOW}Enter для продолжения...${NC}"; read -r _
        ;;
      0) return ;;
    esac
  done
}
```

ШАГ 2 — Modify `create_profile()` success-screen (xrayebator:1830-1846). После строки `echo -e "${BLUE}SNI:${NC} $actual_sni"` (xrayebator:1840) добавить блок subscription URL/QR ПЕРЕД raw vless блоком:

```
# Phase 7: subscription URL/QR — primary output если установлено.
# B1: URL строится через _subscription_base_url (Plan 7.2 helper) — никакого инлайна!
if [[ -f /usr/local/etc/xray/.subscription_installed ]]; then
  local _tok=$(jq -r '.sub_token // ""' "$PROFILES_DIR/$name.json" 2>/dev/null)
  if [[ "$_tok" =~ ^[a-f0-9]{32}$ ]]; then
    local _base
    _base=$(_subscription_base_url)
    local _url="${_base}/sub/${_tok}"
    echo ""
    echo -e "${GREEN}═══ HAPP SUBSCRIPTION URL ═══${NC}"
    echo -e "${BLUE}URL:${NC} ${GREEN}${_url}${NC}"
    echo ""
    qrencode -t ANSIUTF8 "$_url"
  fi
else
  echo ""
  echo -e "${YELLOW}ℹ HAPP-подписка ещё не установлена. Включите через 'Главное меню → Подписка HAPP'.${NC}"
fi
```

КРИТИЧНО:
- B1: ВСЕ URL build идёт через `_subscription_base_url`. НЕТ инлайн `https://${_sd}/...` или `http://127.0.0.1:8080/sub/...`. 
- M5: `pq_enabled` lookup ИЗ profile JSON — НЕ длина строки. Это точный сигнал, без false-positives для legacy профилей.
- M6: ВСЕ `read` calls с `-r` (4 шт в этом task: choice, act, два Enter-pauses).
- Revoke НЕ требует рестарта `xrayebator-sub.service` — handler читает sub_token из profile JSON на каждый request.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "^manage_subscription_menu()" xrayebator && \
# B1 invariant: manage_subscription_menu использует _subscription_base_url
awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -q '_subscription_base_url' && \
# B1: НЕТ инлайн-построения base URL внутри manage_subscription_menu
! awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -E '^\s*(base_url|_base|url)=.?(http|https)://' >/dev/null && \
# create_profile success-screen использует _subscription_base_url
grep -q "HAPP SUBSCRIPTION URL" xrayebator && \
# B1 в create_profile: блок Phase 7 use _subscription_base_url; нет ${_sd}:${_sp} инлайна
awk '/Phase 7: subscription URL\/QR/,/HAPP-подписка ещё не установлена/' xrayebator | grep -q '_subscription_base_url' && \
! awk '/Phase 7: subscription URL\/QR/,/HAPP-подписка ещё не установлена/' xrayebator | grep -E '_base="(http|https)://\$\{_sd\}' >/dev/null && \
# M5: PQ-aware gate (jq pq_enabled), threshold-based (raw_len > 256) УДАЛЁН
awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -q 'pq_enabled=\$(jq -r' && \
! awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -E 'raw_len.*256|256.*raw_len' >/dev/null && \
# Revoke использует safe_jq_write
grep -q "safe_jq_write.*sub_token" xrayebator && \
# M6: все read в manage_subscription_menu используют -r
[[ "$(awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -c 'read -r')" -ge 4 ]] && \
! awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r' >/dev/null && \
echo "PASS: manage menu + create_profile success — все через _subscription_base_url; PQ-aware gate; read -r"
  </verify>
  <done>
`manage_subscription_menu()` определена. URL строится через `_subscription_base_url` (B1 — никакого инлайна). PQ-aware QR gate: `pq_enabled=$(jq -r '.pq_enabled // false' "$pfile")` — threshold-based проверка длины УДАЛЕНА (M5). Revoke через `safe_jq_write`. Все `read` с `-r` (M6). `create_profile()` success-screen теперь показывает subscription URL+QR через helper `_subscription_base_url` ПЕРЕД raw vless. bash -n проходит.
  </done>
</task>

<task type="auto">
  <name>Task 2b: happ_settings_menu + _happ_edit_field (TUI editor) + happ_subscription_menu wrapper + main_menu регистрация</name>
  <files>xrayebator</files>
  <action>
ШАГ 1 — Функция `happ_settings_menu()` (REQ-C13):

```
happ_settings_menu() {
  local env_file=/usr/local/etc/xray/.happ_defaults.env
  if [[ ! -f "$env_file" ]]; then
    echo -e "${RED}✗ $env_file не существует — сначала выполните установку подписки.${NC}"
    sleep 2; return
  fi

  while true; do
    show_ascii
    # Source — чтобы прочитать текущие значения
    local HAPP_SUPPORT_URL HAPP_WEB_URL HAPP_PROFILE_UPDATE_INTERVAL HAPP_ANNOUNCE_FILE HAPP_ROUTING_JSON_FILE
    source "$env_file"

    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    НАСТРОЙКИ HAPP METADATA                   ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"
    echo -e "${CYAN} 1)${NC} HAPP_SUPPORT_URL = ${YELLOW}${HAPP_SUPPORT_URL:-(не задано)}${NC}"
    echo -e "${CYAN} 2)${NC} HAPP_WEB_URL = ${YELLOW}${HAPP_WEB_URL:-(не задано)}${NC}"
    echo -e "${CYAN} 3)${NC} HAPP_PROFILE_UPDATE_INTERVAL = ${YELLOW}${HAPP_PROFILE_UPDATE_INTERVAL:-24}${NC} часов"
    echo -e "${CYAN} 4)${NC} HAPP_ANNOUNCE_FILE = ${YELLOW}${HAPP_ANNOUNCE_FILE:-(не задано)}${NC}"
    echo -e "${CYAN} 5)${NC} HAPP_ROUTING_JSON_FILE = ${YELLOW}${HAPP_ROUTING_JSON_FILE:-(не задано)}${NC}"
    echo -e "${CYAN} 0)${NC} Назад\n"
    echo -n -e "${YELLOW}Изменить (1-5, 0=назад): ${NC}"
    local choice; read -r choice
    case "$choice" in
      0) return ;;
      1) _happ_edit_field "$env_file" "HAPP_SUPPORT_URL" "$HAPP_SUPPORT_URL" ;;
      2) _happ_edit_field "$env_file" "HAPP_WEB_URL" "$HAPP_WEB_URL" ;;
      3) _happ_edit_field "$env_file" "HAPP_PROFILE_UPDATE_INTERVAL" "$HAPP_PROFILE_UPDATE_INTERVAL" ;;
      4) _happ_edit_field "$env_file" "HAPP_ANNOUNCE_FILE" "$HAPP_ANNOUNCE_FILE" ;;
      5) _happ_edit_field "$env_file" "HAPP_ROUTING_JSON_FILE" "$HAPP_ROUTING_JSON_FILE" ;;
      *) echo -e "${RED}✗ Некорректный выбор${NC}"; sleep 1 ;;
    esac
  done
}

# Helper: атомарная замена значения key=... в env-файле через temp+mv.
# M6: read -r чтобы не терять backslash в URL/путях.
_happ_edit_field() {
  local env_file="$1"
  local key="$2"
  local current="$3"
  echo -n -e "${YELLOW}Новое значение для ${key} (Enter=оставить '${current}'): ${NC}"
  local new_val; read -r new_val
  [[ -z "$new_val" ]] && return 0   # пользователь отменил
  # Простая sanitization: запрещаем кавычки и backslash (защита от shell-инъекции при source)
  if [[ "$new_val" =~ [\"\\\$\`] ]]; then
    echo -e "${RED}✗ Значение не может содержать символы \" \\ \$ \`${NC}"; sleep 2; return 1
  fi
  # Атомарная замена через temp+mv. sed -i делать НЕ безопасно — может оставить файл в полу-записанном виде.
  local tmp
  tmp=$(mktemp /tmp/happ_defaults.XXXXXX) || { echo -e "${RED}✗ mktemp failed${NC}"; return 1; }
  if grep -q "^${key}=" "$env_file"; then
    awk -v k="$key" -v v="$new_val" 'BEGIN{FS=OFS="="} $1==k {$0=k"=\""v"\""} {print}' "$env_file" > "$tmp"
  else
    cp "$env_file" "$tmp"
    printf '%s="%s"\n' "$key" "$new_val" >> "$tmp"
  fi
  # Sanity: temp не пуст
  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    echo -e "${RED}✗ Временный файл пуст — отмена${NC}"; return 1
  fi
  mv "$tmp" "$env_file"
  chmod 644 "$env_file"
  chown xray:xray "$env_file" 2>/dev/null || true
  echo -e "${GREEN}✓ ${key} обновлено (рестарт subhttp не требуется — source на каждый request)${NC}"
  sleep 1
}
```

ШАГ 2 — Главный wrapper подменю `happ_subscription_menu()` (использует helper `_subscription_base_url` для status-line):

```
happ_subscription_menu() {
  while true; do
    show_ascii
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    HAPP SUBSCRIPTION SERVER                  ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

    if [[ -f /usr/local/etc/xray/.subscription_installed ]]; then
      # B1: status-line строится через shared helper, никакого инлайна
      local _status_url
      _status_url=$(_subscription_base_url)
      echo -e "${GREEN}  ✓ Установлено: ${_status_url}${NC}\n"
    else
      echo -e "${YELLOW}  ⚠ Не установлено${NC}\n"
    fi

    echo -e "${CYAN} 1)${NC} Установить (public TLS, default — требует домен)"
    echo -e "${CYAN} 2)${NC} Установить (local-only fallback — без домена/UFW)"
    echo -e "${CYAN} 3)${NC} Управление подпиской (URL / QR / revoke)"
    echo -e "${CYAN} 4)${NC} Настройки HAPP (.happ_defaults.env)"
    echo -e "${CYAN} 0)${NC} Назад в главное меню\n"
    echo -n -e "${YELLOW}Выбор: ${NC}"
    local c; read -r c
    case "$c" in
      1) install_subscription_public_tls ;;
      2) install_subscription_local_only ;;
      3) manage_subscription_menu ;;
      4) happ_settings_menu ;;
      0) return ;;
    esac
  done
}
```

ШАГ 3 — Регистрация в `main_menu()` (xrayebator:1520-1610). Добавить новый case под существующим case `8) upgrade_profile_to_pq_menu ;;`. Например `9) happ_subscription_menu ;;` и в menu-display добавить:
```
echo ""
echo -e "${MAGENTA} HAPP SUBSCRIPTION:${NC}"
echo -e "${CYAN} 9)${NC} Подписка HAPP (public TLS / local handler / revoke)"
```

КРИТИЧНО:
- Замена в `_happ_edit_field` через `awk` + `temp+mv` — атомарна. `sed -i` НЕ используем (риск partial write).
- Sanitization в `_happ_edit_field` запрещает `" \ $ \``, чтобы значение safely попало в `KEY="VALUE"` shell-литерал (без command substitution / variable expansion при subhttp source).
- Изменение `.happ_defaults.env` НЕ требует рестарта (subhttp source-ит env на каждый request).
- M6: ВСЕ `read` calls с `-r` (3 шт в этом task: choice в happ_settings_menu, new_val в _happ_edit_field, c в happ_subscription_menu).
- B1: `happ_subscription_menu` status-line строится через `_subscription_base_url`.
  </action>
  <verify>
bash -n xrayebator && \
grep -q "^happ_settings_menu()" xrayebator && \
grep -q "^happ_subscription_menu()" xrayebator && \
grep -q "^_happ_edit_field()" xrayebator && \
# Регистрация в main_menu
grep -q "happ_subscription_menu" xrayebator && \
# B1: happ_subscription_menu использует helper для status-line, не инлайн
awk '/^happ_subscription_menu\(\)/,/^}$/' xrayebator | grep -q '_subscription_base_url' && \
# M6: ВСЕ read в happ_settings_menu, _happ_edit_field, happ_subscription_menu используют -r
[[ "$(awk '/^happ_settings_menu\(\)/,/^}$/' xrayebator | grep -c 'read -r')" -ge 1 ]] && \
[[ "$(awk '/^_happ_edit_field\(\)/,/^}$/' xrayebator | grep -c 'read -r')" -ge 1 ]] && \
[[ "$(awk '/^happ_subscription_menu\(\)/,/^}$/' xrayebator | grep -c 'read -r')" -ge 1 ]] && \
# M6: read без -r отсутствует в любой из трёх функций
! awk '/^happ_settings_menu\(\)/,/^}$/' xrayebator | grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r' >/dev/null && \
! awk '/^_happ_edit_field\(\)/,/^}$/' xrayebator | grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r' >/dev/null && \
! awk '/^happ_subscription_menu\(\)/,/^}$/' xrayebator | grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r' >/dev/null && \
# Атомарная замена через mktemp + mv
grep -q "mktemp /tmp/happ_defaults" xrayebator && \
grep -q "mv \"\$tmp\" \"\$env_file\"" xrayebator && \
echo "PASS: settings menu + _happ_edit_field + wrapper + main_menu регистрация; все read -r; B1 helper в status-line"
  </verify>
  <done>
`happ_settings_menu()`, `_happ_edit_field()`, `happ_subscription_menu()` определены. Подменю 'Подписка HAPP' зарегистрировано в main_menu. Status-line wrapper-а строится через `_subscription_base_url` (B1). `_happ_edit_field` пишет атомарно (awk → temp → mv). Все `read` с `-r` (M6). bash -n проходит.
  </done>
</task>

</tasks>

<verification>
1. `bash -n xrayebator` — синтаксис чист.
2. `bash -n install.sh` — не модифицирован, но проверяем для гарантии (часть phase-wide CI invariant).
3. Source-test: `bash -c 'source ./xrayebator; declare -F install_subscription_public_tls install_subscription_local_only manage_subscription_menu happ_settings_menu happ_subscription_menu _select_subscription_port _happ_edit_field' | wc -l` ≥ 7.
4. Menu-entry visible: `grep -c "Подписка HAPP" xrayebator` ≥ 1.
5. UFW limit (REQ-C08): `grep -c "ufw limit" xrayebator` ≥ 1; `ufw allow.*8080\|ufw allow.*443` НЕ должно быть в новых функциях для subscription.
6. systemd opt-in via menu, not auto-enable: `grep -A20 "install_subscription_public_tls()" xrayebator | grep -c "systemctl enable --now xrayebator-sub"` ≥ 1, но `grep -c "systemctl enable --now xrayebator-sub" xrayebator` ≤ 2 (один в public TLS, один в local-only).
7. PQ-aware gate (M5): `awk '/^manage_subscription_menu\(\)/,/^}$/' xrayebator | grep -q 'pq_enabled=\$(jq'` and `! awk ... | grep -E 'raw_len.*256'`.
8. B1 invariants: `grep -c "_subscription_base_url" xrayebator` ≥ 4 (определение в Plan 7.2 + 3 call sites здесь). Plan 7.3 функции (manage_subscription_menu, create_profile success-Phase-7-блок, happ_subscription_menu status-line, install_subscription_public_tls summary) ВСЕ используют helper.
9. M6 invariants: для каждой новой функции (`install_subscription_public_tls`, `install_subscription_local_only`, `manage_subscription_menu`, `happ_settings_menu`, `_happ_edit_field`, `happ_subscription_menu`) — `awk` тело + `grep -E '^[^#]*\bread\b[^-]' | grep -v 'read -r'` возвращает 0 совпадений (нет ни одного `read` без -r).
10. Mock revoke smoke (без запуска xray): создать /tmp/test_profile.json `{"sub_token":"00000000000000000000000000000000"}`, source xrayebator, выполнить вручную: `safe_jq_write --arg t "$(openssl rand -hex 16)" '.sub_token = $t' /tmp/test_profile.json && jq -r '.sub_token' /tmp/test_profile.json | grep -Eq '^[a-f0-9]{32}$' && echo OK`.
11. Line count: `wc -l xrayebator` ≥ 4280.
</verification>

<success_criteria>
- Public TLS — default operator flow (REQ-C02): domain prompt + certbot --non-interactive + ufw limit + nginx site config + 443/8443 fallback на конфликт.
- Local-only — fallback (REQ-C03): socat 127.0.0.1, UFW не трогаем, ssh-tunnel hint.
- UFW использует `limit` (REQ-C08), НЕ `allow`.
- manage_subscription_menu (REQ-C12): URL + QR (subscription URL only) + revoke через safe_jq_write без рестарта; advanced raw vless опция с PQ-aware gate (НЕ threshold-based).
- happ_settings_menu (REQ-C13): TUI редактор для всех 5 ключей `.happ_defaults.env`; атомарная замена через temp+mv; никакого рестарта.
- QR policy (REQ-C14, M5): primary QR для subscription URL; raw vless QR PQ-aware-gated (`pq_enabled == true` → DISABLED + warning; `false` → qrencode).
- `create_profile()` success-screen: subscription URL+QR — primary output, raw vless остаётся вторичным.
- B1 invariant: `_subscription_base_url` (helper из Plan 7.2) — единственный источник base URL. Все 3 call sites (manage_subscription_menu, create_profile success-screen, happ_subscription_menu status-line) используют helper. Никакого инлайн-построения.
- M6 invariant: ВСЕ `read` calls в новых функциях — с `-r` (4+1+4+1+1+1 = 12+ вхождений read -r).
- bash -n xrayebator проходит чисто.
- Все три install-флоу идемпотентны: повторный запуск НЕ дублирует nginx site, НЕ перетирает .happ_defaults.env (если уже существует).
</success_criteria>

<output>
После завершения создать `.planning/phases/07-happ-subscription-server/07-03-public-tls-and-management-menus-SUMMARY.md`. В summary указать:
- Точные строки в xrayebator всех 7 новых функций.
- Diagram операторского flow: главное меню → 'Подписка HAPP' → public TLS установка → создание профиля → выдача URL юзеру.
- Команды smoke-тестов: bash -n / source-test / mock revoke / mock _happ_edit_field.
- Подтверждение: `ufw limit` (НЕ `ufw allow`); `systemctl enable --now` НЕ-автоматический (только в Plan 7.3 install-функциях, после явного выбора оператора).
- Подтверждение: ВСЕ URL build идёт через `_subscription_base_url` (B1 — никакого инлайна).
- Подтверждение: PQ-aware gate (НЕ threshold) — `pq_enabled=$(jq -r '.pq_enabled // false')` (M5).
- Подтверждение: ВСЕ `read` с `-r` (M6) — список с location в каждой функции.
- Известные edge cases на финальную smoke на VPS: certbot за NAT, certbot rate-limit LE, UFW не активен, nginx уже занят на 443 системой.
</output>
</content>
</invoke>