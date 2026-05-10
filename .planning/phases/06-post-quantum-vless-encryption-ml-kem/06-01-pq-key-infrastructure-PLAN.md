---
phase: 06-post-quantum-vless-encryption-ml-kem
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - install.sh
  - xrayebator
autonomous: false
requirements:
  - REQ-A01
  - REQ-A02
  - REQ-A03

must_haves:
  truths:
    - "На свежей установке файлы /usr/local/etc/xray/.vless_decryption и .vless_encryption существуют, начинаются с 'mlkem768x25519plus.', имеют chmod 600 и owner xray:xray"
    - "На v1.0-апгрейде (без файлов ключей) первый запуск xrayebator после Phase 5 догенерирует те же два файла через миграцию .mlkem_keys_generated"
    - "Если Xray-core < 25.3 — миграция .mlkem_keys_generated НЕ ставит маркер (возвращает ≥2), оператор видит сообщение 'Обновите Xray-core'"
    - "В xrayebator объявлены константы VLESS_DECRYPTION_FILE и VLESS_ENCRYPTION_FILE рядом с PRIVATE_KEY_FILE/PUBLIC_KEY_FILE"
    - "bash -n install.sh и bash -n xrayebator проходят без ошибок"
    - "Точный stdout-формат `xray vlessenc` зафиксирован в /tmp/vlessenc-sample.txt и парсер адаптирован под него до коммита"
  artifacts:
    - path: "/usr/local/etc/xray/.vless_decryption"
      provides: "PQ decryption строка для inbound.settings.decryption"
      contains: "mlkem768x25519plus."
    - path: "/usr/local/etc/xray/.vless_encryption"
      provides: "PQ encryption строка для encryption= параметра в vless:// URL"
      contains: "mlkem768x25519plus."
    - path: "install.sh"
      provides: "Генерация PQ-ключей через xray vlessenc после блока x25519 (~line 484)"
      contains: "xray vlessenc"
    - path: "xrayebator"
      provides: "Константы VLESS_DECRYPTION_FILE/VLESS_ENCRYPTION_FILE + миграция .mlkem_keys_generated через run_migration"
      contains: "VLESS_DECRYPTION_FILE"
  key_links:
    - from: "install.sh post-x25519 block"
      to: "/usr/local/etc/xray/.vless_decryption + .vless_encryption"
      via: "xray vlessenc -mode native + 3-layer parser + printf > file + chmod 600 + chown xray:xray"
      pattern: "xray vlessenc.*-mode native"
    - from: "xrayebator main_menu()"
      to: "_migrate_mlkem_keys() через run_migration"
      via: "run_migration \"mlkem_keys_generated\" \"...\" _migrate_mlkem_keys"
      pattern: "run_migration \"mlkem_keys_generated\""
    - from: "_migrate_mlkem_keys"
      to: "Xray-core version check (≥ 25.3)"
      via: "xray version | grep -oE '[0-9]+\\.[0-9]+', return 2 если меньше"
      pattern: "xray version"
---

<objective>
Заложить инфраструктуру post-quantum ключей для Phase 6: install.sh после генерации x25519 вызывает `xray vlessenc -mode native`, парсит вывод (трёхуровневый парсер), сохраняет decryption/encryption в два файла. Миграция `.mlkem_keys_generated` догенерирует ключи на v1.0-установках с защитой по версии Xray-core. xrayebator получает два новых constants рядом с существующими x25519 файлами.

Purpose: Без файлов ключей Phase 6.2 (decryption в inbound) и 6.3 (upgrade button) физически не могут работать. Это foundational shim — минимальный, но критичный.
Output:
- /usr/local/etc/xray/.vless_decryption (chmod 600, owner xray:xray, содержит mlkem768x25519plus.<rest>)
- /usr/local/etc/xray/.vless_encryption (chmod 600, owner xray:xray)
- install.sh обновлён: после x25519 блока (строки 421-483) добавлен vlessenc-блок
- xrayebator обновлён: константы строки 23-24 расширены, миграция _migrate_mlkem_keys + регистрация в main_menu
- Маркер /usr/local/etc/xray/.mlkem_keys_generated после успешной миграции
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
@.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-RESEARCH.md

