---
phase: 08-polish-sni-vision-bypass-routing
plan: 02
type: execute
wave: 2
depends_on:
  - "08-01"
files_modified:
  - xrayebator
autonomous: true
requirements:
  - REQ-F01
  - REQ-F02
  - REQ-F03
  - REQ-F04
  - REQ-F05

must_haves:
  truths:
    - "В main_menu доступен пункт 'Управление обходом VPN' с подменю: показать текущие правила / добавить домен / удалить домен / сбросить все / применить дефолтный bundle"
    - "При первом запуске после v2.0 (отсутствует marker .bypass_routing_2026) пользователю задается вопрос 'Добавить дефолтные bypass-правила (Steam, RU-сервисы, банки, Yandex)? [y/N]' с дефолтом N; marker создается ОДИН раз независимо от ответа"
    - "Дефолтный bundle реализован как granular multi-select по 5 группам (Steam, RU-сервисы, банки, маркетплейсы, Yandex); юзер может включить/выключить отдельные группы перед apply"
    - "При попытке добавить домен, совпадающий с Reality SNI любого профиля (или с hardcoded Reality default list), запрос отклоняется с ошибкой 'этот домен используется как Reality SNI в профиле X' — никакого override"
    - "Bypass-rule добавляется в routing.rules через safe_jq_write с PREPEND (новое правило в начало массива), формат: {type:field, domain:['domain:<dom>',...], outboundTag:'direct'}"
    - "После каждого изменения bypass rules выполняется safe_restart_xray (pre-validate + auto-rollback на failure)"
    - "Routing rule использует префикс 'domain:' (suffix matching) — hardcoded, юзеру выбор не дается"
  artifacts:
    - path: "xrayebator"
      provides: "bypass_routing_menu, _sni_in_use, _apply_bypass_rule, _bypass_bundle_groups, _migrate_bypass_routing_2026, _bypass_list_current, _bypass_remove_rule, _bypass_reset_all"
      contains: "bypass_routing_menu"
  key_links:
    - from: "main_menu"
      to: "bypass_routing_menu"
      via: "новый пункт меню (11) Управление обходом VPN)"
      pattern: "bypass_routing_menu"
    - from: "main_menu migration loop"
      to: "run_migration .bypass_routing_2026"
      via: "вызов run_migration после .sni_list_2026"
      pattern: "run_migration .bypass_routing_2026"
    - from: "_apply_bypass_rule"
      to: "safe_jq_write на config.json routing.rules"
      via: "[new_rule] + .routing.rules (PREPEND, не append)"
      pattern: "safe_jq_write.*routing.rules"
    - from: "_apply_bypass_rule"
      to: "_sni_in_use SNI-conflict check"
      via: "вызов перед safe_jq_write"
      pattern: "_sni_in_use"
    - from: "bypass_routing_menu actions"
      to: "safe_restart_xray"
      via: "вызов после каждой mutation"
      pattern: "safe_restart_xray"
---

<objective>
Plan 8.2 реализует новое меню «Управление обходом VPN» — REQ-F01..F05. Меню позволяет оператору добавлять домены в bypass-routing (трафик идет через freedom outbound `direct` напрямую, без VPN-туннеля). Поддерживает: список текущих правил, добавление одного домена, granular multi-select дефолтного bundle (5 групп: Steam, RU-сервисы, банки, маркетплейсы, Yandex), удаление, полный сброс, hard-block при SNI-конфликте с Reality. First-run opt-in prompt через migration .bypass_routing_2026.

Purpose: Оператор может настроить routing так, чтобы определенные домены (Steam CDN, gosuslugi, банки, ozon, Yandex services) шли мимо VPN (через freedom outbound), для лучшего UX/скорости при доступе к РФ-сервисам с РФ-VPN.

Output:
- xrayebator: bypass_routing_menu + 7 helper'ов; миграция .bypass_routing_2026 с granular multi-select prompt; регистрация пункта 11 в main_menu; вызов миграции в migration loop.
- config.json: .routing.rules получает bypass-правила в начале массива (prepend), используя freedom outbound `direct`.

