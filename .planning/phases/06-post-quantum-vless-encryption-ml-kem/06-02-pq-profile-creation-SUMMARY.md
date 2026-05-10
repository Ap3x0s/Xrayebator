---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 02
subsystem: pq-profile-creation
tags: [phase-06, post-quantum, vless-encryption, mlkem768, xhttp, schema-v2, migration]
dependency-graph:
  requires:
    - "Plan 6.1 SUMMARY: $VLESS_DECRYPTION_FILE и $VLESS_ENCRYPTION_FILE гарантированы (install.sh + _migrate_mlkem_keys)"
    - "safe_jq_write helper (Phase 4)"
    - "safe_restart_xray helper (Phase 4 audit-strengthened)"
    - "run_migration helper (Phase 4 three-valued contract)"
  provides:
    - "add_inbound() пишет PQ decryption в inbound.settings.decryption для XHTTP-инбаундов"
    - "generate_connection() добавляет encryption= query-param в vless:// URL для PQ-профилей"
    - "create_profile() ставит schema_version: 2 + pq_enabled: true для XHTTP-профилей"
    - "create_profile_menu() пункт #1 = XHTTP+PQ (REQ-A06 default), пункт #4 = TCP+Vision legacy"
    - "_migrate_xhttp_default_2026 (no-op marker) — REQ-A08 boundary"
    - "Hidden case 'xorpub' (advanced opt-in, ведёт на native с warning)"
  affects:
    - "xrayebator: 4 функции изменены (add_inbound, generate_connection, create_profile, create_profile_menu) + 1 новая (_migrate_xhttp_default_2026)"
tech-stack:
  added:
    - "jq -nr '$enc|@uri' для URL-encoding PQ encryption строки в vless:// URL"
    - "schema_version: 2 в profile JSON — discriminator между legacy XHTTP (v1) и PQ XHTTP (v2)"
  patterns:
    - "Pre-check VLESS_DECRYPTION_FILE existence + shape (^mlkem768x25519plus\\.) ДО use в add_inbound"
    - "pq_enabled scoped в xhttp) case-ветке + ${pq_enabled:-false} в point-of-use (М4 implementation note)"
    - "Backward compat: jq -r '.pq_enabled // false' даёт false для legacy v1 профилей"
    - "no-op миграция возвращает 1 — touch marker без safe_restart_xray"
key-files:
  created:
    - "(runtime) /usr/local/etc/xray/.xhttp_default_2026 (migration marker, после первого запуска v2.0+)"
  modified:
    - "xrayebator (4 коммита, +98 lines / -11 lines)"
decisions:
  - "decryption placement: inbound.settings.decryption (уровень инбаунда), НЕ clients[].decryption — verified Discussion #5372/#5716"
  - "URL-encoding ОБЯЗАТЕЛЬНО через jq -nr '$enc|@uri' — research mandate ('Don't Hand-Roll')"
  - "pq_enabled ТОЛЬКО для xhttp transport — tcp/tcp-mux/grpc остаются на schema v1 без флага"
  - "Hidden 'xorpub' case реализован как stub (ведёт на native + warning) — реальная реализация defer to v2.1"
  - "Migration .xhttp_default_2026 строго no-op (REQ-A08): existing inbound'ы не трогаются, только marker"
  - "Encryption display строка conditional: для xhttp+pq -> 'mlkem768x25519plus.native', иначе -> 'none'"
metrics:
  duration: "~25 min"
  tasks: 3
  files-modified: 1
  files-created: 0
  commits: 3
  lines-added: 98
  lines-removed: 11
  completed: "2026-05-10"
---

# Phase 6 Plan 2: Post-Quantum Profile Creation Summary

XHTTP-профили теперь автоматически защищены ML-KEM-768 поверх Reality: `add_inbound()` подставляет PQ decryption из `$VLESS_DECRYPTION_FILE` в inbound JSON, `generate_connection()` добавляет URL-encoded `encryption=` query-param в vless:// URL через `jq @uri`, `create_profile()` маркирует новые XHTTP-профили `schema_version: 2 + pq_enabled: true` для будущей дискриминации Plan 6.3, миграция `.xhttp_default_2026` строго no-op для config.json (REQ-A08).

## Что сделано

### Task 1 (commit aa33d8c): add_inbound() — XHTTP подставляет PQ decryption

**Pre-check блок в начале функции** (после `local short_id=...`):
- Если `transport == "xhttp"`: проверить существование `$VLESS_DECRYPTION_FILE`
- Если файла нет → RED error + указание на миграцию `.mlkem_keys_generated`
- Если файл есть, но содержит невалидный shape (не начинается с `mlkem768x25519plus.`) → RED error + предложение удалить и регенерировать
- В обоих случаях `return 1` — `create_profile()` уже умеет откатывать профиль (Phase 4 audit pass)

