---
phase: 06-post-quantum-vless-encryption-ml-kem
verified: 2026-05-10T18:21:04Z
status: human_needed
score: 9/9 must-haves verified (automated); 4 smoke-tests outstanding (require running VPS)
re_verification: false
human_verification:
  - test: "Свежая установка install.sh на чистом Debian 12/Ubuntu 22.04 VPS"
    expected: "/usr/local/etc/xray/.vless_decryption и .vless_encryption существуют, начинаются с 'mlkem768x25519plus.', права 600, owner xray:xray; xray status = active"
    why_human: "Невозможно проверить без реального VPS — install.sh выполняет apt-install, useradd, systemctl, требует root и работающий Xray-core 25.9.5"
  - test: "Создание PQ-профиля через 'xrayebator → 1 → имя → 1' и импорт vless:// URL в HAPP/v2rayNG"
    expected: "Профиль работает, трафик идёт через VPS; URL содержит ?encryption=mlkem768x25519plus.native..."
    why_human: "Требует реального клиента, реальной сети, проверки end-to-end PQ handshake"
  - test: "v1.0→v2.0 апгрейд: на сервере с Xray-core 1.8.x и без .vless_decryption запустить xrayebator main_menu"
    expected: "Миграция .mlkem_keys_generated сначала падает с 'Обновите Xray-core' (return 2, marker не ставится), после xrayebator update — ключи генерируются, marker ставится"
    why_human: "Требует развёрнутую v1.0-инсталляцию Xrayebator с устаревшим Xray-core"
  - test: "upgrade_profile_to_pq_menu на shared inbound (2+ профилей на одном порту)"
    expected: "Warning перечисляет ВСЕ затронутые профили; после подтверждения все profile JSON получают pq_enabled:true; clients[] в config.json содержит все UUID; safe_restart_xray восстанавливает inbound; новые vless:// URL валидны"
    why_human: "Требует реальный shared-inbound сценарий, проверку ВСЕХ затронутых клиентов"
---

# Phase 6: Post-Quantum (VLESS Encryption + ML-KEM) — Verification Report

**Phase Goal:** Каждый новый XHTTP+Reality профиль ship-ит pq-инбаунд (mlkem768x25519plus.native), оператор может in-place апгрейднуть существующий профиль на PQ, видит first-run banner с матрицей совместимости клиентов и понимает что клиенты без PQ-поддержки нужно обслуживать через отдельный legacy-профиль (TCP+Vision), создаваемый через `create_profile_menu`.

