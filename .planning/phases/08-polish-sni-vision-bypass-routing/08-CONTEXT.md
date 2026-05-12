# Phase 8: Polish (SNI 2026 + experimental Vision Seed + bypass routing) - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Финальная полировка v2.0 в рамках REQ-E01..E04 + REQ-F01..F05 + deferred AdGuard cleanup:

- Обновлённый SNI list под РФ-доноров 2026 (priority 1: vtb/cdek/avito/pochta/usbank; priority 3: github; убрать apple/icloud) с защитой user-custom SNI.
- Команда `xrayebator probe-test` — standalone CLI для проверки доступности SNI с VPS.
- Опциональный experimental submenu для Vision Seed (`testpre`/`testseed`) в меню профиля.
- HAPP announce editor → `/usr/local/etc/xray/announce.txt` (читается `subhttp.sh`).
- Меню "Управление обходом VPN" с дефолтным bundle (Steam/RU-services/банки/маркетплейсы/Yandex).
- AdGuard Home cleanup (force uninstall при `xrayebator update` + удаление menu-кода).

Вне scope: cron probe-test, multi-domain subscription, alternative bypass routing engines, v1.0-аудит за пределами полировки.

</domain>

<decisions>
## Implementation Decisions

### SNI 2026 миграция и защита user-custom

- **Режим миграции:** Force + post-migration probe-test. `.sni_list_2026` через `run_migration` Phase 4 применяется автоматически на first-run v2.0 без y/N prompt. После миграции — background probe-test проверяет доступность и при fail-ах пишет nag в `main_menu`.
- **Pre-migration prompt:** Перед force-применением — auto-prompt "запустить probe-test сейчас?" (дефолт N). Если skip — миграция всё равно идёт.
- **Защита user-custom:** Hardcoded `KNOWN_DEFAULTS_v1` set всех v1.0 SNI в xrayebator. Всё, что НЕ в этом set — user-custom, миграция не трогает (не удаляет, не переставляет priority).
- **Удаление apple/icloud:** Безусловно, без warning — только если в KNOWN_DEFAULTS_v1.
- **probe-test точки входа:** Standalone CLI `sudo xrayebator probe-test` + auto-prompt перед миграцией (дефолт N). НЕТ menu-item — только CLI.
- **probe-test output:** Pretty table (колонки: SNI | HTTP status | TLS handshake ok/fail | latency) + summary `X/N доступны`. Без файлов, без JSON.

### Bypass routing UX и дефолты

- **First-run prompt:** Opt-in prompt на первом запуске после v2.0 миграции — "Добавить дефолтные bypass-правила (Steam, RU-сервисы, банки, Yandex)? y/N" (дефолт N). После ответа — marker `.bypass_routing_2026`. Никаких re-prompts.
- **Дефолтный bundle UX:** Granular multi-select по группам — чекбоксы `[✓] Steam (5 доменов) [✓] RU-сервисы (3) [✓] банки (4) [✓] Маркетплейсы (3) [✓] Yandex (3)`. Юзер может отключить отдельные группы перед apply.
- **SNI-conflict policy:** Hard block. Если юзер пытается добавить bypass-домен, совпадающий с Reality SNI любого профиля (из `profiles/*.json` или default Reality list) — отказ с понятным error `"этот домен используется как Reality SNI в профиле X, добавление сломает handshake"`. Никакого override.
- **Routing rule format:** `domain:` префикс (suffix matching) — стандарт Xray, покрывает root + subdomains автоматически. Hardcoded для всех bypass-правил, выбор префикса юзеру не даётся.
- **outboundTag:** Существующий freedom outbound (`direct` или эквивалент). Не создаём отдельный outbound.

### Vision Seed experimental доступ

- **Видимость:** Hidden submenu внутри `manage_profile_menu` — отдельный пункт "Адванс настройки (experimental)" с подсказкой "может сломать клиентов, off-by-default". Виден всем, без env-var.
- **Warning тон:** Явный risk + y/N. RED-стиль: "EXPERIMENTAL — может сломать подключения клиентов, не тестировалось на реальных конфигах. Включать только для тестов." Confirm-дефолт `N`.
- **Apply поведение:** Immediate — сохранение в profile JSON через safe_jq_write + обновление inbound в `config.json` + `safe_restart_xray()`. Один шаг, без deferred-режима.
- **Дефолты testpre/testseed:** Предложенные из research. В Plan 8.1 research-step должен найти sensible defaults из Xray docs/source (если их нет — fallback на empty с примером в подсказке). Prompt формата `testpre (default: 5): _`.

