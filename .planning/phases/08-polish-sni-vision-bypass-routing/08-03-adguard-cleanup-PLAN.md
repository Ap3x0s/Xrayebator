---
phase: 08-polish-sni-vision-bypass-routing
plan: 03
type: execute
wave: 3
depends_on:
  - "08-02"
files_modified:
  - update.sh
  - xrayebator
  - CLAUDE.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "При запуске `sudo xrayebator update` с установленным AdGuard Home (/opt/AdGuardHome/ существует) — auto-uninstall AdGuard БЕЗ y/N prompt, с предупреждающим сообщением о deprecation"
    - "Auto-uninstall выполняется в правильном порядке: СНАЧАЛА Xray DNS rollback на дефолт (1.1.1.1/8.8.8.8 или DoH Local), ПОТОМ systemctl stop AdGuardHome, ПОТОМ rm -rf /opt/AdGuardHome/ + systemd cleanup"
    - "AdGuard cleanup инкапсулирован в bash-функцию `_adguard_force_uninstall_if_present` в update.sh — это исключает невалидный 'local' на top-level scope (runtime error)"
    - "В главном меню xrayebator пункт 7 'AdGuard Home (блокировка рекламы)' удален; функция adguard_home_menu удалена из кода"
    - "Функция uninstall_adguard_home сохранена в xrayebator (используется auto-uninstall в update.sh через source-инг или дублирование логики)"
    - "После uninstall — xray работает (safe_restart_xray), DNS resolves правильно, /opt/AdGuardHome/ не существует"
    - "CLAUDE.md обновлен: секция 'Add-on services' про AdGuard удалена (или помечена deprecated)"
  artifacts:
    - path: "update.sh"
      provides: "AdGuard force-uninstall function `_adguard_force_uninstall_if_present` + ее вызов перед DNS migration"
      contains: "_adguard_force_uninstall_if_present"
    - path: "xrayebator"
      provides: "main_menu без AdGuard пункта 7, adguard_home_menu и adguard_status удалены, uninstall_adguard_home сохранена"
      contains: "uninstall_adguard_home"
    - path: "CLAUDE.md"
      provides: "Без секции Add-on services (AdGuard) — или помечена deprecated"
  key_links:
    - from: "update.sh top-level execution flow"
      to: "_adguard_force_uninstall_if_present (определена в update.sh)"
      via: "вызов функции перед DNS migration"
      pattern: "_adguard_force_uninstall_if_present"
    - from: "_adguard_force_uninstall_if_present"
      to: "/opt/AdGuardHome/AdGuardHome detect → DNS rollback → stop + rm -rf"
      via: "функция содержит весь cleanup-flow с локальными переменными"
      pattern: "Обнаружен устаревший AdGuard Home"
    - from: "xrayebator main_menu choice 7"
      to: "(удален)"
      via: "удаление display string + case-ветки"
      pattern: "^      7\\)"
    - from: "xrayebator code"
      to: "adguard_home_menu (удалено) / adguard_status (удалено)"
      via: "удаление функций; uninstall_adguard_home сохраняется"
      pattern: "adguard_home_menu\\(\\)"
---

<objective>
Plan 8.3 — отдельный плановый юнит для AdGuard Home cleanup (deferred from Phase 5 решение). Реализует force-uninstall AdGuard при `sudo xrayebator update` с правильным порядком операций (DNS rollback ДО stop AdGuard — critical из RESEARCH §Pitfall 2), удаляет AdGuard-связанный код из главного меню xrayebator, обновляет CLAUDE.md.

Note (requirements field): этот plan — pure deferred cleanup, не покрывает ни один REQ-* из REQUIREMENTS.md (REQ-E04 = HAPP announce, полностью закрыт Plan 8.1). Поэтому `requirements: []`.