Sequential dependency (depends_on=["08-01"]): Plan 8.2 модифицирует `xrayebator` в overlapping секциях с Plan 8.1 (main_menu items, migration loop). Параллельная запись в один файл двумя subagent'ами создает race condition. Поэтому Plan 8.2 запускается ТОЛЬКО после успешного завершения Plan 8.1.
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
@.planning/phases/08-polish-sni-vision-bypass-routing/08-01-SUMMARY.md

# Phase 4 — паттерн run_migration (3-valued return) + safe_jq_write + safe_restart_xray
# Phase 6/7 — образцы безопасной правки config.json через safe_jq_write
# RESEARCH §Pitfall 1 (PREPEND vs APPEND в routing.rules) — критично для эффективности bypass
# RESEARCH §Unknown 5 — domain: префикс semantics + first-match-wins + tag "direct" из install.sh
# Plan 8.1 SUMMARY — состояние xrayebator после консолидации main_menu (пункт 4 = manage_profile_menu hub, 5-6 убраны)
@xrayebator
@install.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: bypass_routing helpers + _sni_in_use SNI-conflict guard</name>
  <files>xrayebator</files>
  <action>
**A. Реализовать helper `_sni_in_use(domain) -> 0/1`:**

Поместить рядом с другими `_*` helper-ами (после `_subscription_base_url`, ~xrayebator:320 или ~xrayebator:1110 — выбери место по группировке). Логика:

1. `local domain="$1"`.
2. Hardcoded Reality default SNI list (defaults используемых в add_inbound xrayebator + install.sh):
   ```bash
   local -ar REALITY_DEFAULT_SNIS=(
     "www.ozon.ru" "api-maps.yandex.ru" "www.sberbank.ru"
     "www.gosuslugi.ru" "www.tinkoff.ru" "www.alfabank.ru"
     "www.kinopoisk.ru" "speller.yandex.net" "www.cloudflare.com"
   )
   ```
3. Проверить hardcoded list:
   ```bash
   for d in "${REALITY_DEFAULT_SNIS[@]}"; do
     [[ "$d" == "$domain" ]] && return 0
   done
   ```
4. Проверить ВСЕ профили на VPS:
   ```bash
   if [[ -d "$PROFILES_DIR" ]]; then
     local profile_snis
     profile_snis=$(jq -r '.sni // empty' "$PROFILES_DIR"/*.json 2>/dev/null | sort -u)
     while IFS= read -r psni; do
       [[ -n "$psni" && "$psni" == "$domain" ]] && return 0
     done <<< "$profile_snis"
     
     # Также проверить serverNames из config.json (полная проверка)
     local cfg_snis
     cfg_snis=$(jq -r '[.inbounds[] | .streamSettings.realitySettings.serverNames // [] | .[]] | .[]' "$CONFIG_FILE" 2>/dev/null | sort -u)
     while IFS= read -r csni; do
       [[ -n "$csni" && "$csni" == "$domain" ]] && return 0
     done <<< "$cfg_snis"
   fi
   ```
5. Return 1 (домен НЕ используется как Reality SNI — можно добавить в bypass).

**B. Реализовать helper `_bypass_list_current()`:**

Returns: JSON array всех domain prefixes из routing.rules с outboundTag=="direct" (только те правила, которые мы сами добавили). Точный jq:

```bash
jq -r '
  [.routing.rules[]
   | select(.outboundTag == "direct" and (.domain // []) | length > 0)
   | .domain[]
  ] | unique | .[]
' "$CONFIG_FILE" 2>/dev/null
```

Возвращает по одной строке `domain:<dom>` на каждой. Если ничего нет — пустая строка.

**C. Реализовать helper `_apply_bypass_rule(domain_list_json)`:**

Принимает JSON array строк формата `["domain:steamcontent.com","domain:steam-chat.com"]`. Логика:

1. Распарсить JSON и извлечь чистые domain-имена (без префикса):
   ```bash
   local domains_raw
   domains_raw=$(printf '%s' "$domain_list_json" | jq -r '.[] | ltrimstr("domain:")')
   ```

2. Для каждого домена — проверить SNI-конфликт через `_sni_in_use`:
   ```bash
   while IFS= read -r dom; do
     [[ -z "$dom" ]] && continue
     if _sni_in_use "$dom"; then
       echo -e "${RED}Конфликт: $dom используется как Reality SNI — добавление сломает handshake${NC}"
       echo -e "${YELLOW}  Bypass правила не применены. Удалите $dom из списка и попробуйте снова.${NC}"
       return 1
     fi
   done <<< "$domains_raw"
   ```