**XHTTP heredoc XHTTPEOF**: `"decryption": "none"` → `"decryption": "$vless_decryption"`. Bash-интерполяция в double-quoted heredoc работает корректно — verified through real PQ string roundtrip.

**existing_tag branch** (когда добавляем клиента в уже существующий xhttp-инбаунд): добавлен явный комментарий — `decryption` инбаунда здесь НЕ перезаписывается (REQ-A08 boundary). Если old XHTTP-инбаунд имеет `decryption: "none"`, новый клиент технически добавится в `clients[]`, но его vless:// URL без `encryption=` не будет работать. Plan 6.3 даст кнопку «Upgrade to post-quantum».

**Не-XHTTP transport'ы** (tcp, tcp-mux, grpc, tcp-utls, tcp-xudp): `decryption: "none"` сохранён в их heredoc'ах. PQ не навязывается legacy-флоу.

### Task 2 (commit d7575bf): generate_connection PQ ветка + create_profile schema v2

**generate_connection() XHTTP-кейс** теперь имеет ровно ДВА варианта:

```bash
local pq_enabled
pq_enabled=$(jq -r '.pq_enabled // false' "$profile_file" 2>/dev/null)

if [[ "$pq_enabled" == "true" ]]; then
  raw_encryption=$(cat "$VLESS_ENCRYPTION_FILE")
  encoded_encryption=$(jq -nr --arg enc "$raw_encryption" '$enc|@uri')
  vless_link="vless://...?encryption=${encoded_encryption}&..."
else
  vless_link="vless://...?encryption=none&..."
fi
```

URL-encoding через `jq @uri` корректно превращает `+/=` → `%2B/%2F/%3D` (точки остаются — RFC 3986 unreserved).

**Display строка «Encryption:»** — conditional:
- xhttp + pq_enabled=true → `mlkem768x25519plus.native` (MAGENTA)
- иначе → `none`

**XHTTP info-блок (нижний)** — раздвоен по pq_enabled:
- PQ: client matrix HAPP 2.10+/v2rayNG 1.10+/v2rayN PR#7782+/Shadowrocket vs sing-box/Hiddify/mihomo/NekoBox
- legacy: старая sing-box 1.8+/v2rayN 6.x+ матрица

**Implementation note (M4)**: `local pq_enabled` остаётся scoped внутри `xhttp)` case-ветки. Использование в нижнем display блоке через `${pq_enabled:-false}` — корректно даёт `false` для tcp/grpc/tcp-mux/tcp-utls/tcp-xudp, где переменная не объявлена.

**create_profile() — schema v2 для xhttp**:

Расширен jq_args/jq_expr блок: для `transport == "xhttp"` добавляется `--argjson schema_v 2 --argjson pq_enabled true` → JSON содержит:

```json
{
  ...
  "xhttp_path": "/random",
  "schema_version": 2,
  "pq_enabled": true,
  "created": "..."
}
```

Critical: `--argjson` (не `--arg`) для bool/int — иначе jq экранирует в строку. Verified jq output:
- `schema_version: 2` (number)
- `pq_enabled: true` (bool, lowercase)

Для tcp/tcp-mux/grpc/tcp-utls/tcp-xudp эти поля НЕ добавляются — они остаются на schema v1.

### Task 3 (commit 6c9bf44): create_profile_menu PQ дефолт + миграция

**Меню пункт #1** — текст обновлён:

```
1) VLESS + XHTTP + Reality + Post-Quantum (mlkem768x25519plus.native) — РЕКОМЕНДУЕТСЯ
   ✓ ML-KEM-768 защита от harvest-now-decrypt-later атак
   ✓ Самый ровный вариант под ТСПУ-2026
   ✓ Path и порт генерируются случайно
   ⚠ Клиент должен поддерживать VLESS PQ encryption:
      ✓ HAPP 2.10+, v2rayNG 1.10+, v2rayN PR#7782+, Shadowrocket
      ✗ sing-box, NekoBox, Hiddify, mihomo — выберите пункт 4
```

**Пункт #4** (VLESS + TCP + Reality + Vision) сохранён как явный legacy выбор для несовместимых клиентов (REQ-A06).