# Codebase anchors (mandatory patterns)
@CLAUDE.md
@xrayebator
@install.sh
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Зафиксировать точный stdout-формат `xray vlessenc` на реальном Xray-core 25.3+</name>
  <what-built>
    До этого checkpoint исполнитель НЕ должен писать парсер. Researcher 06-RESEARCH.md явно отметил MEDIUM confidence по формату вывода: предполагаемые лейблы `decryption:` / `encryption:` (lowercase, по аналогии с `xray x25519` v25.8+ "PrivateKey:" формата) могут отличаться. Это обязательный verification step.

    Исполнитель должен:

    1. Убедиться что на хосте установлен Xray-core ≥ 25.3 (Phase 5 это гарантирует, но проверить):
       ```bash
       /usr/local/bin/xray version | head -1
       # Должно быть Xray 25.3.x или новее
       ```
       Если меньше — выполнить `xrayebator update` (Phase 5 CLI subcommand) и дождаться обновления до 25.3+.

    2. Запустить ОБА варианта для полноты:
       ```bash
       /usr/local/bin/xray vlessenc 2>&1 | tee /tmp/vlessenc-default.txt
       /usr/local/bin/xray vlessenc -mode native 2>&1 | tee /tmp/vlessenc-native.txt
       /usr/local/bin/xray help vlessenc 2>&1 | tee /tmp/vlessenc-help.txt
       ```

    3. Зафиксировать точные лейблы (без угадывания):
       ```bash
       head -20 /tmp/vlessenc-native.txt
       # → визуально проверить:
       #   - Какой regex описывает decryption-строку? (^decryption:|^Decryption:|JSON-ключ?)
       #   - Какой regex описывает encryption-строку?
       #   - Есть ли лидирующие пробелы/таб? Скобки? "="?
       #   - Точно ли две строки с mlkem768x25519plus.<...>?
       ```

    4. Если формат СОВПАДАЕТ с предположением researcher (`/^[Dd]ecryption: <value>/` + `/^[Ee]ncryption: <value>/`), парсер из 06-RESEARCH.md §"Code Examples" #1 пишется как есть.

    5. Если формат ОТЛИЧАЕТСЯ — адаптировать Layer 1 awk-pattern. Layer 2 (mlkem-shape grep) и Layer 3 (validator regex `^mlkem768x25519plus\.`) останутся как safety net.

    6. Записать в STATE.md (под существующий блок "Phase 6 research decisions") строку:
       ```
       - [06-01 vlessenc format VERIFIED YYYY-MM-DD]: <одна строка с реальным форматом или "соответствует RESEARCH §10">
       ```
  </what-built>
  <how-to-verify>
    Оператор подтверждает:
    1. /tmp/vlessenc-native.txt содержит ровно две непустые строки с mlkem768x25519plus
    2. Layer 1 awk-паттерн в задаче 2 соответствует реальному формату (или адаптирован)
    3. STATE.md обновлён записью о формате vlessenc

    Resume signal: "approved" (формат совпадает с RESEARCH) ИЛИ конкретное описание расхождения (например: "labels are 'Decryption Key:' / 'Encryption Key:' — adapt parser")
  </how-to-verify>
  <resume-signal>Type "approved" if format matches RESEARCH §10, OR paste corrected awk-pattern + adjusted Layer 1 regex.</resume-signal>
  <files>none (verification-only checkpoint; no files modified)</files>
  <action>Verify `xray vlessenc` stdout format on real Xray-core 25.3+ host as detailed in &lt;what-built&gt; above. Run vlessenc commands, capture output to /tmp/vlessenc-native.txt, compare against RESEARCH §10 expected labels, adapt Layer 1 awk-pattern in Task 2 if format differs, update STATE.md with verified format string.</action>
  <verify>Operator confirms (per &lt;how-to-verify&gt;): /tmp/vlessenc-native.txt has exactly two non-empty lines containing `mlkem768x25519plus`; Task 2 awk-pattern matches real format (or adapted); STATE.md contains a new line `[06-01 vlessenc format VERIFIED YYYY-MM-DD]: ...`.</verify>
  <done>User typed "approved" (format matches RESEARCH §10), OR provided concrete adaptation directive (corrected awk-pattern + adjusted Layer 1 regex) which has been incorporated into Task 2 action before Task 2 begins.</done>
</task>

<task type="auto">
  <name>Task 2: install.sh — добавить vlessenc generation после x25519 блока + xrayebator константы</name>
  <files>install.sh, xrayebator</files>
  <action>