Sequential dependency (depends_on=["08-02"]): Plan 8.3 модифицирует `xrayebator` в overlapping секциях с Plan 8.2 (main_menu items — Plan 8.2 добавляет 11, Plan 8.3 удаляет 7). Параллельная запись в один файл двумя subagent'ами создает race condition. Поэтому Plan 8.3 запускается ТОЛЬКО после Plan 8.2.

Purpose: AdGuard Home был экспериментальной фичей в v1.0 (косячный, дырявый в прошлых релизах). Принято решение deprecate. Юзеры, активно использующие AdGuard, должны мигрировать на DoH Local (Xray встроенный DNS).

Output:
- update.sh: новая функция `_adguard_force_uninstall_if_present` + ее вызов перед DNS migration. Без y/N prompt. С warning message.
- xrayebator: удалены пункт 7 из main_menu, функции adguard_home_menu, adguard_status, install_adguard_home (если есть), adguard_status_menu. Функция uninstall_adguard_home СОХРАНЯЕТСЯ.
- CLAUDE.md: секция "Add-on services" про AdGuard удалена или помечена deprecated.

Risk acceptance: Юзеры, активно использующие AdGuard как локальный DNS-фильтр, потеряют эту функциональность после update. Принято в CONTEXT.md.
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
@.planning/phases/08-polish-sni-vision-bypass-routing/08-CONTEXT.md
@.planning/phases/08-polish-sni-vision-bypass-routing/08-RESEARCH.md
@.planning/phases/08-polish-sni-vision-bypass-routing/08-02-SUMMARY.md

# RESEARCH §Unknown 2 — существующий uninstall_adguard_home (xrayebator:4669-4774) — структура и DNS rollback
# RESEARCH §Pitfall 2 — порядок: DNS rollback ДО stop AdGuard (иначе black-hole window)
# RESEARCH §Code Examples 5 — паттерн detect + auto-uninstall в update.sh
# Phase 4 — safe-pattern в update.sh (mktemp + xray run -test + grep "Configuration OK")
# Plan 8.2 SUMMARY — состояние xrayebator после добавления пункта 11 (bypass routing)
@xrayebator
@update.sh
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: update.sh — функция _adguard_force_uninstall_if_present + вызов перед DNS migration</name>
  <files>update.sh</files>
  <action>
**A. Найти место для определения функции и место вызова:**

В `update.sh` блок должен идти ПОСЛЕ загрузки файлов (xrayebator/sni_list/geo) и ПЕРЕД секцией "МИГРАЦИЯ DNS (AdGuard для блокировки рекламы)" (которая начинается на update.sh:588 — `═══ МИГРАЦИЯ DNS (AdGuard для блокировки рекламы) ═══`).

**ВАЖНОЕ ИЗМЕНЕНИЕ:** заголовок секции "МИГРАЦИЯ DNS (AdGuard...)" вводит в заблуждение — на самом деле он мигрирует на DoH Local (а НЕ на AdGuard). Эту секцию НЕ ТРОГАЕМ — она безопасно skipает изменения если DNS уже 127.0.0.1. После auto-uninstall наш блок гарантирует, что DNS будет 1.1.1.1 (DoH Local), так что миграция не сделает повторного изменения.

**B. КРИТИЧЕСКОЕ ОБОСНОВАНИЕ wrapping-в-функцию (fix к revision):**

Если код cleanup-блока (с `local cfg=...`, `local _tmp=...`) разместить inline в top-level update.sh (вне функции), bash runtime выдаст ошибку:
```
local: can only be used in a function
```
ВАЖНО: `bash -n update.sh` НЕ ловит эту ошибку (syntax check не валидирует scope для `local`). Это runtime-error, которая сломает `sudo xrayebator update` при первом запуске.

Решение: **обернуть весь cleanup-блок в именованную bash-функцию**, определенную в update.sh, и вызвать ее ОДИН раз. Внутри функции `local` валиден.

**C. Структура: ДВЕ части в update.sh:**