3. PREPEND новое правило в начало массива routing.rules (КРИТИЧНО — см. RESEARCH §Pitfall 1):
   ```bash
   backup_config "bypass_routing_add"
   if safe_jq_write \
        --argjson domains "$domain_list_json" \
        '.routing.rules = [{"type":"field","domain":$domains,"outboundTag":"direct"}] + .routing.rules' \
        "$CONFIG_FILE"; then
     fix_xray_permissions
     safe_restart_xray
     return 0
   else
     return 2
   fi
   ```

ВАЖНО: используем `.routing.rules = [new] + .routing.rules` (НЕ `.routing.rules += [new]` — это append, который не сработает из-за first-match-wins).

**D. Реализовать helper `_bypass_remove_rule(domain)`:**

Удалить правило по конкретному `domain:<dom>` из всех bypass-правил (если правило содержало ТОЛЬКО этот домен — удалить правило целиком; если содержит еще домены — оставить, удалив только этот domain entry):

```bash
local d="domain:$1"
backup_config "bypass_routing_remove"
safe_jq_write \
  --arg d "$d" \
  '.routing.rules = [
    .routing.rules[] |
    if .outboundTag == "direct" and (.domain // []) | type == "array" then
      .domain = ((.domain // []) - [$d])
      | (if (.domain | length == 0) then empty else . end)
    else
      .
    end
  ]' "$CONFIG_FILE"
fix_xray_permissions
safe_restart_xray
```

Замечание: `((.domain | length == 0) then empty else . end)` фильтрует out-правила, оставшиеся пустыми после удаления — без этого после удаления единственного домена правило стало бы `domain: []`, что валидно но бесполезно.

**E. Реализовать helper `_bypass_reset_all()`:**

Удалить ВСЕ bypass-правила (но НЕ дефолтные правила install.sh — geosite ads, bittorrent, UDP/443, catch-all direct):

Distinguishing критерий: bypass-правила, добавленные через `_apply_bypass_rule`, имеют `outboundTag == "direct"` И НЕ имеют `.network` или `.port` (только `.domain`). Дефолтное catch-all правило установки `install.sh:556-565` имеет `network: tcp,udp` БЕЗ domain (поэтому фильтр сработает корректно).

```bash
backup_config "bypass_routing_reset"
safe_jq_write '
  .routing.rules = [
    .routing.rules[] |
    select(.outboundTag != "direct" or (.network // null) != null or (.port // null) != null or ((.domain // []) | length == 0))
  ]' "$CONFIG_FILE"
fix_xray_permissions
safe_restart_xray
```

**F. Реализовать helper `_bypass_bundle_groups()`:**

Возвращает hardcoded groups данных по REQ-F02:

```bash
_bypass_bundle_groups() {
  cat <<'EOG'
steam|Steam|steamcontent.com,steamcdn-a.akamaihd.net,steam-chat.com,steamcommunity.com,cm.steampowered.com
ru_services|RU-сервисы|gosuslugi.ru,nalog.gov.ru,mos.ru
banks|RU-банки|sberbank.ru,vtb.ru,tinkoff.ru,alfabank.ru
marketplaces|RU маркетплейсы|ozon.ru,wildberries.ru,avito.ru
yandex|Yandex|yandex.ru,ya.ru,mail.yandex.ru
EOG
}
```

Формат: `group_id|display_name|comma_separated_domains`.

