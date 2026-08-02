#!/bin/bash
# Regression test для bug B1: quickstart_command пропускал 9 критических миграций.
# Проверяем, что КРИТИЧЕСКИЕ для quickstart миграции присутствуют в нём.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "✗ FAIL: $*" >&2
  exit 1
}

# Извлекаем тело quickstart_command (tr -d '\r' для CRLF-safe на Windows-машинах разработчиков)
quickstart_block=$(tr -d '\r' < xrayebator | sed -n '/^quickstart_command() {$/,/^happ_setup_command() {$/p')
[[ -n "$quickstart_block" ]] || fail "quickstart_command block not found in xrayebator"

# Извлекаем все migration names в quickstart
mapfile -t quickstart_migrations < <(
  grep -oE 'run_migration "[a-z0-9_]+"' <<< "$quickstart_block" | sed 's/run_migration "\(.*\)"/\1/' | sort -u
)

echo "Migrations in quickstart: ${quickstart_migrations[*]}"

# Критические для quickstart миграции (должны быть в обоих quickstart и main_menu)
# Без них quickstart ломается:
# - mlkem_keys_generated — без него add_inbound pq_enabled=true fail → профиль недополный
# - xhttp_default_2026 — default preset
# - subscription_tokens_2026 — без токенов sub_token=missing
# - happ_legacy_xhttp_route_2026 — HAPP совместимость
# - subhttp_multiroute_2026 — многомаршрутный subscription handler
required_migrations=(
  "xhttp_migrated"
  "routing_v132_migrated"
  "legacy_udp443_block_removed_v3"
  "xhttp_mode_migrated"
  "config_optimized"
  "xmux_explicit_2026"
  "mlkem_keys_generated"
  "xhttp_default_2026"
  "subscription_tokens_2026"
  "happ_legacy_xhttp_route_2026"
  "xhttp_route_path_repair_2026"
  "subhttp_multiroute_2026"
)

for mig in "${required_migrations[@]}"; do
  found=0
  for q in "${quickstart_migrations[@]}"; do
    if [[ "$q" == "$mig" ]]; then
      found=1
      break
    fi
  done
  [[ $found -eq 1 ]] || fail "Critical migration missing in quickstart: $mig"
done

echo "✓ quickstart содержит все критические миграции (${#required_migrations[@]} штук)"