**Verified:** 2026-05-10T18:21:04Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Свежая установка генерирует PQ-ключи через `xray vlessenc` (mlkem768x25519plus pair) с chmod 600 / xray:xray | ? UNCERTAIN | install.sh:485-535 содержит блок [5b/10] с правильным парсером и permissions; на работающем VPS не проверял |
| 2 | v1.0-апгрейд: миграция `.mlkem_keys_generated` догенерирует ключи через `_migrate_mlkem_keys` | ✓ VERIFIED | xrayebator:1002-1078 (функция), 1535 (регистрация в run_migration); зеркалит install.sh парсер с тем же 3-layer fallback |
| 3 | Если Xray-core < 25.9.5 — миграция возвращает 2, marker не ставится | ✓ VERIFIED | xrayebator:1015-1032 — semver сравнение через cut, return 2 если < 25.9.5; run_migration helper (Phase 4) обрабатывает return ≥2 как fail |
| 4 | Константы `VLESS_DECRYPTION_FILE` и `VLESS_ENCRYPTION_FILE` объявлены рядом с PRIVATE_KEY_FILE | ✓ VERIFIED | xrayebator:25-26 |
| 5 | `add_inbound()` для XHTTP пишет `decryption` в `inbound.settings` (не в clients[]) | ✓ VERIFIED | xrayebator:2086-2089 — `"settings": { "clients": [...], "decryption": "$vless_decryption" }` |
| 6 | `generate_connection()` для XHTTP+pq добавляет URL-encoded `encryption=` в vless:// | ✓ VERIFIED | xrayebator:2320-2323 — `jq -nr --arg enc ... '$enc\|@uri'`; vless URL содержит `?encryption=${encoded_encryption}` |
| 7 | `create_profile_menu()` пункт #1 = XHTTP+PQ, #4 = TCP+Vision (legacy) | ✓ VERIFIED | xrayebator:1646-1668; case 1=xhttp, case 4=tcp; пункты 2 (tcp-mux), 3 (grpc), 5 (tcp-utls), 6 (tcp-xudp) — middle |
| 8 | Migration `.xhttp_default_2026` строго no-op (не трогает config.json) | ✓ VERIFIED | xrayebator:1086-1090 — только `echo` + `return 1`; никаких safe_jq_write вызовов в теле |
| 9 | `upgrade_profile_to_pq_menu()` IN-PLACE заменяет transport+settings, сохраняя UUID и port; H1 fix: short_id читается из config.json | ✓ VERIFIED | xrayebator:3116-3359; короткий id берётся из `.streamSettings.realitySettings.shortIds[0]` (xrayebator:3179-3191), UUID сохраняется (3174, 3262), port не меняется (3173, 3259) |
| 10 | Warning перед мутацией: перечислены последствия (URL стопает, clients/UUID/port/SNI preservation, shared-inbound массовость) | ✓ VERIFIED | xrayebator:3196-3225 — 3 блока (общие последствия / совместимость клиентов / shared-inbound enumeration) |
| 11 | Profile JSON получает `schema_version=2`, `pq_enabled=true`; НЕТ `uuid_legacy`/`port_legacy` | ✓ VERIFIED | xrayebator:1781 (create_profile), 3336 (upgrade_profile); grep по `uuid_legacy\|port_legacy` — пусто |
| 12 | `show_pq_banner_once()` существует, вызван из main_menu prologue, баннер one-shot via marker | ✓ VERIFIED | xrayebator:1466-1517 (функция), 1554 (вызов в main_menu prologue); marker `/usr/local/etc/xray/.pq_banner_shown` |
| 13 | Banner содержит матрицу совместимости 2026-05-10 (HAPP, v2rayNG, v2rayN, Shadowrocket ✓; sing-box, Hiddify, mihomo, NekoBox ✗; Streisand ?) | ✓ VERIFIED | xrayebator:1485-1497 — все клиенты перечислены с правильными метками |
| 14 | REQ-A07 не реализован (нет parallel-inbound кода, нет port_legacy/uuid_legacy в profile JSONs) | ✓ VERIFIED | grep -nEi "REQ-A07\|port_legacy\|uuid_legacy\|parallel.*inbound" по xrayebator/install.sh/update.sh — пусто |
| 15 | bash -n проходит для xrayebator, install.sh, update.sh | ✓ VERIFIED | Все три скрипта прошли syntax check |
| 16 | Sync-test (`validation/test-update-xray-core-sync.sh`) проходит | ✓ VERIFIED | Все 4 функции (`update_xray_core`, `_fetch_latest_tag`, `_print_manual_install_hint`, `_cleanup_xray_backups`) идентичны в 3 файлах |
| 17 | gsd validate health = healthy | ✓ VERIFIED | Output: `"status": "healthy", "errors": [], "warnings": []` |

**Score:** 9/9 must-haves автоматически верифицированы (16/17 truth statements; 1 uncertain — требует свежей VPS-установки).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `install.sh` | vlessenc-блок после x25519 (~line 484), без `-mode native` флага, section-aware ML-KEM-768 parser | ✓ VERIFIED | install.sh:485-535; вызов `xray vlessenc` (no flags); 3-layer parser (awk section + grep mlkem-shape fallback + ^mlkem regex validator) |
| `xrayebator` (constants) | `VLESS_DECRYPTION_FILE`, `VLESS_ENCRYPTION_FILE` рядом с PRIVATE_KEY_FILE | ✓ VERIFIED | xrayebator:25-26 |
| `xrayebator` (_migrate_mlkem_keys) | Функция + регистрация в main_menu, version-guard ≥25.9.5 | ✓ VERIFIED | xrayebator:1002-1078 (функция); 1535 (run_migration call); 1015-1032 (semver guard) |
| `xrayebator` (_migrate_xhttp_default_2026) | Строго no-op для config.json | ✓ VERIFIED | xrayebator:1086-1090 — только echo + return 1 |
| `xrayebator` (add_inbound XHTTP path) | `decryption` пишется в `inbound.settings` (не clients[]) | ✓ VERIFIED | xrayebator:2086-2089 |
| `xrayebator` (generate_connection XHTTP+pq) | URL-encoded encryption= через jq @uri | ✓ VERIFIED | xrayebator:2320-2323 |
| `xrayebator` (create_profile_menu) | #1 XHTTP+PQ, #4 TCP+Vision legacy | ✓ VERIFIED | xrayebator:1646-1705 |
| `xrayebator` (upgrade_profile_to_pq_menu) | IN-PLACE, preserves UUID+port, short_id из config.json | ✓ VERIFIED | xrayebator:3116-3359; H1 fix верифицирован (3179-3191) |
| `xrayebator` (show_pq_banner_once) | Функция + вызов в main_menu prologue + marker | ✓ VERIFIED | xrayebator:1466-1517, 1554 |
| Plan SUMMARYs | Все 3 SUMMARY.md существуют | ✓ VERIFIED | 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md |