**Russian/style:** Без буквы «е с двумя точками». RED/YELLOW/GREEN coloring (см. CLAUDE.md).
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "_sni_in_use\|_bypass_list_current\|_apply_bypass_rule\|_bypass_remove_rule\|_bypass_reset_all\|_bypass_bundle_groups" xrayebator` ≥ 12 (определения + использования).
- Unit-стиль smoke (через sourcing):
  ```bash
  sudo XRAYEBATOR_SOURCED=1 bash -c 'source /usr/local/bin/xrayebator; _sni_in_use "www.ozon.ru" && echo CONFLICT; _sni_in_use "steamcontent.com" || echo OK'
  ```
  должен выдать `CONFLICT` (www.ozon.ru в REALITY_DEFAULT_SNIS) и `OK`.
- `grep -c "\\[new_rule\\] + .routing.rules\\|\\[{\"type\":\"field\".*}\\] + .routing.rules" xrayebator` ≥ 1 (PREPEND pattern).
- Manual: добавить bypass через `_apply_bypass_rule '["domain:steamcontent.com"]'` → `jq '.routing.rules[0]' /usr/local/etc/xray/config.json` показывает `{type:field, domain:["domain:steamcontent.com"], outboundTag:"direct"}` НА ПЕРВОМ месте.
- safe_restart_xray отработал (`systemctl is-active xray` = active).
  </verify>
  <done>
- 6 helper-ов реализованы: _sni_in_use (hardcoded REALITY_DEFAULT_SNIS + jq на profiles + jq на config.json serverNames), _bypass_list_current, _apply_bypass_rule (с SNI-conflict guard + PREPEND через safe_jq_write + safe_restart_xray), _bypass_remove_rule, _bypass_reset_all (с фильтром на дефолтные правила), _bypass_bundle_groups (5 групп hardcoded).
- Все mutation-helpers вызывают backup_config + safe_jq_write + fix_xray_permissions + safe_restart_xray.
- PREPEND pattern `[new] + .routing.rules` (не append `+=`) — соответствует RESEARCH §Pitfall 1.
- _sni_in_use покрывает 3 источника: REALITY_DEFAULT_SNIS array + .sni в profile JSON + .serverNames[] в config.json.
  </done>
</task>

<task type="auto">
  <name>Task 2: bypass_routing_menu (главное меню фичи) + регистрация в main_menu</name>
  <files>xrayebator</files>
  <action>
**A. Реализовать функцию `bypass_routing_menu()`:**

Поместить вместе с другими `*_menu` функциями. Структура while-loop меню:

```
═══════════════════════════════════════════════
   УПРАВЛЕНИЕ ОБХОДОМ VPN
═══════════════════════════════════════════════

Текущие домены в обходе:
  domain:steamcontent.com
  domain:gosuslugi.ru
  ...

(если пусто — «Нет правил обхода»)

 1) Добавить домен в обход
 2) Применить дефолтный bundle (5 групп)
 3) Удалить домен из обхода
 4) Сбросить ВСЕ правила обхода
 0) Назад в главное меню