**Часть 1: ОПРЕДЕЛЕНИЕ функции** — поместить после загрузки файлов (xrayebator/sni_list/geo), но ПЕРЕД секцией update_xray_core (до строки 586). Можно положить в начале update.sh после строк цветов/констант, чтобы держать все function-definitions сверху файла. Конкретное место: после блока определения цветов и констант (~update.sh:30-50, перед началом main flow).

**Часть 2: ВЫЗОВ функции** — поместить ПОСЛЕ строки 586 («КОНЕЦ блока определений update_xray_core»), ПЕРЕД строкой 588 (`═══ МИГРАЦИЯ DNS ═══`):

```bash
# Force-uninstall AdGuard Home (deprecated в v2.0) — должен выполниться ПЕРЕД DNS migration
_adguard_force_uninstall_if_present
```

**D. Определение функции (Часть 1):**

```bash
# ═══════════════════════════════════════════════════════════
# ADGUARD HOME CLEANUP (deprecated в v2.0 — Plan 8.3)
# ═══════════════════════════════════════════════════════════
# AdGuard Home убирается как deprecated (в прошлых релизах были баги в DNS-фильтрах).
# CRITICAL ORDERING: DNS rollback ДО stop AdGuard — иначе DNS black-hole window
# между systemctl stop и DNS-rollback (RESEARCH §Pitfall 2).
#
# Wrapped в функцию из-за `local` — нельзя использовать `local` на top-level update.sh
# (bash runtime error: "local: can only be used in a function").
_adguard_force_uninstall_if_present() {
  if [[ ! -f /opt/AdGuardHome/AdGuardHome ]]; then
    return 0  # Idempotent: skip если AdGuard не установлен
  fi

  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}Обнаружен устаревший AdGuard Home${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}AdGuard Home убирается как deprecated (в прошлых релизах${NC}"
  echo -e "${CYAN}были баги в DNS-фильтрах). Автоматическое удаление...${NC}"
  echo ""

  # Шаг 1 (КРИТИЧНО ПЕРВЫМ): восстановить Xray DNS до остановки AdGuard,
  # иначе Xray будет пытаться резолвить через 127.0.0.1 которое уже мертво.
  local cfg="${CONFIG_FILE:-/usr/local/etc/xray/config.json}"
  if [[ -f "$cfg" ]]; then
    echo -e "${CYAN}Шаг 1/5: Восстановление Xray DNS (до остановки AdGuard)...${NC}"
    local _tmp
    _tmp=$(mktemp /tmp/xray-cfg.XXXXXX) || {
      echo -e "${RED}  mktemp failed — DNS rollback пропущен${NC}"
      _tmp=""
    }
    if [[ -n "$_tmp" ]] && jq '.dns = {
      "servers": [
        "https+local://1.1.1.1/dns-query",
        "localhost"
      ],
      "queryStrategy": "UseIPv4",
      "disableCache": false
    }' "$cfg" > "$_tmp" 2>/dev/null \
       && [[ -s "$_tmp" ]] \
       && xray run -test -config "$_tmp" 2>&1 | grep -q "^Configuration OK\\.$"; then
      mv "$_tmp" "$cfg"
      chmod 644 "$cfg"
      chown xray:xray "$cfg" 2>/dev/null || true
      echo -e "${GREEN}  DNS rollback -> DoH Local (1.1.1.1)${NC}"
    else
      rm -f "$_tmp"
      echo -e "${YELLOW}  DNS rollback пропущен (validation failed)${NC}"
    fi
  fi

  # Шаг 2: остановить AdGuard
  echo -e "${CYAN}Шаг 2/5: Остановка AdGuard Home...${NC}"
  systemctl stop AdGuardHome 2>/dev/null || true
  systemctl disable AdGuardHome 2>/dev/null || true
  /opt/AdGuardHome/AdGuardHome -s uninstall 2>/dev/null || true
  echo -e "${GREEN}  Служба остановлена${NC}"

  # Шаг 3: rm файлы
  echo -e "${CYAN}Шаг 3/5: Удаление файлов /opt/AdGuardHome/...${NC}"
  rm -rf /opt/AdGuardHome/
  rm -f /etc/systemd/resolved.conf.d/adguardhome.conf
  echo -e "${GREEN}  Файлы удалены${NC}"

  # Шаг 4: восстановление systemd-resolved
  echo -e "${CYAN}Шаг 4/5: Восстановление systemd-resolved...${NC}"
  if [[ -L /etc/resolv.conf ]] || [[ -f /etc/resolv.conf ]]; then
    ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf 2>/dev/null || true
  fi
  systemctl restart systemd-resolved 2>/dev/null || true
  echo -e "${GREEN}  systemd-resolved перезапущен${NC}"

  # Шаг 5: UFW cleanup (если порт 53 был открыт вручную для AdGuard)
  echo -e "${CYAN}Шаг 5/5: UFW cleanup (порт 53)...${NC}"
  if command -v ufw &>/dev/null; then
    ufw delete allow 53/tcp >/dev/null 2>&1
    ufw delete allow 53/udp >/dev/null 2>&1
    ufw delete allow 3000/tcp >/dev/null 2>&1
    ufw reload >/dev/null 2>&1
  fi
  echo -e "${GREEN}  UFW проверен${NC}"

  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  AdGuard Home удален. Xray DNS -> DoH Local (1.1.1.1)    ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""

  # Restart Xray в конце, чтобы он подхватил новый DNS
  # (safe_restart_xray недоступна в update.sh — используем тот же паттерн
  # validate-then-restart как в update.sh:668-712)
  if systemctl is-active --quiet xray; then
    if xray run -test -config "$cfg" 2>&1 | grep -q "^Configuration OK\\.$"; then
      systemctl restart xray
      echo -e "${GREEN}Xray перезапущен с новым DNS${NC}"
    else
      echo -e "${YELLOW}Xray DNS validation failed — restart пропущен${NC}"
    fi
  fi
  echo ""
}
```

