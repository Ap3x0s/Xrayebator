#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }

for file in xrayebator install.sh update.sh; do
  path="$REPO_ROOT/$file"
  grep -q 'XRAY_LOCAL_ZIP' "$path" || fail "$file: local ZIP fallback missing"
  grep -q 'XRAY_LOCAL_DGST' "$path" || fail "$file: local digest fallback missing"
  grep -q 'XRAY_DOWNLOAD_PROXY' "$path" || fail "$file: proxy fallback missing"
  grep -q -- '--retry-all-errors' "$path" || fail "$file: retry-all-errors missing"
  grep -q -- '--http1.1' "$path" || fail "$file: HTTP/1.1 fallback missing"
done

grep -q 'XRAY_TCP_TUNING' "$REPO_ROOT/install.sh" || fail "optional TCP tuning selector missing"
grep -q '/etc/sysctl.d/99-xrayebator-tcp.conf' "$REPO_ROOT/install.sh" || fail "sysctl.d config missing"
if grep -q 'cat >> /etc/sysctl.conf' "$REPO_ROOT/install.sh"; then
  fail "installer still appends global tuning directly to /etc/sysctl.conf"
fi

echo "PASS: installer network fallbacks and optional TCP tuning"