Выбор:
```

Реализация (loop with case):

```bash
bypass_routing_menu() {
  while true; do
    show_ascii
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    УПРАВЛЕНИЕ ОБХОДОМ VPN                    ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo ""
    
    local current
    current=$(_bypass_list_current)
    if [[ -z "$current" ]]; then
      echo -e "${YELLOW}  Нет правил обхода (весь трафик через VPN)${NC}"
    else
      echo -e "${CYAN}Текущие домены в обходе:${NC}"
      while IFS= read -r dom; do
        [[ -n "$dom" ]] && echo -e "  ${GREEN}->${NC} $dom"
      done <<< "$current"
    fi
    echo ""
    
    echo -e "${CYAN} 1)${NC} Добавить домен в обход"
    echo -e "${CYAN} 2)${NC} Применить дефолтный bundle (5 групп)"
    echo -e "${CYAN} 3)${NC} Удалить домен из обхода"
    echo -e "${CYAN} 4)${NC} Сбросить ВСЕ правила обхода"
    echo -e "${CYAN} 0)${NC} Назад в главное меню"
    echo ""
    echo -n -e "${YELLOW}Выбор: ${NC}"
    
    local c
    read -r c
    case "$c" in
      1) _bypass_add_single_domain ;;
      2) _bypass_apply_bundle ;;
      3) _bypass_remove_domain_interactive ;;
      4) _bypass_reset_all_interactive ;;
      0) return ;;
    esac
  done
}
```

**B. Реализовать вспомогательные интерактивные функции:**

**`_bypass_add_single_domain()`:**

```
Введите домен (без префикса domain:, например 'steamcontent.com'): _
```
Read, validate regex `^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$` (basic domain format). Confirm. Call `_apply_bypass_rule "[\"domain:$user_dom\"]"`. Print success/failure (от exit code _apply_bypass_rule).

**`_bypass_apply_bundle()`:**

1. Header «Дефолтный bundle (выберите группы для применения)».
2. Прочитать `_bypass_bundle_groups`, отобразить с чекбоксами (default state: все включены `[x]`):
   ```
    1) [x] Steam (5 доменов)
    2) [x] RU-сервисы (3 домена)
    3) [x] RU-банки (4 домена)
    4) [x] RU маркетплейсы (3 домена)
    5) [x] Yandex (3 домена)
   ```
3. Loop: «Введите номер группы для toggle (или 'apply' для применения, 'cancel' для отмены):»
   - При вводе цифры — toggle state соответствующей группы (массив local `state=("on" "on" "on" "on" "on")`).
   - После toggle — повторно отобразить чекбоксы.
   - При вводе 'apply' — собрать enabled groups, конструировать JSON массив всех доменов из этих групп с префиксом `domain:` через jq:
     ```bash
     local all_doms_csv=""
     local idx=1
     while IFS='|' read -r gid gname doms_csv; do
       if [[ "${state[$((idx-1))]}" == "on" ]]; then
         all_doms_csv="${all_doms_csv}${all_doms_csv:+,}${doms_csv}"
       fi
       ((idx++))
     done < <(_bypass_bundle_groups)
     
     if [[ -z "$all_doms_csv" ]]; then
       echo -e "${YELLOW}Нет выбранных групп. Отменено.${NC}"
       return
     fi
     
     local doms_json
     doms_json=$(printf '%s' "$all_doms_csv" | tr ',' '\n' | jq -R '"domain:" + .' | jq -s '.')
     ```
   - Затем confirm: «Применить $(echo "$doms_json" | jq 'length') доменов? [y/N]».
   - При y → `_apply_bypass_rule "$doms_json"`.
   - При cancel — return.

**`_bypass_remove_domain_interactive()`:**

1. Получить current list через `_bypass_list_current`.
2. Если пусто — «Нет правил для удаления», sleep 1, return.
3. Иначе отобразить список с номерами:
   ```
    1) domain:steamcontent.com
    2) domain:gosuslugi.ru
    ...
    0) Отмена
   ```
4. Read choice, validate range, извлечь domain (без префикса), confirm, вызвать `_bypass_remove_rule "$dom"`.

**`_bypass_reset_all_interactive()`:**

1. RED-warning: «УДАЛИТ ВСЕ bypass-правила! Дефолтные правила install.sh (geosite ads, QUIC block) останутся.»
2. Confirm: «Действительно сбросить? [y/N]» (default N).
3. При y → `_bypass_reset_all`.

**C. Регистрация в main_menu:**

После выполнения Plan 8.1, main_menu выглядит так: пункт 4 = manage_profile_menu (новый hub), пункты 5-6 убраны, пункт 7 = AdGuard (будет удален в Plan 8.3), пункт 8 = post-quantum, пункт 9 = HAPP.

Вставить новый блок ПОСЛЕ HAPP SUBSCRIPTION секции (после строки с пунктом 9), ПЕРЕД «0) Выход»:

```
echo -e "${MAGENTA} BYPASS ROUTING:${NC}"
echo -e "${CYAN}11)${NC} Управление обходом VPN"
echo ""
```

В case-блоке добавить (после `9) happ_subscription_menu ;;`):
```
11) bypass_routing_menu ;;
```

ВНИМАНИЕ про нумерацию: Plan 8.1 убрал пункты 5 и 6 (оставив «дыры»). Plan 8.3 удалит пункт 7. Финальная нумерация main_menu после всех 3 plans: 1, 2, 3, 4 (hub), [5-6 пусто], [7 пусто], 8, 9, 11. Перенумеровывать НЕ нужно — юзеры могли запомнить, а дыры в numbering приемлемы для одной мажорной версии.

**Russian/style:** Без «е с двумя точками». RED для warning, GREEN для success.
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "bypass_routing_menu" xrayebator` ≥ 2 (определение + 11) вызов в main_menu).
- `grep -c "_bypass_add_single_domain\|_bypass_apply_bundle\|_bypass_remove_domain_interactive\|_bypass_reset_all_interactive" xrayebator` ≥ 8.
- `grep -c "11) bypass_routing_menu" xrayebator` == 1.
- `grep -c "4) manage_profile_menu" xrayebator` == 1 (Plan 8.1 не сломан Plan 8.2 модификациями).
- Manual smoke: `sudo xrayebator` → пункт 11 → меню отображается «нет правил обхода» → 1) → ввести `steamcontent.com` → confirm → правило применено + safe_restart_xray → возврат в меню → «Текущие домены в обходе: domain:steamcontent.com».
- Конфликт-смок: попытаться добавить `www.ozon.ru` (default Reality SNI) → ожидается RED-ошибка «Конфликт: www.ozon.ru используется как Reality SNI», правило НЕ применено.
- Bundle-смок: пункт 2 → toggle 3 группы off → apply → правила добавлены только из выбранных групп.
- Reset: пункт 4 → confirm y → `jq '.routing.rules' /usr/local/etc/xray/config.json` показывает только дефолтные правила (без bypass).
  </verify>
  <done>
