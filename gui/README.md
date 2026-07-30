# Xrayebator GUI

Desktop client for deploying Xrayebator to a VPS and connecting through an
Xray VLESS Reality subscription.

The current development build supports the system-proxy connection path and
contains the Linux Xray-native TUN helper. TUN is enabled in the UI only when
the privileged helper socket is installed and reachable. Packaging and live
route/DNS leak verification are still tracked in
[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md).

## Development

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
pytest
python -m xrayebator_gui
```

The application stores server metadata in the platform user-data directory.
SSH passwords are stored through the operating system keyring rather than in
`servers.json`.

## Current flow

1. Add VPS credentials.
2. Deploy `install.sh` and the local `xrayebator` script over SSH.
3. Run `xrayebator quickstart --email ...` remotely.
4. Save the returned subscription URL.
5. Load subscription routes and connect through local Xray.

Do not use the development build as a leak-proof VPN yet. The helper contains
DNS guarding and a fail-closed nftables kill switch, but packaging and live
integration checks are required before that claim.
