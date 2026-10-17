#!/bin/bash
# test-sni-reachability.sh
# Проверяет выбор дефолтного SNI с учётом доступности С ЭТОГО сервера:
#   - недоступный пер-транспортный дефолт (или первая строка sni_list.txt)
#     заменяется первым доступным кандидатом;
#   - если недоступны ВСЕ кандидаты (нет сети/DNS) — возвращается прежний дефолт,
#     чтобы проба не ломала развёртывание на изолированном хосте;
#   - результат кэшируется: одна проба на SNI за запуск менеджера.
#
# Мотивация (живой VPS, Германия, 2026-10-17): дефолтный www.ozon.ru был недоступен
# с сервера, и 5 из 7 маршрутов свежего деплоя не работали — Reality отдаёт клиенту
# сертификат, полученный у dest, поэтому недоступный dest = висящее рукопожатие.
# Проверка каналов клиентом Xray показала таймауты; после смены SNI на доступный
# заработали все 7 маршрутов (включая PQ).
#
# Usage: bash validation/test-sni-reachability.sh   (нужны bash 4+, grep, cut)

set -euo pipefail

fail() {
  echo "✗ $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WORKDIR=$(mktemp -d /tmp/xrayebator-sni.XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

# shellcheck disable=SC1091
source "$REPO_ROOT/xrayebator"

# Изолируем окружение: свой список SNI, без self-steal домена и без реальных проб.
SNI_LIST="$WORKDIR/sni_list.txt"
SELFSTEAL_DOMAIN_FILE="$WORKDIR/.selfsteal_domain"
printf '%s\n' \
  '# комментарий' \
  'www.ozon.ru|маркетплейс|1' \
  'www.cloudflare.com|cdn|2' > "$SNI_LIST"

PROBE_LOG="$WORKDIR/probes"
: > "$PROBE_LOG"

reset_cache() {
  unset _SNI_REACH_CACHE
  # declare -gA, а не declare -A: внутри функции declare создаёт ЛОКАЛЬНУЮ
  # переменную, и хелпер получил бы обычный массив (индекс как арифметика).
  declare -gA _SNI_REACH_CACHE=()
}

# Доступен только cloudflare (ozon недоступен — как на живом сервере).
only_cloudflare() {
  echo "$1" >> "$PROBE_LOG"
  [[ "$1" != "www.ozon.ru" ]]
}

# ─── 1. Недоступная первая строка списка заменяется доступным кандидатом ───
reset_cache
: > "$PROBE_LOG"
_monitor_sni_reachable() { only_cloudflare "$1"; }
res=$(_default_sni_for_transport tcp)
[[ "$res" == "www.cloudflare.com" ]] \
  || fail "недоступный SNI из sni_list.txt не заменён доступным (получено: '$res')"
grep -q 'www.ozon.ru' "$PROBE_LOG" || fail "недоступный SNI даже не был проверен"

# ─── 2. Доступный пер-транспортный дефолт остаётся на месте ───
reset_cache
res=$(_default_sni_for_transport grpc)
[[ "$res" == "www.cloudflare.com" ]] || fail "grpc-дефолт должен остаться cloudflare (получено: '$res')"
reset_cache
res=$(_default_sni_for_transport tcp-xudp)
[[ "$res" == "api-maps.yandex.ru" ]] || fail "tcp-xudp-дефолт должен остаться yandex (получено: '$res')"

# ─── 3. Все кандидаты недоступны → прежний дефолт (деплой не ломается) ───
reset_cache
_monitor_sni_reachable() { echo "$1" >> "$PROBE_LOG"; return 1; }
res=$(_default_sni_for_transport tcp)
[[ "$res" == "www.ozon.ru" ]] \
  || fail "при полной недоступности должен остаться прежний дефолт (получено: '$res')"
res=$(_default_sni_for_transport grpc)
[[ "$res" == "www.cloudflare.com" ]] \
  || fail "при полной недоступности grpc-дефолт должен сохраниться (получено: '$res')"

# ─── 4. Кэш: повторный вызов не пробует те же SNI заново ───
reset_cache
: > "$PROBE_LOG"
_monitor_sni_reachable() { only_cloudflare "$1"; }
_default_sni_for_transport tcp >/dev/null
first=$(wc -l < "$PROBE_LOG")
_default_sni_for_transport tcp >/dev/null
second=$(wc -l < "$PROBE_LOG")
[[ "$first" == "$second" ]] \
  || fail "повторный вызов снова пробует SNI (кэш не работает: $first → $second проб)"

# ─── 5. self-steal домен имеет приоритет и не пробуется ───
reset_cache
printf '%s' 'steal.example.com' > "$SELFSTEAL_DOMAIN_FILE"
: > "$PROBE_LOG"
res=$(_default_sni_for_transport tcp)
rm -f "$SELFSTEAL_DOMAIN_FILE"
[[ "$res" == "steal.example.com" ]] || fail "self-steal домен должен иметь приоритет (получено: '$res')"
[[ ! -s "$PROBE_LOG" ]] || fail "при self-steal домене проба SNI не нужна"

echo "✓ SNI-достижимость: недоступный дефолт заменяется доступным кандидатом, полная недоступность оставляет прежний дефолт, результат кэшируется — OK"
