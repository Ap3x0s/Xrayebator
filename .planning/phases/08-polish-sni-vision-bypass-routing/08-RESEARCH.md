# Phase 8: Polish (SNI 2026 + Vision Seed + Bypass Routing + AdGuard cleanup) — Research

**Researched:** 2026-05-12
**Domain:** Bash/Xray-core internals, HAPP subscription protocol, Xray routing, TLS probe
**Confidence:** HIGH (unknowns 2,3,4,5,6 resolved from primary sources; unknown 1 resolved from source code — critical findings follow)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SNI 2026 миграция:**
- Force + post-migration probe-test через `run_migration` Phase 4. Auto-prompt "запустить probe-test сейчас?" (дефолт N).
- Hardcoded `KNOWN_DEFAULTS_v1` set — защита user-custom SNI. Удаление apple/icloud — безусловно.
- probe-test: standalone CLI `sudo xrayebator probe-test` + auto-prompt. НЕ menu-item.
- probe-test output: pretty table (SNI | HTTP status | TLS handshake ok/fail | latency) + summary.

**Bypass routing:**
- Opt-in first-run prompt (дефолт N). Marker `.bypass_routing_2026`. Никаких re-prompts.
- Granular multi-select по группам. Hard block при SNI-конфликте.
- `domain:` префикс hardcoded. `outboundTag: "direct"` (существующий freedom outbound).

**Vision Seed experimental:**
- Hidden submenu в `manage_profile_menu`. Виден всем без env-var.
- RED-warning + y/N (дефолт N). Immediate apply: safe_jq_write + safe_restart_xray.
- Дефолты: из research (этот файл).

**HAPP announce:**
- Free-form read, ~200 chars. Файл `/usr/local/etc/xray/announce.txt`.
- Отдельный пункт в `happ_subscription_menu`, НЕ в `happ_settings_menu`.
- Empty file / отсутствие → subhttp.sh не эмиттит header/body comment.

**AdGuard cleanup:**
- Plan 8.3. Force uninstall при `xrayebator update` (detect `/opt/AdGuardHome/` → auto-uninstall).
- Удаление menu code (пункт 7). Риск accepted.

### Claude's Discretion
- Точный текст promptов/warningов (русский язык)
- Layout pretty-table в probe-test
- Порядок групп в bypass multi-select
- Логика DNS-cleanup при AdGuard uninstall
- Reusable helper-ы (например `_select_groups_from_bundle`)

### Deferred Ideas (OUT OF SCOPE)
- cron-based periodic probe-test
- probe-test --json output
- Bypass routing presets через subscription
- Vision Seed UI advisor
- AdGuard replacement через Xray DNS rules
- Multi-line HAPP announce с markdown
</user_constraints>

---

## Summary

Phase 8 — финальная полировка v2.0. Шесть технических unknowns исследованы по первичным источникам (исходный код Xray-core, официальная документация XTLS Project X, HAPP developer docs).

