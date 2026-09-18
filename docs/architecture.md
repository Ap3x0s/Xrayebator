# Architecture

[← Back to README](../README.md) · [Русский](ru/architecture.md) · [简体中文](zh-CN/architecture.md)

Sections: [Repository](#repository) · [On-server state](#on-server-state) ·
[Inbound versus profile](#inbound-versus-profile) · [How the subscription works](#how-the-subscription-works) ·
[Update paths](#update-paths) · [Desktop GUI](#desktop-gui)

---

## Repository

```text
Xrayebator/
├── xrayebator                  # Bash application: menu, profiles, inbounds, routing, migrations
├── install.sh                  # first installation, service, dependencies and permissions
├── update.sh                   # full project lifecycle update workflow
├── uninstall.sh                # removes the service and installation state
├── src/                        # active Electron + React + TypeScript desktop GUI
│   ├── main/                   # SSH, deploy, profile, subscription and server managers
│   ├── preload/                # contextBridge exposed to the renderer
│   ├── renderer/               # Dashboard, AddServer, ServerKeys, ServerSettings
│   └── shared/                 # shared TypeScript types and VLESS helpers
├── tests/                      # Electron/Vitest unit tests
├── resources/                  # Electron build assets
│   └── icons/                  # application icons
├── electron-builder.yml        # packaging and extraResources configuration
├── electron.vite.config.ts     # main, preload and renderer build configuration
├── package.json                # Electron scripts and dependencies
├── gui-legacy/                 # archived PySide6 GUI and its tests
├── validation/                 # Bash static and local regression tests
├── docs/                       # English, Russian and Chinese technical reference
├── sni_list.txt                # SNI candidates used by the Bash application
├── ascii_art.txt               # terminal interface header
└── LICENSE
```

The server-side management logic lives in the single `xrayebator` file. `install.sh`, `update.sh` and
`uninstall.sh` cover installation and lifecycle operations. The generated `subhttp.sh`, nginx
configuration and systemd unit form the HAPP subscription path. The active desktop application in
`src/` is an SSH front-end to this Bash authority; it is not a second server implementation.

## On-server state

```text
/usr/local/bin/
├── xray                          # Xray-core binary
├── xrayebator                    # manager entry point
├── subhttp.sh                    # generated subscription HTTP handler
├── xrayebator-update             # full project updater
└── xrayebator-uninstall          # removal entry point

/usr/local/etc/xray/
├── config.json                   # inbounds, outbounds, routing and DNS
├── profiles/<name>.json          # profile metadata and subscription token
├── upstreams/cascade.json        # cascade upstream parameters
├── backups/                      # config backups made before runtime mutations
├── .private_key / .public_key    # Reality keys
├── .vless_decryption / .vless_encryption
├── .subscription_*               # subscription mode, address, domain and port markers
├── .happ_defaults.env            # HAPP display and routing defaults
├── .current_branch               # manager branch used by lifecycle updates
└── migration markers             # records of completed one-time migrations

/usr/local/share/xray/             # geoip.dat and geosite.dat
/var/log/xray/                     # runtime log directory written by the Xray service
/etc/systemd/system/xray.service.d/security.conf
/etc/systemd/system/xrayebator-sub.service
/etc/nginx/sites-available/xrayebator-sub
```

`/usr/local/etc/xray/` is root-owned manager state and configuration. Xray runs as the non-root
`xray` service account and reads the files it needs; it does not own or write the manager state.
`/var/log/xray/` is the separate runtime log directory. Root-owned scripts and markers therefore
cannot be replaced by the service account.

## Inbound versus profile

An inbound is a port-level block in `config.json`. A profile is a user-facing JSON file containing
one route or several routes. Several profiles can share the same inbound and port.

The port and SNI are properties of that shared inbound. Changing the SNI or port can therefore
change every profile that uses that inbound; use separate ports when independent SNI values are
needed. The generated profile JSON is synchronised after an inbound-level SNI or port change.

The Reality fingerprint is a client-side value stored per profile or route. Changing it changes the
client link for the selected route, does not edit the inbound, and does not require an Xray restart.
For XHTTP, the route SNI is also reflected in the transport host field so the two values stay in
sync.

## How the subscription works

`xrayebator-sub.service` listens on `127.0.0.1:8080`; nginx publishes the generated
`/usr/local/bin/subhttp.sh` handler over HTTPS. The handler reads the root-owned state and profile
metadata and returns the client-specific subscription body.

The base is built dynamically from `.subscription_domain` and `.subscription_port`:

```text
https://<domain>/sub/<32-hex-token>       # public TLS on 443
https://<domain>:8443/sub/<32-hex-token>  # public TLS on another port
http://127.0.0.1:8080/sub/<token>         # local-only fallback
```

`quickstart --email <address>` emits JSON containing `subscription_url` built from that current
base. It does not assume that the public listener is always `8443`. The token is stored in the
profile as `sub_token`; revoke rotates it and invalidates the previous URL.

The HAPP profile is intentionally a seven-route profile, including `xhttp-legacy` and the
post-quantum XHTTP route. The published HAPP connection list contains six VLESS routes because the
PQ route remains available through the raw/profile path. A profile with no live inbound is hidden
from the subscription and its old URL returns `410 Gone`.

The handler also serves the token-protected `geoip.dat` and `geosite.dat` resources required by the
managed HAPP routing profile. HAPP receives its routing metadata, while v2rayNG and v2rayN receive
the compatible VLESS body without HAPP-only metadata.

## Update paths

The similarly named commands have different responsibilities:

| Command | Responsibility |
|---|---|
| `sudo xrayebator update` | Update only the Xray-core binary from the XTLS release channel, then validate and restart the core through the core-update path |
| `sudo xrayebator update <branch>` | Fetch the manager script from the canonical repository branch, continue with the fresh script, and update Xray-core |
| `sudo xrayebator-update [branch]` | Run the full `update.sh` project lifecycle workflow: manager scripts, core, data, subscription integration and service refresh |

The optional branch for the full updater defaults to the branch recorded in `.current_branch`. The
Electron GUI uses the middle path (`xrayebator update <branch>`) for its Server Settings update;
it does not expose the complete terminal update workflow.

## Config edits

For runtime mutations owned by `xrayebator`, the normal transaction is:

```text
backup_config ────► /usr/local/etc/xray/backups/config_<timestamp>_<op>.json
safe_jq_write ────► temp file in the destination directory → validation → atomic rename
safe_restart_xray ► xray run -test -config → systemctl restart
                     on failure — rollback from the backup, Xray keeps the old config
```

Migrations run once and are recorded by marker files in `/usr/local/etc/xray/`. The usual sequence
is marker missing → backup → edit → validated restart when the configuration changed → create the
marker. The installer and lifecycle updater have their own validation and restart sequences; not
every installation or update restart is a call to `safe_restart_xray`.

## Desktop GUI

The active desktop app (`src/`) is a controlled CLI front-end over SSH. It can deploy with
`quickstart`, refresh and display the saved subscription, manage profiles, and invoke selected SNI,
fingerprint, port, update and uninstall operations. It intentionally exposes only a subset of the
interactive Bash menu and never edits `config.json` directly.

See [Electron Desktop GUI](desktop-gui.md) for the complete feature boundary, SSH security model,
command mapping, packaging and test details.
