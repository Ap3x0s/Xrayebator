# Troubleshooting

[← Back to README](../README.md) · [Русский](ru/troubleshooting.md) · [简体中文](zh-CN/troubleshooting.md)

---

## HAPP does not refresh the subscription

Check the URL from the VPS:

```bash
curl -vkI https://your-domain/sub/
curl -vk https://your-domain/sub/<token>
```

`/sub/` without a token must return `404`. `/sub/<token>` must return `200` and a body with
`vless://` links. Then check the services:

```bash
systemctl status xrayebator-sub --no-pager -l
systemctl status nginx --no-pager -l
```

## The URL shows 127.0.0.1

Local-only mode is enabled; it is for debugging only. For a phone, switch to public TLS by IP or by
domain in the HAPP subscription menu.

## The URL shows an IP even though a domain was added

Enable the domain mode again: HAPP subscription → set public TLS by domain. A DNS record alone does
not change `.subscription_domain`.

## XHTTP does not work in HAPP

The XHTTP candidate for HAPP must be `xhttp-legacy`, not `xhttp-pq`. After an update run
`sudo xrayebator`, wait for the migrations and force a subscription refresh in HAPP. Verify that the
route exists in the profile and its port exists in the live config:

```bash
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

The last column is `pq_enabled`, not a health status. `false` is expected for every non-PQ route;
`true` should appear only for `xhttp-pq`.

## v2rayNG connects intermittently

`v2rayNG` is not the primary HAPP client. It receives a v2ray-compatible body, but the routes still
depend on transport support and the Xray-core version bundled in the client. Test routes one by one:
there is no universal best-to-worst order.

## The connection died after changing SNI, port or fingerprint

That is expected. Refresh the subscription in the client or fetch the raw route again.

Changing the fingerprint does not restart Xray and does not affect other routes. The server-side
subscription updates immediately at the same URL, but HAPP needs a forced refresh or the next
automatic one.

## Old profiles exist on the server but do not work

If the profile JSON points at ports that no longer exist in `config.json`, the profile is stale. New
subscriptions do not serve those routes and the old token returns `410 Gone`.

## The client cannot connect

Causes in order:

1. The client does not support the transport — start with the subscription URL or TCP routes.
2. The SNI is unsuitable — check it with `sudo xrayebator probe-test` and replace it.
3. The provider blocks the port — change the profile port.
4. The fingerprint is detected — try `firefox` instead of `chrome`.
5. The subscription is stale — confirm the route exists in the live `config.json`.

Keep 2-4 profiles ready so you can switch in an emergency.

## I got kicked off the server while configuring it

Connecting to your own VPN and then changing things on the server can drop the SSH session. The
simplest fix is to reach the server through a path other than your own route. A keep-alive helps too:

```bash
sudo nano /etc/ssh/sshd_config
```

```text
ClientAliveInterval 60
ClientAliveCountMax 120
TCPKeepAlive yes
```

```bash
sudo systemctl restart sshd
```

## The whole internet became unreachable

Check DNS on the client. DNS breaks first when providers block VPNs. Keep a list of alternative
subscription links on the client. On desktop clients, check whether TUN mode is required for system
proxying.

## How many users can connect

The interface imposes no hard profile limit. Real capacity is bound by CPU, RAM, VPS bandwidth, route
count and provider limits. Grow the user count gradually and watch the load.

Multiple profiles can be used at once: different subscriptions, SNIs, ports and routes give more
options for bypassing blocks, but they share the same VPS resources.

## An error appeared during installation or use

Copy the full error text from the terminal. If the problem is in Xrayebator code, open an issue.