**КРИТИЧЕСКИЕ моменты:**

1. **Wrapping в функцию:** Решает проблему `local: can only be used in a function`. Также облегчает unit-тест функции в изоляции (вызвать с моком файла /opt/AdGuardHome/AdGuardHome).

2. **Order:** DNS rollback (Шаг 1) — ПЕРВЫМ, ДО `systemctl stop AdGuardHome` (Шаг 2). Это критично — см. RESEARCH §Pitfall 2. Если перевернуть порядок, Xray резолвит через 127.0.0.1 (AdGuard порт) который уже не слушает → все DNS-запросы fail → весь VPN падает.

3. **No y/N prompt:** force — соответствует CONTEXT.md decision «Force uninstall при xrayebator update».

4. **No safe_jq_write / safe_restart_xray:** эти функции живут в xrayebator, недоступны в update.sh. Используем тот же inline pattern что и в существующем update.sh:613-630 (mktemp + jq + xray run -test grep + mv + chmod).

5. **Idempotency:** если `/opt/AdGuardHome/AdGuardHome` не существует — `return 0` на старте функции. Следующий запуск update.sh не сделает ничего лишнего.

**Russian/style:** Все user-facing строки на русском, без буквы «е с двумя точками». Цвета: YELLOW для warning header, CYAN для шагов, GREEN для success, RED для critical errors.
  </action>
  <verify>