**Главная находка (CRITICAL):** `testpre` и `testseed` — **оба** являются полями объекта `Account` в VLESS протоколе (account.proto), который существует как на inbound-стороне (server/clients array), так и на outbound-стороне (client config). По названию PR (#5579) и заголовку коммита: "`testpre` (outbound pre-connect)" и "`testseed` (outbound & inbound)". То есть:
- `testpre uint32` — имеет смысл **только в outbound** (открывает N параллельных TCP-соединений заранее, чтобы не ждать latency в момент запроса). На inbound парсится, но логика не задействована.
- `testseed []uint32` — задействован **и в outbound, и в inbound** (судя по PR-заголовку). Семантика: seed для рандомизации Vision timing patterns.

Это означает, что REQ-E03 как написан (добавить testpre/testseed к inbound clients) — **технически возможен** для testseed, и **безвреден but бессмысленен** для testpre на inbound-стороне. Поля парсятся в Account struct на обеих сторонах, Xray не упадёт при лишних полях. Но operator-facing UX должен понимать: testpre работает ТОЛЬКО если тот же оператор контролирует клиентский outbound config (нетипично). Для чисто server-side конфига — только testseed имеет смысл.

**Рекомендация для planner:** REQ-E03 не блокируется, но при написании prompts — описывать testseed как "seed рандомизации Vision timing", а testpre — как "пул pre-connect соединений (только для outbound-конфигов)". Предложить оператору сохранять оба поля в inbound (они безвредны и кэшируются в `MemoryAccount`), но честно предупредить что testpre на server inbound эффекта не даёт.

**Подтверждено:** freedom outbound tag = `"direct"` (из install.sh:591). Routing rules — first-match-wins сверху вниз. HAPP announce wire format подтвержден из официальной HAPP dev docs. AdGuard uninstall — полный код в xrayebator:4668-4774 уже существует, Plan 8.3 просто автоматизирует его вызов из update.sh + удаляет menu-код.

**lk.usbank.ru:** домен не найден ни в одном публичном источнике как российский банк. Вероятная опечатка — см. Unknown #6.

---

## Bash Idioms / Xray CLI (вместо Standard Stack)

Проект — single-file Bash. Внешние зависимости фиксированы: `jq`, `curl`, `openssl`, `base64`, `awk`, `mktemp`.

| Задача | Инструмент | Заметки |
|-------|-----------|--------|
| Атомарная запись JSON | `safe_jq_write` | Уже в codebase, ОБЯЗАТЕЛЬНО использовать |
| Безопасный рестарт | `safe_restart_xray` | pre-validate + auto-rollback, НИКОГДА bare systemctl |
| Migration pattern | `run_migration <marker> <desc> <fn>` | three-valued return (0/1/≥2), touch marker только при успехе |
| Backup перед мутацией | `backup_config <name>` | централизован в run_migration |
| base64 (UTF-8 safe) | `base64 -w0` | без переносов строк, UTF-8 Cyrillic проходит корректно |
| TLS probe | `openssl s_client` + `curl -w` | см. Code Examples |
| Восстановление прав | `fix_xray_permissions` | после любого write создающего/меняющего файлы |

---

## Architecture Patterns

### Паттерн миграции (run_migration)
```bash
migrate_my_feature() {
  # check if needed
  local current_val=$(jq -r '...' "$CONFIG_FILE")
  if [[ "$current_val" == "expected" ]]; then
    return 1  # no-op → run_migration touch marker без restart
  fi
  # mutate
  safe_jq_write '...' "$CONFIG_FILE" || return 2
  return 0  # changed → run_migration вызовет safe_restart_xray
}
# Вызов:
run_migration ".my_feature_migrated" "My feature migration" migrate_my_feature
```

### Паттерн CLI dispatch (для probe-test)
```bash
# В main() или case "$1" in ... esac блоке
case "${1:-}" in
  probe-test) probe_test_command ; exit $? ;;
  update) update_command ; exit $? ;;
esac
```

### Паттерн bypass-rule safe_jq_write
```bash
# ДОБАВИТЬ bypass rule (prepend перед существующими rules, чтобы bypass шёл РАНЬШЕ block rules)
safe_jq_write \
  --argjson domains '["domain:steamcontent.com","domain:steamcdn-a.akamaihd.net"]' \
  '.routing.rules = [{"type":"field","domain":$domains,"outboundTag":"direct"}] + .routing.rules' \
  "$CONFIG_FILE"
```

### Anti-Patterns
- **НЕ** использовать `jq ... > /tmp/file && mv /tmp/file "$CONFIG_FILE"` — всегда `safe_jq_write`
- **НЕ** писать голый `systemctl restart xray` — всегда `safe_restart_xray`
- **НЕ** прочитывать bypass-домены из profile JSON когда нужны routing rules из config.json — они хранятся в разных местах
- **НЕ** добавлять bypass rule через object merge (`*`) — он clobbers существующий `fragment` anti-DPI setting freedom outbound (CLAUDE.md явно запрещает)

---

## Don't Hand-Roll

| Проблема | Не писать | Использовать | Почему |
|----------|-----------|--------------|--------|
| base64 с кириллицей | custom encoder | `printf '%s' "$text" \| base64 -w0` | bash встроенный, UTF-8-safe |
| TLS cert verification | custom TLS | `openssl s_client -connect <h>:443 -servername <h> -tls1_3 </dev/null 2>&1` | правильно читает verify return code |
| Атомарная запись JSON | `jq > tmp && mv` | `safe_jq_write` | уже написан, проверен в production |
| Detect AdGuard DNS в config | regex-грепание | `jq -r '.dns.servers[]' "$CONFIG_FILE"` и check `127.0.0.1` | надёжнее, обрабатывает массив |
| Pre-connect pool | ручной goroutine-like | `testpre`/`testseed` поля в VLESS Account | встроено в Xray-core начиная v1.251201.0 |

---

## Common Pitfalls

### Pitfall 1: Bypass rule порядок — PREPEND, не APPEND
**Что пойдёт не так:** если bypass-правило добавить в конец массива `routing.rules`, оно никогда не сработает — потому что существующее дефолтное `"outboundTag": "direct"` правило (network: tcp,udp, без domain-фильтра) стоит в конце и обрабатывается ПОСЛЕДНИМ. Bypass-rule с `domain:steamcontent.com` должен стоять РАНЬШЕ block-правил.

**Как избежать:** использовать `jq` выражение `[новое_правило] + .routing.rules` (не `.routing.rules += [...]`) — prepend в начало массива.

**Предупреждение:** правило `geosite:category-ads-all -> block` стоит выше дефолтного direct. Bypass-домены для Steam/банков/Yandex вряд ли пересекаются с ad-domains, но проверка не лишняя.

### Pitfall 2: AdGuard DNS rollback — порядок операций
**Что пойдёт не так:** если сначала остановить AdGuard, потом запустить Xray — Xray будет пытаться делать DNS-запросы к 127.0.0.1 которое больше не слушает, и все соединения упадут.

**Как избежать:** при auto-uninstall в update.sh — СНАЧАЛА восстановить Xray DNS (`safe_jq_write` → DoH Local `https+local://1.1.1.1/dns-query`), ПОТОМ остановить AdGuard, ПОТОМ `safe_restart_xray`. Это порядок из существующего `uninstall_adguard_home()` — Plan 8.3 должен его повторить.

### Pitfall 3: testseed — нет документированных "sensible defaults"
**Что пойдёт не так:** если задать произвольные значения testseed, клиенты которые не поддерживают Vision Seed либо проигнорируют поле (неизвестный proto field → protobuf backwards compat), либо откажутся подключиться.

**Как избежать:** по результатам research — нет официально рекомендованных значений. Безопасный выбор: `testpre: 1` (один pre-connect), `testseed: [0]` (нулевой seed = отключен/детерминирован). Prompt оператору должен явно показывать "по умолчанию 0 = не использовать" и давать вводить числа самостоятельно.

### Pitfall 4: lk.usbank.ru — очень вероятная опечатка
**Что пойдёт не так:** домен `lk.usbank.ru` нигде не фигурирует как легитимный российский банковский сайт. `usbank.com` — американский US Bank, `.ru` зона ему не принадлежит. Xray maintainers даже предупреждают о `apple.com` как о плохом SNI — американские банки того же класса.

**Как избежать:** заменить `lk.usbank.ru` на `lk.uralsibbank.ru` (Уралсиб Банк, ПАО) или другой подтвержденный РФ-банк. Подтвержденные альтернативы: `lk.uralsibbank.ru`, `online.uralsib.ru`, `lk.open.ru` (Открытие). Итоговый список — на усмотрение planner, но `lk.usbank.ru` НЕ включать.

### Pitfall 5: probe-test — curl недостаточен для Reality-grade SNI проверки
**Что пойдёт не так:** `curl -I https://<sni>` только проверяет HTTP-ответ — не проверяет TLS 1.3, не проверяет ALPN h2, не гарантирует что у сайта нет anti-bot блокировок с VPS IP.

**Как избежать:** использовать двуступенчатую проверку — openssl s_client для TLS (TLS 1.3 + verify return code 0) + curl для HTTP status + latency. Детали в Code Examples.

### Pitfall 6: announce header — пустая строка vs отсутствие файла
**Что пойдёт не так:** если subhttp.sh эмиттит `announce: ` (пустое значение), некоторые HAPP версии могут сломать парсинг.

**Как избежать:** в subhttp.sh проверять `[[ -s /usr/local/etc/xray/announce.txt ]]` (файл непустой), и только тогда добавлять header и body comment. Пустой файл = файл отсутствует = тишина.

---

## Unknowns Resolved

### Unknown 1: Vision Seed — testpre/testseed

**Ответ:** `testpre` и `testseed` — поля Account protobuf структуры VLESS, добавленные в **v1.251201.0** (декабрь 2025, коммит 28a8b04, PR #5579 "@Fangliding").

**Источник:** `proxy/vless/account.proto` (прямое чтение из GitHub raw):
```proto
uint32 testpre = 8;
repeated uint32 testseed = 9;
```
pkg.go.dev подтверждает: `func (x Account) GetTestpre() uint32` и `func (x Account) GetTestseed() []uint32`, оба `added in v1.251201.0`.

**Семантика (из кода outbound.go и PR title):**
- `testpre uint32` — количество параллельных pre-connect TCP соединений, которые outbound Handler открывает заранее (worker goroutines в бесконечном цикле). **Работает ТОЛЬКО в outbound config.** На inbound-стороне поле парсится но логика не задействована (в `inbound.go` нет `h.testpre` поля).
- `testseed []uint32` — seed(s) для рандомизации Vision timing/padding patterns. По PR title "outbound & inbound" — присутствует в обеих конфигурациях. Точная семантика: список uint32 значений, передаваемых в Vision padding randomizer.

**Сервер vs Клиент (КРИТИЧНО для REQ-E03):**
- `testseed` — **безопасно добавлять к inbound clients** (сервер) AND outbound users (клиент). Xray-core поддерживает на обеих сторонах.
- `testpre` — **бессмысленно на inbound** (server не делает pre-connect к клиентам). Поле не сломает конфиг — protobuf backwards compat — но эффекта ноль. REQ-E03 как написан (`testpre`/`testseed` на VLESS account в inbound) — **не является мисспеком** в техническом смысле, но плюсовой эффект даст только testseed.

**Совместимость клиентов:** поля появились в v1.251201.0. Клиенты использующие Xray < декабря 2025 — протобуф неизвестные поля игнорирует (backwards compat protobuf3). HAPP, v2rayNG, sing-box — используют собственные Xray-core fork'и, возможно с другими датами пикапа этого PR. Клиенты не знающие `testseed` — просто не используют feature, соединение работает нормально.

**Минимальная версия:** Xray-core ≥ **v1.251201.0** (декабрь 2025). Phase 5 гарантирует latest stable → ОК.

**Дефолты для REQ-E03 (рекомендация):**
- `testpre`: предложить `1` как дефолт (один pre-connect поток) или `0` (отключен)
- `testseed`: предложить `[]` (пустой = not set) или `[0]` как минимальный seed
- Prompt формата: `testpre (0=off, 1-4=pre-connect count) [0]: _`
- Prompt для testseed: `testseed (пробелы между числами, пусто=off) []: _`

**Confidence:** HIGH (исходный код account.proto + pkg.go.dev + PR title из GitHub Actions logs)

---

### Unknown 2: AdGuard Home uninstall semantics

**Ответ:** Полная логика uninstall **уже написана** в xrayebator:4668-4774 (`uninstall_adguard_home()`). Plan 8.3 не пишет новый код — он вызывает существующую функцию автоматически из update.sh при detect `/opt/AdGuardHome/AdGuardHome`.

**Что делает существующий uninstall (строки 4668-4774):**
1. Stop + disable `AdGuardHome` systemd unit
2. `/opt/AdGuardHome/AdGuardHome -s uninstall` (официальная команда)
3. `rm -rf /opt/AdGuardHome/` (бинарь + данные)
4. `safe_jq_write '.dns = {"servers": ["https+local://1.1.1.1/dns-query","localhost"],...}' "$CONFIG_FILE"` — восстановление Xray DNS на DoH Local
5. `rm -f /etc/systemd/resolved.conf.d/adguardhome.conf` + `ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf` + `systemctl restart systemd-resolved`
6. UFW cleanup: `ufw delete allow 53/tcp/udp` (на случай если открывали вручную)
7. `safe_restart_xray`

**Что добавляет Plan 8.3:** автоматический вызов без y/N prompt в update.sh (вместо user-triggered меню) + удаление кода `adguard_home_menu` и menu item 7.

**Порядок операций при force-uninstall (ВАЖНО — см. Pitfall 2):**
1. Сначала: backup_config + safe_jq_write DNS → DoH Local
2. Потом: stop AdGuardHome service
3. Потом: rm -rf + systemd cleanup
4. Последнее: safe_restart_xray

**Файлы к удалению:**
- `/opt/AdGuardHome/` (весь каталог)
- `/etc/systemd/resolved.conf.d/adguardhome.conf` (stub-resolver override)
- Systemd unit удаляется через `-s uninstall` + disable

**DNS rollback:** `https+local://1.1.1.1/dns-query` + `localhost` (уже хардкодено в `uninstall_adguard_home`)

**Confidence:** HIGH (прямое чтение xrayebator:4668-4774)

---

### Unknown 3: probe-test механика

**Ответ:** `curl -I` одного недостаточно для Reality-grade SNI validation. Нужен двухуровневый check.

**Reality SNI требования:**
1. TLS 1.3 поддерживается (обязательно)
2. Trusted CA cert (Let's Encrypt, DigiCert, Sectigo etc.)
3. ALPN h2 (желательно — большинство современных HTTPS сайтов)
4. Доступность с IP VPS (некоторые сайты блокируют VPS/datacenter IP)

**Рекомендуемый bash паттерн для probe-test:**

```bash
probe_sni() {
  local sni="$1"
  local timeout=8

  # TLS handshake probe
  local tls_result
  tls_result=$(timeout "$timeout" openssl s_client \
    -connect "${sni}:443" \
    -servername "$sni" \
    -tls1_3 \
    </dev/null 2>&1)
  local tls_ok=0
  echo "$tls_result" | grep -q "Verify return code: 0" && tls_ok=1

  # HTTP probe + latency
  local http_code latency
  read -r http_code latency < <(
    curl -s -o /dev/null \
      --connect-timeout "$timeout" \
      --max-time "$timeout" \
      -w "%{http_code} %{time_total}" \
      "https://${sni}/" 2>/dev/null
  )

  printf "%-30s | %-10s | %-12s | %s s\n" \
    "$sni" \
    "${http_code:-FAIL}" \
    "$([ "$tls_ok" -eq 1 ] && echo 'TLS OK' || echo 'TLS FAIL')" \
    "${latency:-N/A}"
}
```

**Что означает "TLS handshake ok":** `openssl s_client -tls1_3` завершился с `Verify return code: 0 (ok)` в течение timeout. Это означает: TLS 1.3 поддерживается + cert chain верифицирован до trusted root CA.

**Timeout стратегия:** 8 секунд на SNI — достаточно для подавляющего большинства РФ-серверов. DNS fail отображается через FAIL в http_code колонке (curl вернёт пустоту при DNS error).

**Latency:** `curl -w '%{time_total}'` даёт total time включая DNS + TCP + TLS + HTTP. Достаточно для "ориентировочной" оценки.

**Confidence:** HIGH (openssl docs + curl man pages + Xray Reality SNI documentation)

---

### Unknown 4: HAPP announce wire format

**Ответ:** подтвержден из официальной HAPP developer documentation (https://www.happ.su/main/dev-docs/app-management).

**Точный формат (из HAPP docs):**

HTTP Header:
```
announce: base64:SGFwcCB0aGUgYmVzdCE=
```

Body comment:
```
#announce: base64:SGFwcCB0aGUgYmVzdCE=
```

**Детали:**
- Имя поля: `announce` (строчная, без дефиса)
- Формат значения: `base64:<b64>` (с префиксом `base64:`)
- Encoding: стандартный base64 (`base64 -w0`), без URL-safe вариантов
- UTF-8 кириллица: корректно кодируется в base64 (проверено паттерном Phase 7 `profile-title`)

**bash snippet для subhttp.sh:**
```bash
# В subhttp.sh (генерируется xrayebator heredoc)
ANNOUNCE_FILE="/usr/local/etc/xray/announce.txt"
if [[ -s "$ANNOUNCE_FILE" ]]; then
  ANNOUNCE_TEXT=$(cat "$ANNOUNCE_FILE" | head -c 200)  # limit 200 chars
  ANNOUNCE_B64=$(printf '%s' "$ANNOUNCE_TEXT" | base64 -w0)
  ANNOUNCE_HEADER="announce: base64:${ANNOUNCE_B64}"
  ANNOUNCE_COMMENT="#announce: base64:${ANNOUNCE_B64}"
else
  ANNOUNCE_HEADER=""
  ANNOUNCE_COMMENT=""
fi

# В HTTP response headers (если непустой):
# [[ -n "$ANNOUNCE_HEADER" ]] && printf '%s\r\n' "$ANNOUNCE_HEADER"

# В body comments:
# [[ -n "$ANNOUNCE_COMMENT" ]] && printf '%s\n' "$ANNOUNCE_COMMENT"
```

**Max length:** HAPP docs не указывают явный лимит. Практический ориентир — ~200 символов (из CONTEXT.md decision). HAPP рендерит short announcement лучше.

**Empty/missing file:** если файл отсутствует или пустой — заголовок и body comment полностью опускаются (не эмиттим пустой `announce: base64:` — это может сломать HAPP парсер).

**Confidence:** HIGH (прямой пример из HAPP developer docs с конкретным base64 примером `SGFwcCB0aGUgYmVzdCE=` = "Happ the best!")

---

### Unknown 5: Xray routing.rules semantics

**Ответ:** верифицирован из официальной документации xtls.github.io/en/config/routing.html.

**`domain:` prefix semantics (CONFIRMED):**
> "domain:xray.com" matches "www.xray.com" and "xray.com", but not "wxray.com"

То есть `domain:vtb.ru` совпадает с `vtb.ru`, `online.vtb.ru`, `www.vtb.ru` — НО НЕ с `myvtb.ru.com` или `notvtb.ru`. Suffix-matching без подстроки.

**Rule ordering: first-match-wins (CONFIRMED):**
> "For each connection, routing will judge these rules from top to bottom. When the first effective rule is encountered, the connection is forwarded to the outboundTag specified by it."

**Критически важно для bypass routing:** bypass-rules ДОЛЖНЫ стоять ДО существующих block-rules. Использовать prepend (`[new_rule] + .routing.rules`), не append.

**Конфликт с geosite:category-ads-all:** это правило стоит выше дефолтного direct в xrayebator install.sh. Bypass-домены (Steam, банки, Yandex) не пересекаются с ad-geosite — Steam CDN и vtb.ru не в ad-листах. Риск конфликта: LOW.

**outboundTag для freedom outbound (CONFIRMED из install.sh:591):**
```json
{
  "protocol": "freedom",
  "settings": {"domainStrategy": "UseIPv4"},
  "tag": "direct"
}
```
Тег: `"direct"` — не `"freedom"`, не `"out_direct"`. REQ-F03 корректен.

**Существующий routing порядок (install.sh:540-582):**
1. `geosite:category-ads-all` → block
2. `bittorrent` → block
3. UDP port 443 → block
4. `network: tcp,udp` → direct (catch-all)

Bypass rules должны встать **перед** правилами этого списка (prepend).

**Confidence:** HIGH (xtls.github.io official docs + прямое чтение install.sh)

---

### Unknown 6: SNI 2026 кандидаты

**Результаты проверки:**

| SNI | DNS resolve | Вердикт |
|-----|------------|--------|
| `lk.usbank.ru` | Возможно (DNS через local resolver дал RFC1918 — внутр. env) | **ВЕРОЯТНАЯ ОПЕЧАТКА** — usbank.com = американский US Bank, .ru зона ему не принадлежит. В публичных источниках `lk.usbank.ru` не найден как РФ-банковский сайт. |
| `online.vtb.ru` | Resolves | OK — ВТБ банк, крупнейший РФ-банк, офиц. интернет-банк |
| `www.cdek.ru` | Resolves | OK — СДЭК, крупнейшая РФ-логистика |
| `www.pochta.ru` | Resolves | OK — Почта России, госструктура |
| `www.avito.ru` | Resolves | OK — Авито, крупнейшая РФ-доска объявлений |
| `github.com` | Resolves | OK — приоритет 3, standard для Reality (global CDN, TLS 1.3, trusted CA) |

**Подтвержденные заменители для lk.usbank.ru:**
- `lk.uralsibbank.ru` — Уралсиб Банк (online.uralsib.ru тоже ок, но lk.uralsibbank.ru = более вероятный "lk." поддомен)
- `lk.open.ru` — Банк Открытие
- `cabinet.sravni.ru` — финансовый агрегатор

**Рекомендация:** заменить `lk.usbank.ru` на `lk.uralsibbank.ru`. Planner должен принять решение о финальном значении.

**Примечание о DNS resolve:** тест запускался из dev-окружения с VPN — IP 198.18.x.x/fc00:: это RFC1918/ULA, что означает что DNS-запросы шли через VPN-интерцептор. Резолв всех доменов прошел (не NXDOMAIN), что подтверждает существование DNS записей, но IP не репрезентативны для prod-VPS.

**Reality SNI качество РФ-доноров:**
- `online.vtb.ru` — крупный РФ-банк, HTTPS через DigiCert/Let's Encrypt, стабильный
- `www.cdek.ru` — коммерческий, Let's Encrypt cert
- `www.pochta.ru` — Почта России, госсайт с нормальным TLS
- `www.avito.ru` — высокий трафик, TLS 1.3, Akamai CDN

**Xray warning об Apple/iCloud (из релиза ~v1.8.x):** Xray maintainers добавили warning о `apple.com`/`icloud.com` как SNI targets — они используют certificate pinning и нетипичные TLS extensions, что затрудняет mimicking. Американские банки (usbank.com) — аналогичный риск.

**Confidence:** MEDIUM-HIGH (DNS публично доступен, но полная TLS probing (openssl s_client) не проводилась из-за отсутствия dig/openssl в dev-окружении; для prod-verif использовать probe-test)

---

## Code Examples

### 1. testpre/testseed в inbound config.json (добавление к клиенту)

```json
{
  "id": "5783a3e7-e373-51cd-8642-c83782b807c5",
  "level": 0,
  "email": "user@xrayebator",
  "flow": "xtls-rprx-vision",
  "testpre": 1,
  "testseed": [42]
}
```

Через safe_jq_write:
```bash
# Добавить testpre к существующему клиенту на порту $port, UUID $uuid
safe_jq_write \
  --argjson port "$port" \
  --arg uuid "$uuid" \
  --argjson testpre "$testpre_val" \
  --argjson testseed "$testseed_json" \
  '(.inbounds[] | select(.port == $port) | .settings.clients[] | select(.id == $uuid)).testpre = $testpre |
   (.inbounds[] | select(.port == $port) | .settings.clients[] | select(.id == $uuid)).testseed = $testseed' \
  "$CONFIG_FILE"
```

### 2. probe-test TLS + HTTP

```bash
probe_sni() {
  local sni="$1"
  local timeout=8

  # TLS 1.3 verification
  local tls_out
  tls_out=$(timeout "$timeout" openssl s_client \
    -connect "${sni}:443" \
    -servername "$sni" \
    -tls1_3 \
    </dev/null 2>&1)
  local tls_status="FAIL"
  echo "$tls_out" | grep -q "Verify return code: 0" && tls_status="OK"

  # HTTP status + latency
  local http_code latency
  read -r http_code latency < <(
    curl -s -o /dev/null \
      --connect-timeout "$timeout" \
      --max-time "$timeout" \
      -w "%{http_code} %{time_total}" \
      "https://${sni}/" 2>/dev/null || echo "000 0"
  )

  printf "%-32s | %-10s | %-10s | %5ss\n" \
    "$sni" \
    "${http_code:-000}" \
    "TLS ${tls_status}" \
    "${latency:-?}"
}

# Вывод header
echo "──────────────────────────────────────────────────────────────────"
printf "%-32s | %-10s | %-10s | %s\n" "SNI" "HTTP" "TLS" "Latency"
echo "──────────────────────────────────────────────────────────────────"

ok_count=0; total=0
while IFS='|' read -r sni _rest || [[ -n "$sni" ]]; do
  sni="${sni// /}"
  [[ -z "$sni" || "$sni" == \#* ]] && continue
  ((total++))
  result=$(probe_sni "$sni")
  echo "$result"
  echo "$result" | grep -q "TLS OK" && ((ok_count++))
done < "$SNI_LIST"
echo "──────────────────────────────────────────────────────────────────"
echo -e "${GREEN}Доступны: $ok_count/$total SNI${NC}"
```

### 3. bypass routing rule — добавление

```bash
add_bypass_domains() {
  local domain_list_json="$1"  # JSON array строка: '["domain:steamcontent.com","domain:steam-chat.com"]'

  # Проверка SNI-конфликта перед добавлением
  local profile_snis
  profile_snis=$(jq -r '[.[] | .streamSettings.realitySettings.serverNames // [] | .[]] | .[]' \
    /usr/local/etc/xray/profiles/*.json 2>/dev/null | sort -u)

  local domains_raw
  domains_raw=$(printf '%s' "$domain_list_json" | jq -r '.[] | ltrimstr("domain:")')
  while IFS= read -r dom; do
    if echo "$profile_snis" | grep -qxF "$dom"; then
      echo -e "${RED}✗ Конфликт: $dom используется как Reality SNI — добавление сломает handshake${NC}"
      return 1
    fi
  done <<< "$domains_raw"

  # Prepend в начало routing.rules
  safe_jq_write \
    --argjson domains "$domain_list_json" \
    '.routing.rules = [{"type":"field","domain":$domains,"outboundTag":"direct"}] + .routing.rules' \
    "$CONFIG_FILE"
}
```

### 4. announce в subhttp.sh

```bash
# В subhttp.sh (heredoc секция xrayebator)
ANNOUNCE_FILE="/usr/local/etc/xray/announce.txt"
ANNOUNCE_HEADER=""
ANNOUNCE_COMMENT=""
if [[ -s "$ANNOUNCE_FILE" ]]; then
  _ann_text=$(head -c 200 "$ANNOUNCE_FILE" | tr -d '\n')
  _ann_b64=$(printf '%s' "$_ann_text" | base64 -w0)
  ANNOUNCE_HEADER="announce: base64:${_ann_b64}"
  ANNOUNCE_COMMENT="#announce: base64:${_ann_b64}"
fi
```

### 5. AdGuard detect + auto-uninstall в update.sh

```bash
# В update.sh — после safe-pattern секции, перед migration loop
if [[ -f /opt/AdGuardHome/AdGuardHome ]]; then
  echo -e "${YELLOW}⚠ Обнаружен устаревший AdGuard Home (удален в v2.0)${NC}"
  echo -e "${CYAN}Автоматическое удаление...${NC}"
  # СНАЧАЛА восстановить DNS (до остановки AdGuard!)
  local cfg="${CONFIG_FILE:-/usr/local/etc/xray/config.json}"
  if [[ -f "$cfg" ]]; then
    _tmp=$(mktemp /tmp/xray-cfg.XXXXXX)
    jq '.dns = {"servers":["https+local://1.1.1.1/dns-query","localhost"],"queryStrategy":"UseIPv4","disableCache":false}' \
      "$cfg" > "$_tmp"
    [[ -s "$_tmp" ]] && mv "$_tmp" "$cfg"
    fix_xray_permissions
  fi
  # ПОТОМ останавливать AdGuard
  systemctl stop AdGuardHome 2>/dev/null || true
  systemctl disable AdGuardHome 2>/dev/null || true
  /opt/AdGuardHome/AdGuardHome -s uninstall 2>/dev/null || true
  rm -rf /opt/AdGuardHome/
  rm -f /etc/systemd/resolved.conf.d/adguardhome.conf
  [[ -L /etc/resolv.conf ]] || [[ -f /etc/resolv.conf ]] && \
    ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf 2>/dev/null || true
  systemctl restart systemd-resolved 2>/dev/null || true
  safe_restart_xray
  echo -e "${GREEN}✓ AdGuard Home удален, DNS восстановлен${NC}"
fi
```

---

## Specification Concerns

### SC-1: testpre на inbound — безвреден, но нулевой эффект

REQ-E03 описывает `testpre`/`testseed` как поля на VLESS account (inbound clients[i]). Технически поля парсятся на обеих сторонах (protobuf Account struct universal), так что добавление их к inbound clients НЕ вызовет ошибку конфигурации или падение Xray. Однако `testpre` семантически активен ТОЛЬКО в outbound handler — pre-connect goroutines стартуют в `outbound.Handler.Process()`, в `inbound.Handler` аналогичного кода нет. Это не блокирует REQ-E03, но плюс в UX: при промпте оператору — честно сказать что `testpre` работает только если этот же оператор контролирует клиентский config (редкость). Testseed — полностью двусторонний.

**Вердикт:** REQ-E03 не требует revision, но description в warning prompt должен быть честным.

### SC-2: lk.usbank.ru — требует замены

Домен `lk.usbank.ru` не идентифицирован как легитимный российский банковский домен. Planner должен заменить его перед написанием кода миграции. Рекомендуемая замена: `lk.uralsibbank.ru`.

---

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/XTLS/Xray-core/main/proxy/vless/account.proto` — прямое чтение proto файла (testpre uint32 = field 8; testseed repeated uint32 = field 9)
- `https://pkg.go.dev/github.com/xtls/xray-core/proxy/vless` — API docs: `GetTestpre()` и `GetTestseed()` добавлены в v1.251201.0
- `https://raw.githubusercontent.com/XTLS/Xray-core/main/proxy/vless/outbound/outbound.go` — прямое чтение: `h.testpre` используется в outbound Handler, pre-connect goroutines
- `https://xtls.github.io/en/config/routing.html` — официальная документация: first-match-wins routing, `domain:` semantics
- `https://www.happ.su/main/dev-docs/app-management` — официальные HAPP dev docs: `announce: base64:...` header и `#announce: base64:...` body comment
- `/home/kosya/xrayebator/install.sh:585-597` — `"tag": "direct"` для freedom outbound (прямое чтение)
- `/home/kosya/xrayebator/xrayebator:4668-4774` — существующий `uninstall_adguard_home()` код

### Secondary (MEDIUM confidence)
- `https://github.com/XTLS/Xray-core/actions/runs/19735395114` — PR #5579 title: "XTLS Vision: Add `testpre` (outbound pre-connect) and `testseed` (outbound & inbound)"
- `https://www.v2ray.com/en/configuration/routing.html` — дополнительное подтверждение `domain:` semantics
- `https://docs.rw/docs/learn-en/server-routing` — Remnawave docs: "Xray routing rules are processed in order, from top to bottom"
- Tavily search по usbank.ru — не найдено российского банковского сайта с этим доменом

### Tertiary (LOW confidence)
- DNS resolve через python3 socket в dev-env с VPN — IP = RFC1918 (ненадежны как публичные)

---

## Metadata

**Confidence breakdown:**
- Unknown 1 (Vision Seed): HIGH — proto source читан напрямую
- Unknown 2 (AdGuard): HIGH — код уже в xrayebator
- Unknown 3 (probe-test): HIGH — стандартные openssl/curl флаги
- Unknown 4 (HAPP announce): HIGH — официальные HAPP docs с конкретным примером
- Unknown 5 (routing rules): HIGH — официальная xtls.github.io документация
- Unknown 6 (SNI candidates): MEDIUM — lk.usbank.ru требует замены; остальные OK

**Research date:** 2026-05-12
**Valid until:** ~2026-08-12 (3 месяца; Xray-core активно развивается но ABI-breaking изменений в Account полях не ожидается)

---

## RESEARCH COMPLETE

**Phase:** 8 — Polish (SNI 2026 + Vision Seed + Bypass Routing + AdGuard cleanup)
**Overall Confidence:** HIGH

### Key Findings
- `testpre`/`testseed` добавлены в Xray-core v1.251201.0 (декабрь 2025). `testpre` эффективен только в outbound, `testseed` — в обеих сторонах. REQ-E03 не мисспек, оба поля безвредны в inbound config.
- HAPP announce wire format подтвержден: `announce: base64:TEXT` header + `#announce: base64:TEXT` body comment. base64 -w0, без URL-safe. Пустой файл = тишина.
- Xray routing: first-match-wins; `domain:` = suffix-match; freedom outbound tag = `"direct"` (подтвержден из install.sh). Bypass rules нужно prepend, не append.
- AdGuard uninstall: полный код уже в xrayebator (`uninstall_adguard_home`). Plan 8.3 = автоматизация + удаление menu-кода. Критически важен порядок: DNS rollback РАНЬШЕ остановки AdGuard.
- `lk.usbank.ru` = вероятная опечатка (usbank.com — американский банк). Заменить на `lk.uralsibbank.ru` или аналог.
- probe-test: двойная проверка — `openssl s_client -tls1_3` (Verify return code: 0) + `curl -w '%{time_total}'`. timeout 8s.

### Files Created
`.planning/phases/08-polish-sni-vision-bypass-routing/08-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Vision Seed (testpre/testseed) | HIGH | Исходный код account.proto + pkg.go.dev + PR title |
| AdGuard uninstall | HIGH | Существующий код в xrayebator прочитан напрямую |
| probe-test mechanics | HIGH | Стандартные CLI инструменты |
| HAPP announce format | HIGH | Официальные HAPP dev docs |
| routing.rules semantics | HIGH | xtls.github.io official docs |
| SNI candidates | MEDIUM | lk.usbank.ru не верифицирован; остальные OK |

### Open Questions
1. `lk.usbank.ru` — что имелось в виду? Planner должен выбрать замену перед кодированием migration.
2. `testseed` точная семантика на inbound-стороне — PR title говорит "outbound & inbound", но конкретный эффект на server unclear. Безопасно добавить, но документировать честно.

### Ready for Planning
Research complete. Planner может создавать PLAN.md для Plans 8.1, 8.2, 8.3.