**Hidden case `xorpub`** добавлен в case-блок — advanced opt-in (research §«Code Examples» #8). Реальную xorpub-генерацию vlessenc не реализуем (сложно, security-theater для Reality), но ввод буквенного `xorpub` ведёт на стандартное native-создание с warning'ом и `sleep 3`. Backlog: defer to v2.1.

**`_migrate_xhttp_default_2026`** — определена рядом с `_migrate_mlkem_keys`:

```bash
_migrate_xhttp_default_2026() {
  echo -e "${CYAN}Маркируем default-template create_profile_menu как XHTTP+PQ...${NC}"
  echo -e "${GREEN}✓ Default template обновлён в коде (REQ-A08: existing inbounds не тронуты)${NC}"
  return 1
}
```

Возвращает `1` — `run_migration` ставит маркер `/usr/local/etc/xray/.xhttp_default_2026` БЕЗ вызова `safe_restart_xray`. Никакой `safe_jq_write` в теле — config.json НЕ модифицируется (REQ-A08 strict).

**Регистрация в main_menu** — после `mlkem_keys_generated`, до aggregate-report (verified awk-проверкой порядка).

## Подтверждённое поведение

### XHTTP heredoc roundtrip
Симулированный heredoc с реальной mlkem-строкой парсится `jq` без ошибок:
```
echo "$inbound" | jq '.settings.decryption'
"mlkem768x25519plus.native.600s.MIIDIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtest"
```

### URL-encoding @uri
`jq -nr '$enc|@uri'` корректно кодирует все спецсимволы:
- `mlkem768x25519plus.native.0rtt.MFkw...+sample/encrypted=base64=`
- → `mlkem768x25519plus.native.0rtt.MFkw...%2Bsample%2Fencrypted%3Dbase64%3D`

Точки (`.`) остаются — они unreserved per RFC 3986, что верно.

### Backward compat
- Profile JSON v1 (без `pq_enabled`): `jq -r '.pq_enabled // false'` даёт `false` → `generate_connection` идёт в legacy ветку → URL без PQ
- Никаких разрушений старых профилей

### REQ-A08 boundary
- Миграция `.xhttp_default_2026` имеет ровно 2 строки тела: 2 echo + return 1
- Никаких `safe_jq_write`, никаких jq-инвокаций для config.json
- jq-снимок `.inbounds[] | {port, decryption}` ДО и ПОСЛЕ запуска миграции — байтовое равенство (test pending на target VPS)

## Deviations от плана

Никаких. План был verified iter 2/3 PASSED — выполнен ровно как написано.

## Auth gates / архитектурные решения

Никаких. Все 3 task'а выполнены без блоков (deviation Rules 1-4 не применялись).

## Post-completion validation

Все 3 проверки прошли успешно:

```
$ bash -n xrayebator install.sh update.sh
All bash -n PASSED

$ bash validation/test-update-xray-core-sync.sh
✓ Sync-test прошел: все 4 функции идентичны во всех 3 файлах

$ node ~/.claude/get-shit-done/bin/gsd-tools.cjs validate health
{ "status": "healthy", "errors": [], "warnings": [] }
```

(I001 info-сообщения о SUMMARY для 06-02/06-03 — это нормальный «in-progress» state, не regression.)

## Что дальше

**Plan 6.3** теперь может ASSUME:
- Profile JSON v2 имеет `pq_enabled: true` → upgrade-кнопка показывается ТОЛЬКО для legacy v1 XHTTP-профилей
- Marker `.xhttp_default_2026` существует → first-run banner про PQ показан один раз
- generate_connection() для xhttp+pq URL производит ~2.5KB строку — Plan 6.3 должен решить QR policy (per [v2.0 D10] — raw PQ vless:// QR disabled by default)
- create_profile_menu() уже готов; Plan 6.3 добавит upgrade-flow в connect_profile_menu

## Self-Check: PASSED

Verified:
- Все 3 коммита присутствуют в git log: `aa33d8c`, `d7575bf`, `6c9bf44`
- `bash -n xrayebator install.sh update.sh` → exit 0
- sync-test (all 4 functions identical) → PASS
- `gsd validate health` → status: healthy
- jq-симуляция profile JSON: `schema_version: 2` (number), `pq_enabled: true` (bool)
- jq @uri encoding для тестовой PQ строки: `+` → `%2B`, `/` → `%2F`, `=` → `%3D`
- Migration registration order: mlkem_keys_generated < xhttp_default_2026 < aggregate-report
- `_migrate_xhttp_default_2026` тело не содержит `safe_jq_write` (no config mutation)
- Hidden `xorpub) ` case присутствует в create_profile_menu
- Пункт #4 «VLESS + TCP + Reality + Vision» сохранён (REQ-A06 legacy)