**Файл 1: install.sh** — после строки 484 (после блока x25519 chmod 600/644) ВСТАВИТЬ блок генерации VLESS Encryption ключей. ВАЖНО: вставлять ПОСЛЕ существующего chmod 600/644 на x25519 ключи, ДО создания config.json (строка 487 `cat > "$CONFIG_FILE"`).

Использовать парсер ПОДТВЕРЖДЁННОГО (из Task 1) формата. Шаблон (адаптировать Layer 1 если Task 1 показал другой формат):

```bash
# ── VLESS Encryption keys (Phase 6 REQ-A01) ────────────────────
# Генерация PQ decryption/encryption пары через xray vlessenc.
# Требует Xray-core ≥ 25.3 (гарантируется install.sh шагом «Установка Xray-core»).
echo -e "${BLUE}[5b/10]${NC} ${YELLOW}Генерация VLESS Encryption ключей (mlkem768x25519plus.native)...${NC}"

VLESS_DECRYPTION_FILE="/usr/local/etc/xray/.vless_decryption"
VLESS_ENCRYPTION_FILE="/usr/local/etc/xray/.vless_encryption"

VLESSENC_OUTPUT=$(/usr/local/bin/xray vlessenc -mode native 2>&1)
VLESSENC_EXIT=$?

if [[ $VLESSENC_EXIT -ne 0 ]]; then
  echo -e "${RED}✗ xray vlessenc завершилась с ошибкой (код $VLESSENC_EXIT)${NC}"
  echo "Вывод:"; echo "$VLESSENC_OUTPUT"
  exit 1
fi

# Layer 1: field-name парсер (формат подтверждён в Task 1 — адаптируйте если другой)
VLESS_DECRYPTION=$(echo "$VLESSENC_OUTPUT" | awk -F': ' '/^[Dd]ecryption:/ {print $2; exit}' | tr -d '[:space:]')
VLESS_ENCRYPTION=$(echo "$VLESSENC_OUTPUT" | awk -F': ' '/^[Ee]ncryption:/ {print $2; exit}' | tr -d '[:space:]')

# Layer 2: mlkem-shape fallback (если field-name парсер не сработал)
if [[ ! "$VLESS_DECRYPTION" =~ ^mlkem768x25519plus\. ]] || [[ ! "$VLESS_ENCRYPTION" =~ ^mlkem768x25519plus\. ]]; then
  echo -e "${YELLOW}⚠ Field-парсер не нашёл ключи, пробую mlkem-shape fallback${NC}"
  MLKEM_LINES=$(echo "$VLESSENC_OUTPUT" | grep -oE 'mlkem768x25519plus\.[^[:space:]]+')
  VLESS_DECRYPTION=$(echo "$MLKEM_LINES" | sed -n '1p')
  VLESS_ENCRYPTION=$(echo "$MLKEM_LINES" | sed -n '2p')
fi

# Layer 3: validator
if [[ ! "$VLESS_DECRYPTION" =~ ^mlkem768x25519plus\. ]] || [[ ! "$VLESS_ENCRYPTION" =~ ^mlkem768x25519plus\. ]]; then
  echo -e "${RED}✗ Не удалось распарсить mlkem768x25519plus ключи${NC}"
  echo -e "${YELLOW}  Убедитесь что Xray-core ≥ 25.3 установлен${NC}"
  echo -e "${YELLOW}Полный вывод vlessenc:${NC}"; echo "$VLESSENC_OUTPUT"
  exit 1
fi

printf "%s" "$VLESS_DECRYPTION" > "$VLESS_DECRYPTION_FILE"
printf "%s" "$VLESS_ENCRYPTION" > "$VLESS_ENCRYPTION_FILE"
chmod 600 "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE"
chown xray:xray "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE" 2>/dev/null || true

echo -e "${GREEN}✓ VLESS Encryption ключи сгенерированы${NC}"
echo -e "${CYAN}  decryption: ${VLESS_DECRYPTION:0:48}...${NC}"
```

ПОЧЕМУ `-mode native`: D1 решение research (mlkem768x25519plus.native), `xorpub` security-theater + замедляет, `random` конфликтует с Vision-padding.

ПОЧЕМУ `printf "%s"` без `\n`: чтобы `cat $VLESS_DECRYPTION_FILE` в add_inbound (Plan 6.2) не давал хвостовой newline, который убивает JSON-валидность строки в config.json.

