# Testing

[← Back to README](../README.md) · [Русский](ru/testing.md) · [简体中文](zh-CN/testing.md)

---

## Local checkout validation

```bash
bash -n xrayebator install.sh update.sh uninstall.sh
for test_file in validation/*.sh; do bash "$test_file" || exit; done
shellcheck -S error xrayebator install.sh update.sh uninstall.sh
```

All three must pass before a commit.

## What the tests cover

`validation/` holds static and local regression tests:

| Test | What it checks |
|---|---|
| `test-transaction-safety.sh` | Transactional safety of config operations |
| `test-project-update-rollback.sh` | Rollback of a failed project update |
| `test-xhttp-route-path-repair.sh` | Repair of XHTTP route paths during migration |
| `test-multiroute-argument-preservation.sh` | Preservation of multiroute transport arguments |
| `test-happ-subscription-static.sh` | The HAPP subscription handler |
| `test-subscription-server-name.sh` | The subscription server name shown in the client |
| `test-fingerprint-subscription-sync.sh` | Route and subscription sync on fingerprint change |
| `test-dead-stealth-route-pruning.sh` | Pruning of dead stealth routes |
| `test-cascade-routing.sh` | Cascade routing |
| `test-cascade-upstream-import.sh` | Cascade upstream import from a link |
| `test-update-xray-core-sync.sh` | Xray-core update synchronisation |
| `test-vless-url-generation.sh` | `vless://` link generation |
| `test-installer-network-fallbacks.sh` | Installer network fallbacks |
| `test-bbr-removal-migration.sh` | Safe removal of the removed BBR/TCP tuning on every path |
| `test-legacy-udp443-migration.sh` | One-time removal of the legacy UDP/443 block rule |
| `test-main-menu-numbering.sh` | Interactive menu items number consecutively and match handlers |
| `test-sni-change-cli.sh` | The `sni-change` CLI: JSON stdout, Reality serverNames/dest, XHTTP host, profile sync and rollback |
| `test-port-change-cli.sh` | The `port-change` CLI: unit/shared/move inbound scenarios, invalid port, missing profile, multi-route `--route` |
| `test-bypass-cli.sh` | The `bypass` CLI: JSON stdout, routing rules updates, add-with-SNI probe |
| `test-quickstart-migration-parity.sh` | `quickstart_command` runs the same critical migrations as `main_menu` |
| `test-quickstart-subscription-port.sh` | `quickstart` reports the actual subscription port instead of a hardcoded `:8443` |
| `test-audit-functional.sh` | Functional regression checks from the HowDeploy audit (P0/P1): certbot fix, privilege fix, happ fix |
| `test-audit-privilege-regressions.sh` | Privilege-boundary regressions: certbot manifest, root-owned state, nginx rollback, happ-setup IPv6 |

> Static tests do not replace a disposable VPS run: profile creation and deletion, config validation,
> service restarts, rollback and a real client connection.

## Manual checks on a live server

```bash
sudo xrayebator probe-test                                        # SNI reachability from the VPS
sudo /usr/local/bin/xray test -config /usr/local/etc/xray/config.json
sudo systemctl status xray --no-pager -l
sudo systemctl status xrayebator-sub --no-pager -l
curl -sS -i http://127.0.0.1:8080/sub/                            # expected: 404
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

If UFW is already active, compare the numbered rules before and after the operation: an install must
not re-enable the firewall or change its default policy.

## Desktop GUI

The GUI (`src/`) has its own Vitest unit tests in `tests/` and CI that runs them on every push
affecting the GUI code.

```bash
npm run typecheck     # TypeScript surface of main, preload, renderer and shared
npm test              # Vitest unit tests
```

| Test | What it checks |
|---|---|
| `tests/unit/subscription.test.ts` | Subscription URL and profile-key extraction |
| `tests/unit/probe-ports.test.ts` | Reachability probing used by the Dashboard status dot |
| `tests/unit/extractJson.test.ts` | Parsing of JSON from the `xrayebator` command output |
| `tests/unit/countryFlag.test.ts` | Country-flag lookup for server cards |

UI logic (renders, interaction, deploy step flow, i18n switching) is covered by `npm run build`
producing a release bundle and by manual verification against a live server.