- bypass_routing_menu реализована с display текущих правил + 4 действия (add/bundle/remove/reset) + 0=назад.
- _bypass_add_single_domain валидирует domain regex + вызывает _apply_bypass_rule (с SNI conflict guard).
- _bypass_apply_bundle — granular multi-select (5 групп), toggle через ввод цифры, apply строит JSON через jq + _apply_bypass_rule.
- _bypass_remove_domain_interactive — list-select-confirm-remove.
- _bypass_reset_all_interactive — RED warning + confirm + _bypass_reset_all.
- Пункт 11 «Управление обходом VPN» зарегистрирован в main_menu, не ломая существующий пункт 4 (manage_profile_menu hub из Plan 8.1).
- REQ-F01, REQ-F02, REQ-F03 удовлетворены.
  </done>
</task>

<task type="auto">
  <name>Task 3: Миграция .bypass_routing_2026 — first-run opt-in prompt</name>
  <files>xrayebator</files>
  <action>
**A. Реализовать функцию `_migrate_bypass_routing_2026()`:**

Поместить вместе с другими `_migrate_*` функциями. Логика — это специфичная миграция: она НЕ модифицирует config.json напрямую, а показывает interactive prompt пользователю. По соглашению run_migration (3-valued return), мы используем return 1 (no-op) — потому что независимо от ответа пользователя, миграция должна mark-as-done (one-shot).

Логика:

```bash
_migrate_bypass_routing_2026() {
  # First-run opt-in для дефолтного bundle bypass-routing.
  # Возвращает 1 (no-op) ВСЕГДА — config.json не мутируется внутри функции
  # (если юзер согласится — мутация произойдет через _apply_bypass_rule с
  # внутренним safe_restart_xray, отдельным от run_migration).
  
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  BYPASS ROUTING (новое в v2.0)               ${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${CYAN}Можно настроить чтобы определенные домены шли в обход VPN:${NC}"
  echo -e "  ${YELLOW}-${NC} Steam (CDN, чат, community) — быстрее без VPN"
  echo -e "  ${YELLOW}-${NC} РФ-сервисы (gosuslugi, nalog, mos) — обязательно с РФ-IP"
  echo -e "  ${YELLOW}-${NC} РФ-банки (sber, vtb, tinkoff, alfa) — требуют РФ-IP"
  echo -e "  ${YELLOW}-${NC} Маркетплейсы (ozon, wb, avito)"
  echo -e "  ${YELLOW}-${NC} Yandex сервисы"
  echo ""
  echo -e "${CYAN}Эти домены пойдут через freedom outbound (direct), не через VPN.${NC}"
  echo ""
  echo -n -e "${YELLOW}Добавить дефолтные bypass-правила? [y/N]: ${NC}"
  
  local ans
  read -r ans
  ans="${ans:-N}"
  
  if [[ "$ans" =~ ^[yYдД]$ ]]; then
    # Переход в granular multi-select из bypass_routing_menu пункта 2
    _bypass_apply_bundle
  else
    echo -e "${CYAN}Пропущено. Можно настроить позже через главное меню → пункт 11.${NC}"
    sleep 1
  fi
  
  # Marker ставится через run_migration независимо от ответа — больше не спрашивать.
  return 1
}
```

**B. Регистрация миграции в main_menu (после run_migration .sni_list_2026 строки из Plan 8.1):**