- `bash -n update.sh` проходит.
- `grep -c "_adguard_force_uninstall_if_present()" update.sh` == 1 (определение функции).
- `grep -c "_adguard_force_uninstall_if_present$" update.sh` ≥ 1 (вызов функции).
- `grep -c "Обнаружен устаревший AdGuard Home" update.sh` == 1.
- `grep -c "DNS rollback" update.sh` ≥ 1 (комментарии + код).
- `grep -c "/opt/AdGuardHome/AdGuardHome" update.sh` ≥ 1.
- `grep -c "^local " update.sh` == 0 (НЕТ local на top-level scope — все local внутри функции).
- Order verification: строка `Шаг 1/5: Восстановление Xray DNS` ВЫШЕ строки `Шаг 2/5: Остановка AdGuard Home`:
  ```bash
  awk '/Шаг 1\/5: Восстановление Xray DNS/{a=NR} /Шаг 2\/5: Остановка AdGuard Home/{b=NR; if (a < b) print "ORDER_OK"; else print "ORDER_WRONG"}' update.sh
  ```
- Runtime smoke (на VPS БЕЗ AdGuard): `sudo bash update.sh` → функция вызывается, return 0 на старте (skip), не выдает ошибки про `local`.
- Manual smoke (на VPS с установленным AdGuard):
  - `bash update.sh main` (или интерактивный запуск) → функция отрабатывает в нужном порядке: сначала сообщение «DNS rollback», потом «Остановка AdGuard», потом удаление файлов.
  - После завершения: `[[ ! -f /opt/AdGuardHome/AdGuardHome ]]` == true. `jq '.dns.servers[0]' /usr/local/etc/xray/config.json` == `"https+local://1.1.1.1/dns-query"`.
  - `systemctl status AdGuardHome` → не существует/disabled.
  - `systemctl status xray` → active.
  - Тестовый клиент подключается успешно.
  </verify>
  <done>
- update.sh содержит функцию `_adguard_force_uninstall_if_present` с CRITICAL ORDERING (DNS rollback Шаг 1 → AdGuard stop Шаг 2 → rm Шаг 3 → systemd-resolved Шаг 4 → UFW Шаг 5).
- Функция вызывается один раз ПЕРЕД секцией DNS migration.
- Wrapping в функцию решает runtime error `local: can only be used in a function` (который bash -n не ловит).
- Функция force (без y/N), показывает explain message «AdGuard Home убирается как deprecated (в прошлых релизах были баги в DNS-фильтрах)».
- Idempotency: функция возвращает 0 если AdGuard не установлен.
- bash -n update.sh проходит.
  </done>
</task>

<task type="auto">
  <name>Task 2: xrayebator — удалить menu пункт 7 + adguard_home_menu/adguard_status</name>
  <files>xrayebator</files>
  <action>
**A. Найти все упоминания AdGuard в xrayebator:**

```bash
grep -n "adguard\|AdGuard" /home/kosya/xrayebator/xrayebator
```

Ожидаемые места (по grep из STATE):
- xrayebator:2481 — display string «AdGuard Home (блокировка рекламы)»
- xrayebator:2501 — case ветка `7) adguard_home_menu ;;`
- xrayebator:4271-... — функция `adguard_home_menu()`
- xrayebator:4301 — внутренний вызов `uninstall_adguard_home`
- xrayebator:4669-4774 — функция `uninstall_adguard_home()` — **СОХРАНЯЕТСЯ**
- xrayebator:4777-... — функция `adguard_status()`
- Возможно также: `install_adguard_home`, `manage_adguard_home`, другие adguard_* функции — найти через grep.

**B. Удалить:**

1. **Display string в main_menu (xrayebator:2480-2481):**
   ```
   echo -e "${MAGENTA} ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ:${NC}"
   echo -e "${CYAN} 7)${NC} AdGuard Home (блокировка рекламы)"
   echo ""
   ```
   Также убрать вертикальный отступ если он был после AdGuard и не нужен. Если секция «ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ» содержит ТОЛЬКО AdGuard — удалить и заголовок секции тоже. Если в результате какие-то цифры из меню теперь рядом — НЕ перенумеровывать (юзеры могли запомнить); оставить дыру в пункте 7.