ПОЧЕМУ chown через `2>/dev/null || true`: на момент выполнения install.sh user `xray` УЖЕ создан (см. строки до x25519), но защититься от race на edge-cases.

**Файл 2: xrayebator** — отредактировать строки 23-24 (рядом с PRIVATE_KEY_FILE/PUBLIC_KEY_FILE). Добавить ДВЕ строки:

```bash
PRIVATE_KEY_FILE="/usr/local/etc/xray/.private_key"
PUBLIC_KEY_FILE="/usr/local/etc/xray/.public_key"
VLESS_DECRYPTION_FILE="/usr/local/etc/xray/.vless_decryption"
VLESS_ENCRYPTION_FILE="/usr/local/etc/xray/.vless_encryption"
```

НЕ добавлять early-load блок типа `if [[ -f "$VLESS_DECRYPTION_FILE" ]]; then VLESS_DECRYPTION=$(cat ...); fi` — Plan 6.2 будет читать содержимое лениво в add_inbound() через `cat` (research §5 рекомендует читать файл per-call, чтобы поддержать ротацию ключей без рестарта xrayebator).
  </action>
  <verify>
```bash
# 1. Syntax check
bash -n install.sh && echo "OK install.sh syntax"
bash -n xrayebator && echo "OK xrayebator syntax"

# 2. Constants присутствуют в xrayebator
grep -q '^VLESS_DECRYPTION_FILE="/usr/local/etc/xray/.vless_decryption"$' xrayebator && echo "OK VLESS_DECRYPTION_FILE constant"
grep -q '^VLESS_ENCRYPTION_FILE="/usr/local/etc/xray/.vless_encryption"$' xrayebator && echo "OK VLESS_ENCRYPTION_FILE constant"

# 3. install.sh содержит блок vlessenc
grep -q 'xray vlessenc -mode native' install.sh && echo "OK vlessenc -mode native call"
grep -q 'mlkem768x25519plus' install.sh && echo "OK mlkem regex check present"
grep -q 'chmod 600 "$VLESS_DECRYPTION_FILE"' install.sh && echo "OK chmod 600 explicit"

# 4. Блок вставлен В ПРАВИЛЬНОМ месте — ПОСЛЕ x25519 chmod, ДО первого cat>config:
awk '/chmod 644 "\$PUBLIC_KEY_FILE"/{found_x25519=NR} /xray vlessenc/{found_vlessenc=NR} /cat > "\$CONFIG_FILE"/{found_config=NR; exit} END{if(found_x25519 && found_vlessenc && found_config && found_x25519 < found_vlessenc && found_vlessenc < found_config) print "OK insertion order"; else print "FAIL insertion order: x25519="found_x25519" vlessenc="found_vlessenc" config="found_config}' install.sh
```
  </verify>
  <done>
- bash -n проходит для обоих файлов
- xrayebator имеет два новых constants на правильных строках (между PUBLIC_KEY_FILE и SNI_LIST)
- install.sh имеет блок vlessenc, расположенный ПОСЛЕ блока chmod x25519 (строка ~483) и ДО cat > CONFIG_FILE (строка ~487)
- Все четыре grep-проверки выше выводят "OK ..."
- Никаких изменений в config.json генерации, никаких изменений в системд-юните
  </done>
</task>

<task type="auto">
  <name>Task 3: xrayebator — миграция .mlkem_keys_generated через run_migration с version-check</name>
  <files>xrayebator</files>
  <action>
Добавить НОВУЮ migration-функцию `_migrate_mlkem_keys` РЯДОМ с другими migration-фунциями (после `migrate_xmux_explicit_2026`, до `main_menu()` — то есть в районе строки 870+, перед строкой 1329). Зарегистрировать её в `main_menu()` через `run_migration` РЯДОМ с другими registration-вызовами (после строки 1343, до aggregate-report).

**Функция _migrate_mlkem_keys** (returns 1 = no-op/mark, returns 2+ = fail/no-mark):

