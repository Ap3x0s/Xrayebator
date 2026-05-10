---
title: "Field research: реальный stdout формат `xray vlessenc` (Xray 26.2.6)"
date: 2026-05-10
context: "Plan 6.1 Task 1 mandatory blocking checkpoint"
test_environment: "Local dev machine (Manjaro/Arch), /usr/bin/xray"
xray_version: "Xray 26.2.6 (12ee51e, go1.25.7 linux/amd64)"
status: "verified — used to drive Phase 6.1 parser adaptation"
---

# Field research: `xray vlessenc` stdout format

## TL;DR

RESEARCH §10 предполагал формат `decryption: <value>` (plain, как `xray x25519` v25.8) с флагом `-mode native` для выбора режима. **Реальный формат — JSON-fragment с двумя парами ключей** (X25519-auth + ML-KEM-768-auth), `-mode` флага не существует, mode `native` зашит в значение строки.

Все 3 версии плана 6.1 (`bash -n` checks, парсеры install.sh + миграции) написаны в расчёте на формат RESEARCH §10 → не сматчат реальный stdout. **Парсер требует адаптации до выполнения Tasks 2-3.**

## Capture: `xray vlessenc` (no flags)

Exit code: 0. Stdout 9 строк:

```
Choose one Authentication to use, do not mix them. Ephemeral key exchange is Post-Quantum safe anyway.

Authentication: X25519, not Post-Quantum
"decryption": "mlkem768x25519plus.native.600s.2Dg3XG7WfLBrtVBDC44N9XIPRlWfHfpIEOQbOvrI8G4"
"encryption": "mlkem768x25519plus.native.0rtt.v_4LPVLYv0vMA-ZiTbZLawjb0IxaO5XJ3Gmxid6KoSY"

Authentication: ML-KEM-768, Post-Quantum
"decryption": "mlkem768x25519plus.native.600s.8-l4elxMshnNiPefuZK...<длинная>"
"encryption": "mlkem768x25519plus.native.0rtt.HjiolKgYBfcKHtMXln...<очень длинная>"
```

Полный capture с длинными значениями: `/tmp/vlessenc-default.txt` (2130 bytes, может быть удалён tmp-cleanup).

## Capture: `xray vlessenc -mode native`

```
flag provided but not defined: -mode
usage: xray vlessenc
Run 'xray help vlessenc' for details.
```

Exit code: ≠ 0 (probably 2). **Флаг `-mode` не существует в этой версии CLI.**

## Capture: `xray help vlessenc`

```
usage: xray vlessenc

Generate decryption/encryption json pair (VLESS Encryption).
```

**Никаких флагов вообще не задокументировано.**

## Анализ значений

| Поле | Префикс | Mode | TTL/0rtt | Base64 payload |
|------|---------|------|----------|----------------|
| X25519 decryption | `mlkem768x25519plus.` | `native` | `.600s.` (TTL 600s) | короткий (43 chars) |
| X25519 encryption | `mlkem768x25519plus.` | `native` | `.0rtt.` | короткий (43 chars) |
| ML-KEM-768 decryption | `mlkem768x25519plus.` | `native` | `.600s.` (TTL 600s) | длинный (~140 chars) |
| ML-KEM-768 encryption | `mlkem768x25519plus.` | `native` | `.0rtt.` | очень длинный (~2000 chars) |

**Mode `native` зашит в значение** — Xray генерирует обе пары в этом режиме, никакого выбора через CLI нет. [v2.0 D1 — `mlkem768x25519plus.native`] решение остаётся в силе, просто он не флагом выбирается.

**TTL/0rtt-маркеры:**
- `decryption` всегда содержит `.<TTL>s.` (в данном случае `.600s.`) — TTL ключа на сервере
- `encryption` всегда содержит `.0rtt.` — клиент использует 0-RTT при подключении

**Размер ML-KEM-768 encryption** ~2000 символов — это больше чем comfort-zone многих QR-кодеров и URL-парсеров. Plan 6.2 должен это учесть при формировании vless:// URL: encryption=<2KB строка> в URL может ломать display/copy в некоторых клиентах.

## Расхождения с RESEARCH §10 (4 критичных)

| # | RESEARCH §10 | Реальность 26.2.6 | Severity |
|---|---|---|---|
| 1 | Флаг `-mode native` выбирает PQ-режим | Флаг не существует, выход с ошибкой | HIGH — install.sh упадёт |
| 2 | Формат `decryption: <value>` (plain lowercase) | `"decryption": "<value>"` (JSON-fragment, ключ И значение в кавычках) | HIGH — Layer 1 awk не сматчит |
| 3 | Одна пара `decryption`/`encryption` на запуск | **Две пары:** X25519 (не-PQ) + ML-KEM-768 (PQ) | CRITICAL — Layer 2 grep `mlkem768x25519plus\.` найдёт **4 строки**, `sed -n '1p; 2p'` возьмёт X25519-пару (не-PQ) → REQ-A01 нарушено |
| 4 | mode выбирается флагом → значение чистое | mode `native` + TTL `.600s.` + `.0rtt.` зашиты в значение строки | LOW — encryption= query param должен передаваться целиком как есть |

