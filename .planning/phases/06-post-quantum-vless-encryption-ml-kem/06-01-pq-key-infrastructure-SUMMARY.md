---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 01
subsystem: pq-key-infrastructure
tags: [phase-06, post-quantum, vlessenc, mlkem768, install-sh, migration]
dependency-graph:
  requires:
    - "Xray-core >= 25.9.5 (PR #5078 — vlessenc subcommand)"
    - "Phase 5 install.sh latest stable Xray-core fetch"
    - "run_migration helper (Phase 4 three-valued contract)"
  provides:
    - "/usr/local/etc/xray/.vless_decryption — PQ decryption строка для inbound.settings.decryption (Plan 6.2)"
    - "/usr/local/etc/xray/.vless_encryption — PQ encryption строка для encryption= в vless:// URL (Plan 6.2)"
    - "VLESS_DECRYPTION_FILE / VLESS_ENCRYPTION_FILE constants в xrayebator"
    - "_migrate_mlkem_keys миграция для v1.0-апгрейда"
  affects:
    - "install.sh: новый блок [5b/10] между x25519 и cat > config.json"
    - "xrayebator: константы (line 25-26) + миграция (line 990+) + registration (line 1376)"
tech-stack:
  added:
    - "xray vlessenc (no flags) — генератор PQ key pairs"
  patterns:
    - "3-layer parser: section-aware awk → mlkem-shape grep fallback → ^mlkem768x25519plus\\. validator"
    - "printf %s без \\n — JSON-friendly content для cat в add_inbound (Plan 6.2)"
    - "xray version semver comparison (major/minor/patch via cut)"
key-files:
  created:
    - "(runtime) /usr/local/etc/xray/.vless_decryption (chmod 600 xray:xray)"
    - "(runtime) /usr/local/etc/xray/.vless_encryption (chmod 600 xray:xray)"
    - "(runtime) /usr/local/etc/xray/.mlkem_keys_generated (migration marker)"
  modified:
    - "install.sh (+58 lines, vlessenc generation block after x25519)"
    - "xrayebator (+90 lines, 2 constants + _migrate_mlkem_keys fn + registration)"
decisions:
  - "Field-research parser embedded directly: section маркер `Authentication: ML-KEM-768`, awk -F'\"' {print $4}, no -mode flag"
  - "Минимальная версия Xray-core 25.9.5 (PR #5078), а не 25.3 как в RESEARCH §10"
  - "Миграция возвращает 1 (no-op/mark) на success — config.json не мутирует, restart не нужен"
  - "Парсер дублируется install.sh ↔ _migrate_mlkem_keys (sync контракт ради избежания source-инга xrayebator из install.sh)"
metrics:
  duration: "19 min"
  tasks: 3
  files-modified: 2
  files-created: 0
  commits: 2
  lines-added: 148
  completed: "2026-05-10"
---

# Phase 6 Plan 1: Post-Quantum Key Infrastructure Summary

PQ key pair (mlkem768x25519plus.native) генерируется через `xray vlessenc` без флагов в install.sh после x25519 блока, парсится section-aware awk-фильтром по маркеру `Authentication: ML-KEM-768` и сохраняется в два chmod 600 xray-owned файла (`.vless_decryption`, `.vless_encryption`); миграция `.mlkem_keys_generated` догенерирует те же файлы на v1.0-апгрейде с версионным гард-чеком ≥ 25.9.5.

## Что сделано

### install.sh — vlessenc generation block (Task 2)

Между `chmod 644 "$PUBLIC_KEY_FILE"` (строка 483) и `cat > "$CONFIG_FILE"` (новая 543) добавлен блок `[5b/10] Генерация VLESS Encryption ключей`:

- **Запуск:** `/usr/local/bin/xray vlessenc 2>&1` без флагов
- **Layer 1 (primary):** awk секционный парсер выбирает `decryption`/`encryption` ИЗ секции `Authentication: ML-KEM-768` — гарантирует, что мы НЕ берём первую (X25519, не-PQ) пару
- **Layer 2 (fallback):** если section labels исчезнут в будущем релизе — `grep -oE 'mlkem768x25519plus\.[^"[:space:]]+'` + `tail -2` (последняя пара = ML-KEM-768)
- **Layer 3 (validator):** оба ключа должны начинаться с `mlkem768x25519plus.`, иначе `exit 1` с диагностикой
- **Persistence:** `printf "%s" > file` (без trailing `\n` — критично для Plan 6.2 `cat $FILE` в jq), `chmod 600`, `chown xray:xray`

### xrayebator — constants (Task 2)

После `PUBLIC_KEY_FILE="/usr/local/etc/xray/.public_key"` (line 24) добавлены:

```bash
VLESS_DECRYPTION_FILE="/usr/local/etc/xray/.vless_decryption"
VLESS_ENCRYPTION_FILE="/usr/local/etc/xray/.vless_encryption"
```

### xrayebator — `_migrate_mlkem_keys` (Task 3)

Новая функция после `migrate_xmux_explicit_2026`, идентичный 3-layer парсер. Особенности:

- **Idempotent no-op:** если оба файла уже существуют и валидны — `return 1` (marker ставится без работы)
- **Version guard:** парсит `Xray X.Y.Z` через `grep -oE 'Xray [0-9]+\.[0-9]+\.[0-9]+'` + `cut -d.`, сравнивает major/minor/patch против 25.9.5 (semver-style). Если меньше — `return 2` (marker НЕ ставится → миграция повторится при следующем запуске)
- **Three-valued contract соблюдён:**
  - `1` = done (already-have ИЛИ generated-now) — marker ставится, restart НЕ вызывается
  - `≥2` = fail (version too low ИЛИ vlessenc rc≠0 ИЛИ парсер не справился) — marker НЕ ставится

Регистрация в `main_menu()`:

```bash
run_migration "mlkem_keys_generated" "PQ ключи VLESS Encryption (mlkem768x25519plus)" _migrate_mlkem_keys
```

Хронологически после `xmux_explicit_2026` (Phase 6 → после Phase 5).

## Подтверждённый формат `xray vlessenc` stdout

Field research (см. `06-FIELD-RESEARCH-vlessenc.md`) на Xray 26.2.6 даёт 9-строчный вывод:

```
Choose one Authentication to use, do not mix them. Ephemeral key exchange is Post-Quantum safe anyway.

Authentication: X25519, not Post-Quantum
"decryption": "mlkem768x25519plus.native.600s.<base64-43>"
"encryption": "mlkem768x25519plus.native.0rtt.<base64-43>"

Authentication: ML-KEM-768, Post-Quantum
"decryption": "mlkem768x25519plus.native.600s.<base64-~140>"
"encryption": "mlkem768x25519plus.native.0rtt.<base64-~2000>"
```

Парсер обоих копий (install.sh + _migrate_mlkem_keys) выбирает ВТОРУЮ пару (PQ-auth) через секционный маркер, как обещано REQ-A01.

## Deviations от RESEARCH §10

Все 4 расхождения уже задокументированы в `06-FIELD-RESEARCH-vlessenc.md` и в STATE.md. План 6.1 был перевыпущен с учётом этих расхождений до начала исполнения. В этом исполнении:

| RESEARCH §10 предполагал | Реальность 26.2.6 | Действие в коде |
| --- | --- | --- |
| Флаг `-mode native` выбирает PQ-режим | Флаг не существует (`flag provided but not defined: -mode`) | Запуск без флагов |
| `decryption: <value>` (plain) | `"decryption": "<value>"` (JSON-fragment) | awk -F'"' {print $4} |
| Одна пара на запуск | Две пары: X25519 + ML-KEM-768 | Section-aware фильтр по `^Authentication: ML-KEM-768` |
| mode выбирается флагом | mode `native` зашит в значение | Сохраняем строку as-is |

Никаких новых deviations при имплементации не возникло.

## Auth gates / архитектурные изменения

Никаких. Все 3 task'а выполнены без блоков (deviation Rules 1-4 не применялись).

## Sync контракт между install.sh и _migrate_mlkem_keys

Парсер vlessenc продублирован в обоих местах. Это технический долг ради избежания source-инга xrayebator из install.sh — изменения в формате `xray vlessenc` потребуют синхронной правки обеих копий.

## Что дальше

**Plan 6.2** теперь может ASSUME-ить:
- `cat $VLESS_DECRYPTION_FILE` возвращает валидную `mlkem768x25519plus.native.600s.<base64>` строку без trailing `\n`
- `cat $VLESS_ENCRYPTION_FILE` — аналогично, длинная (~2KB)
- Файлы существуют на любой свежей установке (через install.sh) и на любом v1.0-апгрейде с Xray-core ≥ 25.9.5 (через миграцию)
- Если файлов нет — Plan 6.2 add_inbound даёт явный error (это его responsibility)

## Self-Check: PASSED

Verified:
- install.sh имеет блок `xray vlessenc` (no flags), грep по `mlkem768x25519plus` совпадает
- xrayebator содержит обе константы и функцию `_migrate_mlkem_keys`
- `bash -n install.sh xrayebator update.sh` → exit 0
- Commits eeb1e72 + df6ba7f присутствуют в `git log`
- Регистрация миграции в main_menu идёт ПОСЛЕ xmux_explicit_2026 (хронологический порядок)
- Версия-чек 25.9.5 enforced через major/minor/patch comparison