```bash
# Phase 6 REQ-A02: догенерация PQ ключей на v1.0-апгрейде.
# НЕ мутирует config.json — только создаёт два файла ключей. Поэтому
# return 1 (no-op/mark, без restart) даже когда ключи реально сгенерированы.
# Restart Xray не нужен — config.json не изменился, ключи будут использованы
# при следующем add_inbound (Plan 6.2).
#
# Three-valued return contract:
#   1 — done (либо ключи уже есть, либо успешно сгенерированы — в обоих случаях marker ставится)
#   ≥2 — fail (Xray-core < 25.3 ИЛИ vlessenc ошибка ИЛИ парсер не справился)
_migrate_mlkem_keys() {
  echo -e "${CYAN}Проверка наличия PQ ключей VLESS Encryption...${NC}"

  # Уже есть оба файла + они валидны? — no-op.
  if [[ -f "$VLESS_DECRYPTION_FILE" ]] && [[ -f "$VLESS_ENCRYPTION_FILE" ]] && \
     grep -q '^mlkem768x25519plus\.' "$VLESS_DECRYPTION_FILE" 2>/dev/null && \
     grep -q '^mlkem768x25519plus\.' "$VLESS_ENCRYPTION_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓ PQ ключи уже сгенерированы${NC}"
    return 1
  fi

  # Version-check: vlessenc появился в Xray-core 25.3.
  # Парсим major.minor из `xray version` (формат: "Xray 25.3.5 (Xray, ...)").
  local xray_ver_full xray_major xray_minor
  xray_ver_full=$(/usr/local/bin/xray version 2>/dev/null | grep -oE 'Xray [0-9]+\.[0-9]+\.[0-9]+' | head -1 | awk '{print $2}')
  if [[ -z "$xray_ver_full" ]]; then
    echo -e "${RED}✗ Не удалось определить версию Xray-core${NC}"
    echo -e "${YELLOW}  Запустите: /usr/local/bin/xray version${NC}"
    return 2
  fi
  xray_major=$(echo "$xray_ver_full" | cut -d. -f1)
  xray_minor=$(echo "$xray_ver_full" | cut -d. -f2)
  if [[ "$xray_major" -lt 25 ]] || { [[ "$xray_major" -eq 25 ]] && [[ "$xray_minor" -lt 3 ]]; }; then
    echo -e "${RED}✗ Xray-core $xray_ver_full < 25.3 — vlessenc недоступен${NC}"
    echo -e "${YELLOW}  Обновите Xray-core: sudo xrayebator update${NC}"
    echo -e "${YELLOW}  После обновления миграция повторится автоматически${NC}"
    return 2
  fi

  # Запуск vlessenc (тот же 3-layer парсер что в install.sh — keep in sync).
  echo -e "${CYAN}  → Запуск xray vlessenc -mode native${NC}"
  local vlessenc_output vlessenc_rc
  vlessenc_output=$(/usr/local/bin/xray vlessenc -mode native 2>&1)
  vlessenc_rc=$?
  if [[ $vlessenc_rc -ne 0 ]]; then
    echo -e "${RED}✗ xray vlessenc rc=$vlessenc_rc${NC}"
    echo "$vlessenc_output"
    return 2
  fi

  local decryption encryption
  decryption=$(echo "$vlessenc_output" | awk -F': ' '/^[Dd]ecryption:/ {print $2; exit}' | tr -d '[:space:]')
  encryption=$(echo "$vlessenc_output" | awk -F': ' '/^[Ee]ncryption:/ {print $2; exit}' | tr -d '[:space:]')

  if [[ ! "$decryption" =~ ^mlkem768x25519plus\. ]] || [[ ! "$encryption" =~ ^mlkem768x25519plus\. ]]; then
    local mlkem_lines
    mlkem_lines=$(echo "$vlessenc_output" | grep -oE 'mlkem768x25519plus\.[^[:space:]]+')
    decryption=$(echo "$mlkem_lines" | sed -n '1p')
    encryption=$(echo "$mlkem_lines" | sed -n '2p')
  fi

  if [[ ! "$decryption" =~ ^mlkem768x25519plus\. ]] || [[ ! "$encryption" =~ ^mlkem768x25519plus\. ]]; then
    echo -e "${RED}✗ Не удалось распарсить mlkem768x25519plus ключи${NC}"
    echo -e "${YELLOW}Полный вывод vlessenc:${NC}"; echo "$vlessenc_output"
    return 2
  fi

  printf "%s" "$decryption" > "$VLESS_DECRYPTION_FILE"
  printf "%s" "$encryption" > "$VLESS_ENCRYPTION_FILE"
  chmod 600 "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE"
  chown xray:xray "$VLESS_DECRYPTION_FILE" "$VLESS_ENCRYPTION_FILE" 2>/dev/null || true

  echo -e "${GREEN}✓ PQ ключи сгенерированы (mlkem768x25519plus.native)${NC}"

  # IMPORTANT: return 1, не 0. Config.json не мутировал — restart не нужен.
  # run_migration touch-нет marker без вызова safe_restart_xray.
  return 1
}
```