## Интересный факт про X25519-пару

Первая пара (`Authentication: X25519, not Post-Quantum`) **тоже** использует префикс `mlkem768x25519plus.` — потому что cipher suite та же, разница только в эфемерном key exchange:
- X25519 pair: классический X25519 для эфемерных ключей (быстрее, но НЕ post-quantum для эфемеров; key store в `mlkem768x25519plus.` cipher suite)
- ML-KEM-768 pair: ML-KEM-768 для эфемеров (медленнее, но post-quantum)

`Choose one Authentication to use, do not mix them` — Xray предлагает выбор. Для Phase 6 нам нужна **вторая** (PQ) пара.

⚠️ **Ловушка:** наивный grep `mlkem768x25519plus\.` найдёт обе пары → попадание на не-PQ ключи. Парсер ОБЯЗАН различать пары через секционный маркер `Authentication: ML-KEM-768`.

## Влияние на план 6.1

**Plan 6.1 Task 2 (install.sh vlessenc-блок):**
- Убрать `-mode native` флаг
- Layer 1 заменить на awk секционный парсер (`/^Authentication: ML-KEM-768/,0` → `awk -F'"' '/^"decryption":/ {print $4; exit}'`)
- Layer 2 fallback: `grep -oE 'mlkem768x25519plus\.[^"[:space:]]+' | sed -n '3p; 4p'` (строки 3-4 = ML-KEM-768 пара)

**Plan 6.1 Task 3 (`_migrate_mlkem_keys`):**
- Те же три изменения, что в Task 2

**Plan 6.1 verify steps:**
- Заменить ожидание формата `decryption: ` на `"decryption": "...`
- Добавить assertion что выбранные ключи именно из ML-KEM-768 секции (не X25519)

## Влияние на план 6.2

**`generate_connection` для XHTTP+PQ vless URL:**
- `encryption=` query param должен содержать **полную строку** включая префиксы `mlkem768x25519plus.native.0rtt.<base64>`
- URL-encode через `jq -r @uri` обязателен (длинные base64 могут содержать `_` и `-` из URL-safe alphabet, plus сами символы `.`)
- ⚠️ ~2KB длина encryption= → vless:// URL получится ~2.5KB. Проверить как HAPP/v2rayNG это обрабатывают (особенно при QR-кодировании — QR с >1.5KB требуют version 40 + ECC L)

## Открытые вопросы для повторного research

1. **Версия Xray на проде vs локально:** на VPS может быть 25.3.x (Phase 5 апгрейдил до 25.3+, но не до 26.x). Изменился ли формат stdout `xray vlessenc` между 25.3 и 26.2.6? Возможно, `-mode` флаг был в 25.3 и убран в 26.x.
   - Проверить: changelog XTLS/Xray-core между 25.3.0 и 26.2.6
   - Проверить: есть ли в 25.3 двойная X25519/ML-KEM выдача или одна пара

2. **TTL `.600s.` в decryption:** что произойдёт через 600 секунд? Сервер ротирует ключ? Клиент должен переподключиться? Если TTL — короткоживущий, нужна периодическая перегенерация (cron-job?). Plan 6.1 не учитывает.

3. **ML-KEM-768 encryption size ~2KB:** это normal или у нас редкий long-tail? Сравнить с другими генерациями.

4. **`xtls-rprx-vision` flow совместим с PQ?** В Plan 6.2 XHTTP+PQ означает что flow=`""` (XHTTP не использует Vision). А что если юзер хочет TCP+Vision+PQ? Возможно ли вообще?

## Артефакты

- `/tmp/vlessenc-default.txt` — полный capture (может быть удалён, скопирован в этот файл выше)
- `/tmp/vlessenc-help.txt` — `xray help vlessenc`
- `/tmp/vlessenc-native.txt` — попытка с `-mode native`

## Status

- [x] Field research проведён (2026-05-10, локально, Xray 26.2.6)
- [x] Расхождения зафиксированы
- [ ] User research pending — пользователь хочет провести собственное исследование до approval адаптации
- [ ] Plan 6.1 Tasks 2-3 PAUSED (executor agent ID `a28c45e68ab503e9e` ожидает approval/директивы)
- [ ] RESEARCH §10 требует обновления (или пометки SCOPE UPDATE 2026-05-10 part 2)