2. **Case-ветка (xrayebator:2501):**
   ```
   7) adguard_home_menu ;;
   ```
   Удалить эту строку. Случай выбора 7 теперь попадет в `*) echo "Неверный выбор"`, что приемлемо для удаленной фичи.

3. **Функции для удаления полностью:**
   - `adguard_home_menu()` (xrayebator:4271-...). Найти границы через `awk '/^adguard_home_menu\(\) {/,/^}$/'`. Удалить весь блок целиком.
   - `adguard_status()` (после adguard_home_menu — найти границы).
   - Если есть `install_adguard_home`, `configure_adguard`, `adguard_*` любые другие — удалить (КРОМЕ uninstall_adguard_home).

4. **СОХРАНИТЬ `uninstall_adguard_home()` (xrayebator:4669-4774):**
   Эта функция остается в xrayebator. Она используется в существующем коде (от xrayebator:4301 — внутренний вызов в adguard_home_menu — но adguard_home_menu удаляется! Так что внутренний вызов исчезает).

   После удаления adguard_home_menu, uninstall_adguard_home становится «orphan» — никто ее не вызывает из xrayebator. Это нормально:
   - update.sh имеет свою функцию `_adguard_force_uninstall_if_present` (Task 1) — не зависит от uninstall_adguard_home.
   - Функция остается в xrayebator на случай, если юзер захочет вызвать ее вручную (например, через source-инг). Но НЕТ menu-входа.

   **Альтернатива (cleaner):** удалить uninstall_adguard_home тоже, поскольку никто ее не вызывает. CONTEXT.md прямо говорит «СОХРАНИТЬ uninstall_adguard_home (она используется кодом cleanup)». Решение по умолчанию — **сохранить** функцию, потому что:
   - Она self-contained, не создает мертвый weight на CLI.
   - Возможный future use-case: emergency-removal через `sudo bash -c 'source xrayebator; uninstall_adguard_home'`.
   - Update.sh не source-ит xrayebator, дублирует логику в `_adguard_force_uninstall_if_present` (Task 1) — но при будущей рефакторинге может использовать функцию.

**C. Tools для удаления — Edit tool:**

Использовать `Edit` инструмент с большими блоками old_string→new_string (вместо sed -i). Для каждой функции — Read xrayebator с offset+limit, скопировать точный блок в old_string, пустая или комментарий в new_string.

**ВАЖНО:** проверить что после удаления `bash -n xrayebator` все еще проходит, и нет «orphan» вызовов adguard_home_menu или adguard_status из других мест файла. Если есть — удалить и их.

**D. Update CLAUDE.md:**

Найти секцию `### Add-on services` в CLAUDE.md:
```
### Add-on services

- **AdGuard Home** (menu item 7): Standalone binary at `/opt/AdGuardHome/`, ...
```

Заменить на ОДИН из двух вариантов:

**Вариант 1 (удалить целиком):**
Просто удалить всю секцию «Add-on services» — она содержала только AdGuard.

**Вариант 2 (deprecation note):**
```
### Add-on services (deprecated v2.0)

- **AdGuard Home** — Removed in v2.0. Force-uninstalled by `xrayebator update` via `_adguard_force_uninstall_if_present` function in update.sh if detected. DNS rolled back to DoH Local (1.1.1.1). Function `uninstall_adguard_home()` retained in xrayebator for manual emergency use.
```

Использовать Вариант 2 (deprecation note) — лучше для исторической ясности.