**Регистрация в main_menu()** — ВСТАВИТЬ ПОСЛЕ строки `run_migration "xmux_explicit_2026" ... migrate_xmux_explicit_2026 || ((migration_failures++))` (текущая строка 1343), ДО aggregate-report (строка 1347 `if [[ $migration_failures -gt 0 ]]`):

```bash
  run_migration "mlkem_keys_generated"                 "PQ ключи VLESS Encryption (mlkem768x25519plus)" _migrate_mlkem_keys || ((migration_failures++))
```

ПОЧЕМУ ПОСЛЕ xmux_explicit_2026: эта миграция семантически про Phase 6, должна быть после Phase 5 миграций. Порядок в main_menu идёт хронологически по фазам.

ПОЧЕМУ fix_xray_permissions НЕ нужен после миграции: chown уже сделан внутри _migrate_mlkem_keys. Глобальный fix_xray_permissions из main_menu (строка 1359) подстрахует.

ПОЧЕМУ НЕ вызывать `_migrate_mlkem_keys` НИОТКУДА БОЛЬШЕ кроме main_menu: Plan 6.2 (add_inbound для XHTTP+pq) будет ASSUME-ить что файлы уже есть. Если их нет — Plan 6.2 даст явный error в add_inbound (это его ответственность). Plan 6.1 — ТОЛЬКО про подготовку файлов.
  </action>
  <verify>
```bash
# 1. Syntax check
bash -n xrayebator && echo "OK syntax"

# 2. Функция определена
grep -q '^_migrate_mlkem_keys() {$' xrayebator && echo "OK function defined"

# 3. Функция возвращает 1 в no-op случае И после успешной генерации (НЕ 0 — иначе run_migration сделает лишний restart)
# Проверка: в теле функции есть ровно два `return 1` (после `if уже есть` и в конце после успеха)
# и хотя бы три `return 2` (failures)
[[ $(grep -c "    return 1" xrayebator) -ge 2 ]] && echo "OK return 1 used for no-op/done"
# L5 fix: extract function body via awk range (robust as function grows), not grep -A N | head
awk '/^_migrate_mlkem_keys\(\) \{/,/^\}/' xrayebator | grep -c 'return 2' | grep -qE '^[3-9]|^[0-9]{2,}' && echo "OK return 2 used for failures"

# 4. Версия-чек присутствует (awk range — same robustness reason as above)
awk '/^_migrate_mlkem_keys\(\) \{/,/^\}/' xrayebator | grep -q 'xray version' && echo "OK version check present"
awk '/^_migrate_mlkem_keys\(\) \{/,/^\}/' xrayebator | grep -q 'xray_major.*-lt 25' && echo "OK 25.3 minimum enforced"

# 5. Регистрация в main_menu
grep -q 'run_migration "mlkem_keys_generated".*_migrate_mlkem_keys' xrayebator && echo "OK migration registered"

# 6. Регистрация ПОСЛЕ xmux_explicit_2026 (хронологический порядок)
awk '/run_migration "xmux_explicit_2026"/{x=NR} /run_migration "mlkem_keys_generated"/{m=NR} END{if(x && m && m > x) print "OK registration order"; else print "FAIL: xmux="x" mlkem="m}' xrayebator
```
  </verify>
  <done>
- bash -n проходит
- _migrate_mlkem_keys определена, использует константы VLESS_*_FILE из задачи 2
- Функция возвращает 1 в случае "уже сгенерировано" и 1 в случае "сгенерировано сейчас" (НЕ 0 — config.json не изменился)
- Функция возвращает ≥2 на: невозможность определить версию, версия < 25.3, vlessenc rc≠0, парсер не справился
- В main_menu добавлена строка регистрации миграции после xmux_explicit_2026
- На свежей установке (где ключи уже есть из install.sh) миграция выводит "✓ PQ ключи уже сгенерированы" + return 1 + run_migration ставит marker без restart
- На v1.0-апгрейде с Xray-core < 25.3: миграция возвращает 2 → marker НЕ ставится → следующий запуск повторит проверку
- На v1.0-апгрейде с Xray-core ≥ 25.3 без файлов: миграция генерирует ключи → return 1 → marker ставится без restart
  </done>