### HAPP announce + Plan 8.3 AdGuard cleanup

- **Announce ввод:** Free-form однострочный (`read -r`). Limit ~200 символов (HAPP UI рендерит короткие announcement лучше). Сохраняется в `/usr/local/etc/xray/announce.txt`. Empty файл (или отсутствие) → subhttp.sh не эмиттит `announce` header/body comment.
- **Announce расположение в меню:** Отдельный пункт в `happ_subscription_menu` (рядом с "Настройки HAPP"). НЕ интегрировать в `happ_settings_menu` — у того другой формат (env-file через `_happ_edit_field`), а announce — отдельный plain-text файл.
- **Plan 8.3 scope:** Отдельный третий план в Phase 8 — три плана в фазе: 8.1 (SNI + probe-test + Vision Seed + announce), 8.2 (bypass routing), 8.3 (AdGuard cleanup). Чистое разделение ответственности.
- **AdGuard cleanup поведение:** Force uninstall при `xrayebator update` + удаление кода menu-пункта 7. При detect `/opt/AdGuardHome/` — explain "AdGuard Home убирается как deprecated (косячный/дырявый в прошлых релизах)" + автоматический uninstall (`systemctl stop AdGuardHome && rm -rf /opt/AdGuardHome` + clean DNS-config refs если есть). CLAUDE.md обновляется (убрать секцию Add-on services).
- **Risk acceptance:** Force-uninstall может сломать установки юзеров, активно использующих AdGuard как локальный DNS. Принимается — фича deprecated, юзеры на v1.0 не должны были на неё рассчитывать в v2.0.

### Claude's Discretion

- Точный текст promptов / warningов / banner-сообщений (русский язык, тон из CLAUDE.md проекта).
- Layout pretty-table в `probe-test` (column widths, выравнивание).
- Точный порядок групп в granular bypass multi-select.
- Логика DNS-cleanup при AdGuard uninstall (вернуть Xray DNS на дефолт vs обнулить).
- Минимальная версия Xray-core для testpre/testseed (research выяснит).
- Reusable helper'ы (например, общий `_select_groups_from_bundle` для bypass UI).

</decisions>

<specifics>
## Specific Ideas

- **probe-test как `sudo xrayebator update`:** Standalone CLI команда, реиспользует паттерн из Phase 5 (CLI dispatch через `case "$1" in update) ... probe-test) ... esac` в обёртке после source-guard).
- **KNOWN_DEFAULTS_v1 set:** Хардкод bash-массива в xrayebator с комментарием "SNI shipped в v1.0 — миграции v2.0+ могут перетасовывать только эти". Облегчает будущие SNI-миграции (известно что трогать).
- **SNI-conflict detection:** Чекать против `jq -r '.[].streamSettings.realitySettings.serverNames[]' /usr/local/etc/xray/profiles/*.json` + хардкод-список Reality дефолтов. Reuse через helper `_sni_in_use(domain) -> 0/1`.
- **Hard block для SNI conflict:** Соответствует "fail safe" принципу из CLAUDE.md (root cause через предотвращение, не через bypass). Полностью убирает класс багов "user не понял warning и сломал handshake".
- **AdGuard cleanup в update.sh:** Лучшее место для detection — inline в `update.sh` после safe-pattern, перед migration loop. Один раз, тихий и предсказуемый.

</specifics>

<deferred>
## Deferred Ideas

- **cron-based periodic probe-test** — автоматический мониторинг SNI с email/log alert. Phase 9+ или v2.1.
- **probe-test --json output** — для интеграций / dashboards. v2.1.
- **Bypass routing presets через subscription** — экспортировать bypass list клиентам через HAPP subscription. Может быть отдельной фичей в v2.1.
- **Vision Seed UI advisor** — автоподбор testpre/testseed на основе client fingerprint. Research-heavy, defer.
- **AdGuard replacement** — встроенный DNS-фильтр через Xray DNS rules. Phase 9+ если будет user demand.
- **Multi-line HAPP announce с markdown** — если HAPP сделает rich-text rendering. Wait-for-upstream feature.

</deferred>

---

*Phase: 08-polish-sni-vision-bypass-routing*
*Context gathered: 2026-05-12*
