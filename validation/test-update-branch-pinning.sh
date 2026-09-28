#!/usr/bin/env bash
# test-update-branch-pinning.sh
# Регрессия: self-update `xrayebator update <branch>` обязан закреплять ветку
# в /usr/local/etc/xray/.current_branch. Без этого GUI-кнопка «Обновить
# Xrayebator» (server-manager.ts читает .current_branch, иначе main) возвращала
# сервер на релизную ветку — и новые команды (profile-revoke, profile-expire,
# bypass groups) молча пропадали: GUI получал «код 1» с пустым stderr.
#
# Usage: bash validation/test-update-branch-pinning.sh

set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

src=$(tr -d '\r' < xrayebator)

# ── 1. update_command пишет ветку в .current_branch ──
update_block=$(sed -n '/^update_command() {/,/^}/p' <<< "$src")
[[ -n "$update_block" ]] || fail "update_command() не найдена"

grep -q 'current_branch' <<< "$update_block" \
  || fail "update_command не закрепляет ветку в .current_branch (ловушка отката на main)"

# Запись должна происходить ПОСЛЕ успешной замены скрипта, иначе при провале
# скачивания ветка закрепится на несуществующую версию.
# Ищем именно запись в файл (перенаправление), а не упоминание в комментарии.
mv_line=$(grep -n 'mv "\$up_tmp" "\$up_script"' <<< "$update_block" | head -1 | cut -d: -f1)
pin_line=$(grep -n '> /usr/local/etc/xray/.current_branch' <<< "$update_block" | head -1 | cut -d: -f1)
[[ -n "$mv_line" && -n "$pin_line" ]] || fail "не найдены строки mv/pin в update_command"
[[ "$pin_line" -gt "$mv_line" ]] \
  || fail "ветка закрепляется до замены скрипта — при сбое закрепится мусор"

# ── 2. Имя ветки валидируется до подстановки в URL ──
grep -q 'Некорректное имя ветки' <<< "$update_block" \
  || fail "нет валидации имени ветки (инъекция в URL/путь)"

# ── 3. GUI читает именно этот файл и умеет падать безопасно ──
manager=src/main/core/server-manager.ts
grep -q '/usr/local/etc/xray/.current_branch' "$manager" \
  || fail "server-manager не читает .current_branch"
grep -q 'isSafeUpdateBranch' "$manager" \
  || fail "server-manager не валидирует ветку из файла"

# ── 4. Диагностика падений CLI доносит причину из stdout ──
# Старый сервер печатает «Неизвестная команда» в stdout, оставляя stderr пустым.
grep -q 'describeFailure' src/main/core/cli-failure.ts \
  || fail "нет разбора причины падения CLI"
grep -q 'describeFailure' src/main/core/profiles.ts \
  || fail "ProfileManager не использует describeFailure"
grep -q 'describeFailure' src/main/core/bypass.ts \
  || fail "BypassManager не использует describeFailure"

# ── 5. profiles отдаёт expire_supported (отличить старый сервер от бессрочного) ──
grep -q 'expire_supported: true' <<< "$src" \
  || fail "profiles не сообщает expire_supported — GUI покажет «бессрочно» на старом сервере"

echo "PASS: self-update закрепляет ветку, CLI-падения объясняются, expire_supported отдаётся"