</task>

</tasks>

<verification>
**Sanity checks (после Tasks 2+3 на dev-машине):**

```bash
# Синтаксис всех изменённых файлов
bash -n install.sh
bash -n xrayebator
bash -n update.sh   # не должен сломаться (мы его не трогали, но defensive)

# Константы и references
grep -c "VLESS_DECRYPTION_FILE" xrayebator   # должно быть ≥ 2 (объявление + использование в _migrate_mlkem_keys)
grep -c "VLESS_ENCRYPTION_FILE" xrayebator   # ≥ 2

# Миграция корректно зарегистрирована и в правильном месте
grep -B1 -A1 "_migrate_mlkem_keys" xrayebator | head -20
```

**Production smoke (на тестовой VPS с Xray-core ≥ 25.3):**

```bash
# Если запустить install.sh заново НЕ хочется (риск перезатереть существующее) —
# запустить только vlessenc-блок изолированно:
sudo bash -c '
  VLESSENC_OUTPUT=$(/usr/local/bin/xray vlessenc -mode native 2>&1)
  echo "$VLESSENC_OUTPUT"
  echo "---parsing test---"
  D=$(echo "$VLESSENC_OUTPUT" | awk -F": " "/^[Dd]ecryption:/ {print \$2; exit}" | tr -d "[:space:]")
  E=$(echo "$VLESSENC_OUTPUT" | awk -F": " "/^[Ee]ncryption:/ {print \$2; exit}" | tr -d "[:space:]")
  echo "decryption[0:48]: ${D:0:48}"
  echo "encryption[0:48]: ${E:0:48}"
  [[ "$D" =~ ^mlkem768x25519plus\. ]] && echo "OK decryption shape"
  [[ "$E" =~ ^mlkem768x25519plus\. ]] && echo "OK encryption shape"
'

# Запустить xrayebator (миграция должна сработать — увидеть [migration] PQ ключи... ✓)
sudo xrayebator
# В главном меню — выйти. Проверить:
ls -la /usr/local/etc/xray/.vless_*
# → -rw------- 1 xray xray ... .vless_decryption
# → -rw------- 1 xray xray ... .vless_encryption
[[ -f /usr/local/etc/xray/.mlkem_keys_generated ]] && echo "OK marker created"
```
</verification>

<success_criteria>
1. **REQ-A01:** `install.sh` после x25519 блока вызывает `xray vlessenc -mode native`, парсит, сохраняет в два файла chmod 600 owner xray:xray. На свежей установке оба файла валидны (`mlkem768x25519plus.<rest>`).

2. **REQ-A02:** Миграция `.mlkem_keys_generated` через `run_migration` догенерирует файлы на v1.0-апгрейде. Защищена version-check (Xray-core ≥ 25.3), при недоступности vlessenc — return ≥2 (marker НЕ ставится, повторится). Возвращает `1` в случаях done/уже-есть (не делает лишний safe_restart_xray).

3. **REQ-A03:** В xrayebator объявлены `VLESS_DECRYPTION_FILE` и `VLESS_ENCRYPTION_FILE` непосредственно после `PUBLIC_KEY_FILE` (строки 24-25 после правки).

4. **Foundational gate:** Plan 6.2 может ASSUME-ить что `cat $VLESS_DECRYPTION_FILE` возвращает валидную mlkem-строку без trailing newline.

5. **Sync контракт:** Парсер vlessenc в install.sh и в _migrate_mlkem_keys использует тот же 3-layer pattern. Если researcher окажется не прав про формат — обе копии правятся синхронно (это технический долг ради избежания source-инга xrayebator из install.sh).

6. **bash -n:** install.sh, xrayebator, update.sh — все три проходят.
</success_criteria>

<output>
После завершения создать `.planning/phases/06-post-quantum-vless-encryption-ml-kem/06-01-pq-key-infrastructure-SUMMARY.md` с разделами:
- Что сделано (install.sh блок, xrayebator константы, миграция)
- Подтверждённый формат `xray vlessenc` stdout (из Task 1 checkpoint)
- Замеченные deviations от RESEARCH §10 (если были)
- Следующий шаг: Plan 6.2 теперь может читать $VLESS_DECRYPTION_FILE
</output>