**Russian/style:** В коде user-facing strings — на русском без «е с двумя точками». В CLAUDE.md — английский (соглашение проекта).
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "adguard_home_menu\|adguard_status" xrayebator` == 0 (функции удалены).
- `grep -c "uninstall_adguard_home" xrayebator` ≥ 1 (функция СОХРАНЕНА).
- `grep -c "AdGuard\|adguard" xrayebator | head` — должно быть мало упоминаний (только в `uninstall_adguard_home` и комментариях).
- `grep -c "7) adguard_home_menu" xrayebator` == 0.
- `grep -c "AdGuard Home (блокировка рекламы)" xrayebator` == 0 (display string удалена).
- main_menu все еще работает: `sudo xrayebator` → меню отображается без пункта 7 (или с дырой), пункт 7 при вводе попадает в «Неверный выбор».
- main_menu пункт 4 (manage_profile_menu hub из Plan 8.1) сохранен: `grep -c "4) manage_profile_menu" xrayebator` == 1.
- main_menu пункт 11 (bypass_routing из Plan 8.2) сохранен: `grep -c "11) bypass_routing_menu" xrayebator` == 1.
- CLAUDE.md: `grep -c "Add-on services" CLAUDE.md` == 1 (deprecation note Вариант 2) или == 0 (Вариант 1).
- `grep -c "AdGuard Home" CLAUDE.md` ≤ 1 (только в deprecation note, если Вариант 2).
  </verify>
  <done>
- main_menu: display string «7) AdGuard Home...» удалена; case-ветка `7) adguard_home_menu ;;` удалена.
- Функции adguard_home_menu, adguard_status (и любые другие adguard_*) удалены из xrayebator.
- Функция uninstall_adguard_home СОХРАНЕНА (orphan — не вызывается, но self-contained).
- CLAUDE.md секция «Add-on services» помечена deprecated с упоминанием force-uninstall в xrayebator update (через `_adguard_force_uninstall_if_present`).
- `bash -n xrayebator` проходит.
- Plan 8.1 (manage_profile_menu hub, пункт 4) и Plan 8.2 (bypass_routing, пункт 11) сохранены — sequential execution prevents race.
  </done>
</task>

</tasks>

<verification>
**Plan 8.3 верификация (после исполнения 2 задач):**

```bash
# Syntax
bash -n xrayebator
bash -n update.sh
bash -n install.sh

# update.sh wrapped в функцию (исправление revision warning #3)
grep -c "_adguard_force_uninstall_if_present()" update.sh             # == 1 (definition)
grep -c "_adguard_force_uninstall_if_present$" update.sh              # ≥ 1 (call)
grep -c "^local " update.sh                                           # == 0 (НЕТ local на top-level)

# update.sh function content
grep -n "Обнаружен устаревший AdGuard Home" update.sh    # == 1
grep -n "Шаг 1/5: Восстановление Xray DNS" update.sh     # == 1
grep -n "Шаг 2/5: Остановка AdGuard Home" update.sh      # == 1
# Verify order:
awk '
  /Шаг 1\/5: Восстановление Xray DNS/{a=NR}
  /Шаг 2\/5: Остановка AdGuard Home/{b=NR}
  END { if (a > 0 && b > a) print "ORDER_OK"; else print "ORDER_WRONG"; }
' update.sh

# xrayebator cleanup
grep -c "adguard_home_menu\|adguard_status" xrayebator   # == 0
grep -c "uninstall_adguard_home" xrayebator               # ≥ 1 (СОХРАНЕНА)
grep -c "AdGuard Home (блокировка рекламы)" xrayebator    # == 0
grep -c "7) adguard_home_menu" xrayebator                 # == 0

# Plan 8.1 + 8.2 changes preserved
grep -c "4) manage_profile_menu" xrayebator               # == 1
grep -c "11) bypass_routing_menu" xrayebator              # == 1