```
run_migration "bypass_routing_2026" "Bypass routing first-run prompt (опционально)" _migrate_bypass_routing_2026 || ((migration_failures++))
```

ВАЖНО: пункт ПОСЛЕ .sni_list_2026. Order migrations:
```
... existing migrations ...
run_migration "subscription_tokens_2026" ...
run_migration "sni_list_2026" ...                  (Plan 8.1)
run_migration "bypass_routing_2026" ...            (Plan 8.2 — этот таск)
```

**C. Регистрация в main_menu (Plan 8.1 уже добавил .sni_list_2026):**

Полный финальный блок migrations в main_menu должен выглядеть так (для ясности — не трогать строки до subscription_tokens_2026, только добавить ниже):

```bash
run_migration "subscription_tokens_2026"  "Subscription tokens (Phase 7)..."     _migrate_subscription_tokens_2026   || ((migration_failures++))
run_migration "sni_list_2026"             "SNI list 2026 (РФ-банки/логистика)"   _migrate_sni_list_2026              || ((migration_failures++))
run_migration "bypass_routing_2026"       "Bypass routing first-run prompt"      _migrate_bypass_routing_2026        || ((migration_failures++))
```

**D. Контракт миграции (REQ-F04: НЕ force):**

REQ-F04 говорит: «Migration `.bypass_routing_2026` опциональная (НЕ force)». Реализация выше соответствует — миграция показывает prompt с дефолтом N, marker создается ОДИН раз независимо от ответа (через `return 1` → run_migration touches marker без restart).

ВАЖНО: если юзер сказал y, _bypass_apply_bundle уже вызывает safe_restart_xray внутри _apply_bypass_rule. Дополнительный restart от run_migration НЕ происходит (return 1 → no restart). Это правильное поведение.

**Russian/style:** Без «е с двумя точками», use обычное «е».
  </action>
  <verify>
- `bash -n xrayebator` проходит.
- `grep -c "_migrate_bypass_routing_2026" xrayebator` ≥ 2 (определение + вызов в run_migration).
- `grep -c "run_migration.*bypass_routing_2026" xrayebator` == 1.
- Test marker after first call: на чистой VPS после первого `sudo xrayebator`:
  - Если ответил N → `[[ -f /usr/local/etc/xray/.bypass_routing_2026 ]]` == true, `jq '.routing.rules | length' /usr/local/etc/xray/config.json` показывает дефолтные 4 правила (без bypass).
  - Если ответил y и выбрал все группы → marker создан + .routing.rules имеет дополнительное правило с outboundTag=direct и доменами из всех 5 групп.
- Повторный запуск `sudo xrayebator` — НЕ показывает prompt (marker уже создан).
- Migration в общем aggregate отчете не считается failure (return 1 = no-op, не failure).
  </verify>
  <done>
- _migrate_bypass_routing_2026 реализована с opt-in prompt (default N), переход в _bypass_apply_bundle при y, marker через return 1 (no-op).
- run_migration ".bypass_routing_2026" зарегистрирован в main_menu migration loop после .sni_list_2026.
- Marker создается ОДИН раз независимо от ответа — никаких re-prompts (соответствует REQ-F04).
- REQ-F04, REQ-F05 удовлетворены.
  </done>
</task>

</tasks>

<verification>
**Plan 8.2 верификация (после исполнения 3 задач):**

```bash
# Syntax
bash -n xrayebator

# Helpers
grep -c "_sni_in_use\|_bypass_list_current\|_apply_bypass_rule\|_bypass_remove_rule\|_bypass_reset_all\|_bypass_bundle_groups" xrayebator
# ≥ 12

# Menu registered
grep -c "11) bypass_routing_menu" xrayebator
# == 1

# Plan 8.1 changes preserved (sequential dependency означает Plan 8.1 уже применен)
grep -c "4) manage_profile_menu" xrayebator
# == 1

# Migration registered
grep -c "run_migration.*bypass_routing_2026" xrayebator
# == 1

# PREPEND pattern (КРИТИЧНО — RESEARCH Pitfall 1)
grep -c '"type":"field","domain":\$domains,"outboundTag":"direct"\}\] + \.routing\.rules' xrayebator
# ≥ 1

# safe_jq_write на routing.rules
grep -c "safe_jq_write.*routing.rules" xrayebator
# ≥ 3 (apply, remove, reset)

# safe_restart_xray после mutations
grep -c "safe_restart_xray" xrayebator
# ≥ предыдущий count + 3 (apply, remove, reset)
```

