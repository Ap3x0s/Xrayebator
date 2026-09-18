# Testing

[← Back to README](../README.md) · [Русский](ru/testing.md) · [简体中文](zh-CN/testing.md)

---

## Local checkout validation

Run the Bash syntax checks and all validation scripts from a Bash-capable environment:

```bash
bash -n xrayebator
bash -n install.sh
bash -n update.sh
bash -n uninstall.sh
for test_file in validation/test-*.sh; do
  bash "$test_file" || exit 1
done
```

A local ShellCheck pass is an additional developer check when `shellcheck` is installed:

```bash
shellcheck -S error xrayebator install.sh update.sh uninstall.sh
```

ShellCheck is not a CI gate in the current workflows. The Linux CI gate is the four syntax checks
plus the complete validation suite on Ubuntu; local ShellCheck results should not be described as a
separate CI requirement.

The Bash tests use Linux-flavoured tools such as `jq`, `uuidgen` and `rg`. A bare Windows Git Bash
checkout may therefore be unable to run the complete suite; use the Ubuntu CI environment or a Linux
machine for authoritative results.

## Validation suite

`validation/` contains exactly 24 scripts. Run every `validation/test-*.sh`; the current set is:

| Script | What it checks |
|---|---|
| `test-audit-functional.sh` | Functional P0/P1 regressions from the HowDeploy integration audit |
| `test-audit-privilege-regressions.sh` | Privilege boundaries, certificate ownership, rollback and HAPP setup regressions |
| `test-bbr-removal-migration.sh` | Safe removal of the retired BBR/TCP tuning |
| `test-bypass-cli.sh` | Bypass CLI JSON output and routing rule updates |
| `test-cascade-routing.sh` | Cascade routing configuration |
| `test-cascade-upstream-import.sh` | Cascade upstream import from a VLESS link |
| `test-dead-stealth-route-pruning.sh` | Pruning dead stealth routes |
| `test-fingerprint-subscription-sync.sh` | Fingerprint changes and subscription synchronisation |
| `test-happ-subscription-static.sh` | Static HAPP subscription handler behavior |
| `test-installer-network-fallbacks.sh` | Installer network and resolver fallbacks |
| `test-legacy-udp443-migration.sh` | One-time removal of the legacy UDP/443 block |
| `test-main-menu-numbering.sh` | Consecutive menu numbering and matching handlers |
| `test-main-readiness-regressions.sh` | Main-menu readiness and first-run regression checks |
| `test-multiroute-argument-preservation.sh` | Preservation of multiroute transport arguments |
| `test-port-change-cli.sh` | Port-change CLI scenarios, firewall moves and route selection |
| `test-project-update-rollback.sh` | Rollback of a failed project update |
| `test-quickstart-migration-parity.sh` | Parity between quickstart and main-menu migrations |
| `test-quickstart-subscription-port.sh` | Dynamic subscription port in quickstart output |
| `test-sni-change-cli.sh` | SNI-change JSON output, transport fields, profile sync and rollback |
| `test-subscription-server-name.sh` | HAPP subscription display name |
| `test-transaction-safety.sh` | Transactional safety of configuration operations |
| `test-update-xray-core-sync.sh` | Synchronisation between the core-update implementations |
| `test-vless-url-generation.sh` | VLESS link generation |
| `test-xhttp-route-path-repair.sh` | XHTTP route-path repair during migration |

Static tests do not replace a disposable VPS run: profile creation and deletion, config validation,
service restarts, rollback, firewall behavior and a real client connection still need live-server
verification.

## Manual checks on a live server

Use Xray's `run` subcommand when validating the installed configuration:

```bash
sudo xrayebator probe-test                                        # SNI reachability from the VPS
sudo /usr/local/bin/xray run -test -config /usr/local/etc/xray/config.json
sudo systemctl status xray --no-pager -l
sudo systemctl status xrayebator-sub --no-pager -l
curl -sS -i http://127.0.0.1:8080/sub/                            # expected: 404
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

The local subscription self-test must return `404` without a token and `200` with a valid token and
VLESS lines. Check that the HAPP profile has seven live routes while the published list intentionally
contains six. If UFW is already active, compare the numbered rules before and after an operation: an
install must not change its default policy, and uninstall should remove only rules recorded as owned.

## Electron GUI unit tests

The active Electron GUI has exactly nine Vitest unit files:

| Test | What it checks |
|---|---|
| `tests/unit/countryFlag.test.ts` | Country-flag lookup used by server cards |
| `tests/unit/extractJson.test.ts` | JSON extraction from noisy `xrayebator` command output |
| `tests/unit/probe-ports.test.ts` | Ports used by the Dashboard reachability probe |
| `tests/unit/server-manager.test.ts` | Safe update-branch validation |
| `tests/unit/shell-command.test.ts` | POSIX shell quoting and sudo command construction |
| `tests/unit/ssh-access.test.ts` | SSH credential validation and approved key access |
| `tests/unit/ssh-client.test.ts` | Host-key trust, authentication and mismatch handling |
| `tests/unit/subscription.test.ts` | Subscription parsing, VLESS extraction and HTTP errors |
| `tests/unit/vless.test.ts` | Port extraction from IPv4 and IPv6 VLESS URLs |

Run the Electron checks with:

```bash
npm run typecheck
npm test
npm run build
```

`tests/unit/shell-command.test.ts` invokes `/bin/sh` by design. On Windows this POSIX-specific test
can fail because `/bin/sh` is absent; Linux is the source of truth for it. The other unit files still
provide useful local coverage, while CI runs the Electron typecheck and unit suite on Ubuntu.

## CI workflow split

The workflows have separate responsibilities:

- `.github/workflows/ci-linux.yml` is the Bash core gate on `ubuntu-24.04`: it installs `jq`,
  `uuid-runtime` and `ripgrep`, runs all four Bash syntax checks, then runs all 24 validation
  scripts.
- `.github/workflows/release.yml` is the active Electron release path for `v*` tags or manual runs.
  It runs `npm run typecheck` and `npm test` on Ubuntu, then builds/packages Windows, macOS and Linux
  artifacts after those checks pass.
- `.github/workflows/gui-release.yml` is the legacy PySide6 workflow. It runs Python `ruff` and
  `pytest gui-legacy/tests`, builds legacy native bundles, and runs only a small Bash smoke subset;
  it is not the Electron unit-test workflow.

The Windows packaging matrix does not change the Linux source of truth for the POSIX shell test. A
Windows package can be built by the release workflow even though a local Windows run cannot execute
that `/bin/sh` test.