# CLAUDE.md
grep -c "AdGuard Home" CLAUDE.md                          # ≤ 1
```

**Manual smoke на VPS с установленным AdGuard:**

1. `sudo xrayebator update` (выбрать любую ветку):
   - Функция `_adguard_force_uninstall_if_present` вызывается.
   - В выводе появляется блок «Обнаружен устаревший AdGuard Home → деинсталляция».
   - Видно «Шаг 1/5: Восстановление Xray DNS» ПЕРЕД «Шаг 2/5: Остановка AdGuard Home».
   - После завершения: `/opt/AdGuardHome/` не существует.
   - `jq '.dns.servers' /usr/local/etc/xray/config.json` показывает DoH Local.
   - `systemctl is-active xray` == active.
   - Клиент подключается успешно (нет DNS black-hole).
   - НЕТ runtime error про `local: can only be used in a function`.

2. `sudo xrayebator` (после update):
   - main_menu отображается БЕЗ AdGuard пункта 7.
   - Ввод «7» → «Неверный выбор».
   - Пункт 4 (manage_profile_menu hub) работает.
   - Пункт 11 (bypass_routing) работает.

**Manual smoke на VPS БЕЗ AdGuard:**

1. `sudo xrayebator update`:
   - Функция `_adguard_force_uninstall_if_present` возвращает 0 на старте (skip).
   - Остальная часть update работает как обычно.
   - НЕТ runtime error.
</verification>

<success_criteria>
1. `bash -n update.sh xrayebator install.sh` — проходит.
2. **AdGuard auto-uninstall в update.sh:**
   - Bash-функция `_adguard_force_uninstall_if_present` определена в update.sh, ее тело содержит весь cleanup-flow (с `local` внутри).
   - Вызов функции расположен ПЕРЕД секцией «МИГРАЦИЯ DNS» (update.sh:588).
   - НЕТ `local` на top-level update.sh (проверено: `grep -c "^local " update.sh` == 0).
   - CRITICAL ORDERING: DNS rollback (Шаг 1) → systemctl stop AdGuardHome (Шаг 2) → rm -rf (Шаг 3) → systemd-resolved (Шаг 4) → UFW (Шаг 5) → safe-pattern restart Xray.
   - Force (без y/N), explain message про deprecation.
   - Idempotent (return 0 если AdGuard не установлен).
3. **xrayebator cleanup:**
   - Пункт 7 «AdGuard Home (блокировка рекламы)» удален из main_menu (display + case).
   - Функции adguard_home_menu, adguard_status удалены.
   - Функция uninstall_adguard_home СОХРАНЕНА.
   - Plan 8.1 (manage_profile_menu hub) и Plan 8.2 (bypass_routing) НЕ сломаны.
4. **CLAUDE.md:** секция «Add-on services» либо удалена, либо помечена deprecated с упоминанием force-uninstall через `_adguard_force_uninstall_if_present`.
5. Все user-facing строки в update.sh функции — на русском без буквы «е с двумя точками».
6. На VPS с установленным AdGuard — после `sudo xrayebator update` AdGuard удален, Xray работает, DNS resolves через DoH Local. НЕТ runtime error.
7. На VPS без AdGuard — update.sh продолжает работу без изменений (idempotency).
</success_criteria>

<output>
After completion, create `.planning/phases/08-polish-sni-vision-bypass-routing/08-03-SUMMARY.md` using the standard SUMMARY template. Include:
- Decisions: WRAPPING в функцию `_adguard_force_uninstall_if_present` для избежания `local` на top-level (исправлено в revision), CRITICAL ORDERING (DNS rollback first, RESEARCH §Pitfall 2), без y/N (force), uninstall_adguard_home СОХРАНЕНА (orphan-but-self-contained), CLAUDE.md → deprecation note Вариант 2, sequential dependency (depends_on=08-02) для предотвращения race на xrayebator.
- Patterns: update.sh использует function-wrapped inline pattern (mktemp+jq+xray run -test+mv) — НЕ source xrayebator (single-file constraint respected, update.sh self-contained).
- Invariants: AdGuard упоминания в xrayebator main_menu = 0; uninstall_adguard_home сохранена; update.sh idempotent; `local` всегда внутри функции (НЕ на top-level).
- Files: update.sh (+function ~80 строк + одна строка-вызов), xrayebator (удалены 3+ функции и menu-entries), CLAUDE.md (deprecation note).
</output>