**Manual smoke:**

1. На VPS со свежим v2.0:
   - `sudo xrayebator` — migration loop достигает .bypass_routing_2026 → prompt отображается → ответить N → continue.
   - `ls /usr/local/etc/xray/.bypass_routing_2026` — marker создан.
   - main_menu → пункт 11 → меню отображается «нет правил обхода».

2. Add single:
   - Пункт 1 → `steamcontent.com` → confirm y → success.
   - `jq '.routing.rules[0]' /usr/local/etc/xray/config.json` показывает `{type:field, domain:["domain:steamcontent.com"], outboundTag:"direct"}` НА ПЕРВОМ месте.

3. SNI conflict:
   - Пункт 1 → `www.ozon.ru` → expect RED error «используется как Reality SNI».
   - `jq '.routing.rules[0]' /usr/local/etc/xray/config.json` НЕ изменился.

4. Bundle:
   - Пункт 2 → отображаются 5 групп с [x] → toggle Steam off (1) → toggle Yandex off (5) → apply → confirm → bypass-правило добавлено только с доменами ru_services+banks+marketplaces.

5. Reset:
   - Пункт 4 → confirm y → `jq '[.routing.rules[] | select(.outboundTag == "direct" and (.domain // []) | length > 0)] | length' /usr/local/etc/xray/config.json` == 0.
   - Дефолтные правила (geosite ads, QUIC block, catch-all direct) остались.

6. Xray работает после всех операций (systemctl is-active xray = active).
7. Manage profile menu (Plan 8.1) все еще работает: главное меню → 4 → выбрать профиль → submenu отображается.
</verification>

<success_criteria>
1. `bash -n xrayebator` — проходит.
2. **REQ-F01** удовлетворен: bypass_routing_menu доступен через main_menu пункт 11, показывает текущие правила и 4 действия.
3. **REQ-F02** удовлетворен: дефолтный bundle = 5 групп (Steam, RU-сервисы, RU-банки, маркетплейсы, Yandex) с домами строго по REQUIREMENTS.md REQ-F02; granular multi-select toggle.
4. **REQ-F03** удовлетворен: bypass-rule в routing.rules через safe_jq_write с PREPEND (`[new] + .routing.rules`), outboundTag="direct", `domain:` префикс hardcoded.
5. **REQ-F04** удовлетворен: миграция `.bypass_routing_2026` опциональная, prompt default N, marker создан после первого запуска независимо от ответа, никаких re-prompts.
6. **REQ-F05** удовлетворен: после каждой mutation (add/remove/reset/apply_bundle) выполняется safe_restart_xray (через _apply_bypass_rule, _bypass_remove_rule, _bypass_reset_all).
7. **SNI hard block:** при попытке добавить домен, совпадающий с Reality SNI любого профиля или с REALITY_DEFAULT_SNIS — отказ с понятным error, никакого override.
8. Все user-facing строки на русском без буквы «е с двумя точками».
9. Plan 8.1 изменения сохранены (пункт 4 = manage_profile_menu hub) — sequential dependency execution prevents race.
10. Tests на ВСЕХ типичных сценариях (add/conflict/bundle-partial/remove/reset) пройдены вручную.
</success_criteria>

<output>
After completion, create `.planning/phases/08-polish-sni-vision-bypass-routing/08-02-SUMMARY.md` using the standard SUMMARY template. Include:
- Decisions: PREPEND vs APPEND (Pitfall 1 honored), `domain:` префикс hardcoded, hard-block без override для SNI-конфликта, _migrate возвращает 1 (no-op) → marker без restart, _bypass_apply_bundle вызывает safe_restart самостоятельно, sequential execution (depends_on=08-01) для предотвращения race на xrayebator.
- Patterns: 6 helper-ов как single-responsibility, jq `(.domain | length == 0) then empty` для cleanup пустых правил.
- Invariants: only bypass-правила (outboundTag=direct + есть domain) идут в _bypass_list_current / _bypass_reset_all; дефолтные правила install.sh не трогаются.
- Files: xrayebator (+ список новых функций + main_menu пункт 11).
</output>