---

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| install.sh post-x25519 | .vless_decryption + .vless_encryption | xray vlessenc + section-aware parser + printf > file | ✓ WIRED | install.sh:485-532 |
| xrayebator main_menu() | _migrate_mlkem_keys via run_migration | run_migration "mlkem_keys_generated" ... | ✓ WIRED | xrayebator:1535 |
| _migrate_mlkem_keys | Xray version check ≥25.9.5 | xray version + semver compare | ✓ WIRED | xrayebator:1015-1032 |
| add_inbound() XHTTP | $VLESS_DECRYPTION_FILE | cat → подстановка в settings.decryption heredoc | ✓ WIRED | xrayebator:1871, 2088 |
| generate_connection() XHTTP+pq | $VLESS_ENCRYPTION_FILE | cat → jq @uri → ?encryption=${encoded} | ✓ WIRED | xrayebator:2321-2323 |
| create_profile_menu() | create_profile с transport=xhttp | case 1) → xhttp как PQ-default | ✓ WIRED | xrayebator:1686 |
| main_menu migrations | _migrate_xhttp_default_2026 | run_migration "xhttp_default_2026" ... | ✓ WIRED | xrayebator:1536 |
| main_menu case 8 | upgrade_profile_to_pq_menu | case 8) upgrade_profile_to_pq_menu ;; | ✓ WIRED | xrayebator:1608 |
| upgrade_profile_to_pq_menu | safe_jq_write + safe_restart_xray | inplace replace + рестарт | ✓ WIRED | xrayebator:3317-3346 |
| upgrade_profile_to_pq_menu XHTTP write | $VLESS_DECRYPTION_FILE | VLESS_DECRYPTION=$(cat ...) → подстановка | ✓ WIRED | xrayebator:3243-3244, 3263 |
| main_menu prologue | show_pq_banner_once | прямой вызов после миграций | ✓ WIRED | xrayebator:1554 |
| show_pq_banner_once | /usr/local/etc/xray/.pq_banner_shown | [[ -f marker ]] && return; touch marker | ✓ WIRED | xrayebator:1467-1515 |
| upgrade_profile_to_pq_menu output | generate_connection (новый PQ vless URL) | вызов после рестарта | ✓ WIRED | xrayebator:3355 |
| upgrade_profile_to_pq_menu shortIds | config.json `.inbounds[].streamSettings.realitySettings.shortIds[0]` | jq read из существующего инбаунда (H1 critical fix) | ✓ WIRED | xrayebator:3179-3186 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-A01 | 06-01 | install.sh после x25519 вызывает `xray vlessenc`, парсит, сохраняет 600/xray:xray | ✓ SATISFIED (auto) / ? (smoke) | install.sh:485-532; permissions/ownership на свежей VPS-установке требуют ручной проверки |
| REQ-A02 | 06-01 | Migration `.mlkem_keys_generated` для v1.0-апгрейда | ✓ SATISFIED | xrayebator:1002-1078, 1535 |
| REQ-A03 | 06-01 | Константы VLESS_DECRYPTION_FILE / VLESS_ENCRYPTION_FILE | ✓ SATISFIED | xrayebator:25-26 |
| REQ-A04 | 06-02 | add_inbound XHTTP пишет decryption из файла в settings.decryption | ✓ SATISFIED | xrayebator:2086-2089 |
| REQ-A05 | 06-02 | generate_connection PQ-профилей включает encryption= URL-encoded | ✓ SATISFIED | xrayebator:2320-2323 (jq @uri) |
| REQ-A06 | 06-02 | create_profile_menu дефолт XHTTP+PQ, TCP+Vision как legacy | ✓ SATISFIED | xrayebator:1646 (#1 PQ), 1664 (#4 Vision) |
| ~~REQ-A07~~ | — | DROPPED 2026-05-10 (parallel inbound на одном порту невозможен в Xray) | ✓ DROPPED | Не присутствует ни в одном plan's `requirements:`; в коде нет `port_legacy`/`uuid_legacy`/parallel-inbound логики |
| REQ-A08 | 06-02 | Migration `.xhttp_default_2026` обновляет ТОЛЬКО default-template, не трогает inbounds | ✓ SATISFIED | xrayebator:1086-1090 — строгий no-op (только echo + return 1) |
| REQ-A09 (REVISED) | 06-03 | In-place upgrade button с warning, сохраняет UUID+port, без parallel-inbound | ✓ SATISFIED | xrayebator:3116-3359 (полная функция); H1 fix (short_id из config.json) проверен |
| REQ-A10 | 06-03 | First-run banner с матрицей совместимости, one-shot via marker | ✓ SATISFIED | xrayebator:1466-1517, 1554 |

**Coverage: 9/9 active requirements** (A01, A02, A03, A04, A05, A06, A08, A09 REVISED, A10) cross-referenced между plans и REQUIREMENTS.md. REQ-A07 корректно отсутствует.

**Orphans:** ROADMAP.md и REQUIREMENTS.md явно мапят 9 active reqs на Phase 6 (REQ-A07 DROPPED). Plans покрывают все 9 — orphans отсутствуют.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | — | — | Нет blocker/warning anti-patterns в Phase 6 коде |

Проверка `TODO|FIXME|XXX|HACK|PLACEHOLDER|placeholder|coming soon` в ключевых функциях фазы (install.sh:485-535, xrayebator:1002-1090, 1466-1517, 1850-2120, 3116-3359) — пусто.

Информационные observations (не blocker):

| File | Line | Observation | Severity |
|---|---|---|---|
| xrayebator:1697-1701 | Hidden xorpub case в create_profile_menu предупреждает "xorpub-генерация — backlog (defer to v2.1)" — implementation falls through to `native` | ℹ️ Info | Документированный hidden advanced opt-in, не блокирует goal |
| xrayebator:3187-3191 | Fallback `openssl rand -hex 8` для short_id ЕСЛИ inbound corrupted (без shortIds) | ℹ️ Info | Last-resort safety net, в нормальном flow не срабатывает (install.sh всегда пишет shortIds); комментарий явно объясняет |

---

### Human Verification Required

Все automated checks прошли. 4 smoke-теста требуют живого окружения для финальной валидации:

#### 1. Свежая установка install.sh на чистом VPS
**Test:** Развернуть Debian 12 / Ubuntu 22.04 VPS, запустить `bash install.sh`, дождаться завершения.
**Expected:**
- `/usr/local/etc/xray/.vless_decryption` существует, начинается с `mlkem768x25519plus.`, `chmod 600`, `chown xray:xray`
- `/usr/local/etc/xray/.vless_encryption` идентично
- `systemctl status xray` = active
- `bash -n` всех скриптов проходит до запуска

**Why human:** install.sh выполняет apt install, useradd, systemctl, требует root и работающий Xray-core 25.9.5; не воспроизводимо локально без VPS.

#### 2. End-to-end PQ-профиль с реальным клиентом
**Test:** На VPS из теста #1 запустить `xrayebator → 1 → имя → 1 (XHTTP+PQ)`. Скопировать сгенерированную vless:// URL. Импортировать в HAPP 2.10+ или v2rayNG 1.10+. Подключиться. Открыть https://ifconfig.me.
**Expected:**
- Профиль создан, vless URL содержит `?encryption=mlkem768x25519plus.native...`
- Клиент успешно подключается, IP в ifconfig.me = IP VPS
- Xray journalctl без ошибок handshake

**Why human:** Требует реального PQ-капабельного клиента, реальной сети, проверки PQ handshake end-to-end.

#### 3. v1.0→v2.0 апгрейд: миграция .mlkem_keys_generated
**Test:** На сервере с устаревшим Xray-core (например 1.8.x) и без `.vless_decryption` запустить `xrayebator` (главное меню).
**Expected:**
- Миграция `.mlkem_keys_generated` падает с message "✗ Xray-core < 25.9.5 — vlessenc недоступен", marker НЕ ставится
- После `xrayebator update` (Phase 5 update_xray_core) и повторного запуска — миграция успешно генерирует ключи, marker `/usr/local/etc/xray/.mlkem_keys_generated` ставится
- Файлы ключей имеют те же права/owner, что в install.sh

**Why human:** Требует развёрнутую v1.0-инсталляцию Xrayebator с устаревшим Xray-core; локально не воспроизвести.

#### 4. upgrade_profile_to_pq_menu на shared inbound (массовость)
**Test:** На VPS создать 2 TCP+Vision профиля на одном порту (`port=4443`, разные UUIDs). Запустить `xrayebator → 8 (Обновить до PQ) → выбрать первый профиль`.
**Expected:**
- Warning явно перечисляет ОБА профиля как затронутые
- После confirmation: ОБА profile JSON получают `pq_enabled:true`, `transport:"xhttp"`, `schema_version:2`, `xhttp_path:...`
- В config.json inbound на порту 4443 имеет `network:"xhttp"`, `decryption:"mlkem768x25519plus..."`, `clients[]` содержит ОБА UUID
- safe_restart_xray проходит, Xray слушает порт 4443 с XHTTP+PQ
- Новые vless URL для обоих профилей валидны и работают в HAPP/v2rayNG

**Why human:** Требует реальный shared-inbound сценарий + проверку всех затронутых клиентов; критический test для массовой/необратимой операции.

---

### Gaps Summary

**Gaps НЕ найдены.** Все 9 активных требований Phase 6 (REQ-A01-A06, A08, A09 REVISED, A10) удовлетворены кодом. REQ-A07 корректно DROPPED — не присутствует ни в одном плане, нет parallel-inbound логики или `port_legacy`/`uuid_legacy` полей в profile JSON.

**Critical fixes verified:**
- ✓ H1 fix: `short_id` в `upgrade_profile_to_pq_menu()` читается из `config.json:.inbounds[].streamSettings.realitySettings.shortIds[0]` (xrayebator:3179-3186), а НЕ через `openssl rand -hex 8`. Это критично для shared inbound — иначе Reality бы порвал ВСЕ остальные клиенты на порту.
- ✓ REQ-A04 boundary: `decryption` пишется в `inbound.settings`, НЕ в `clients[].decryption` (xrayebator:2086-2089).
- ✓ REQ-A08 strict no-op: `_migrate_xhttp_default_2026` содержит ТОЛЬКО echo + return 1 — нет `safe_jq_write` вызовов в теле, существующие inbounds не модифицируются.
- ✓ Section-aware ML-KEM-768 parser (НЕ first-pair grep — первая пара = X25519, не post-quantum) с 3-layer fallback.
- ✓ URL-encoding через `jq -r '$enc | @uri'` (research-recommended pattern).
- ✓ Атомарные коммиты `feat(06-XX):` / `docs(06-XX):` (12 коммитов фазы соответствуют паттерну).
- ✓ Sync-test проходит — `update_xray_core()` идентична в xrayebator/install.sh/update.sh.

**Why status = `human_needed`, not `passed`:**

Все automated проверки кода (структура, wiring, syntax, sync-test, gsd validate) пройдены успешно. Однако Phase 6 — это central v2.0 value (post-quantum encryption), который end-to-end доказывается ТОЛЬКО на живом VPS с реальным PQ-клиентом. 4 smoke-теста выше критичны для production-confidence перед релизом v2.0.

Если пользователь готов принять risk-based release без VPS smoke-tests (полагаясь на код-уровень верификацию), статус можно интерпретировать как `passed`. Рекомендуемое движение — выполнить хотя бы smoke-тест #1 (свежая установка) и #2 (end-to-end PQ-профиль) перед закрытием фазы.

---

_Verified: 2026-05-10T18:21:04Z_
_Verifier: Claude (gsd-verifier)_
