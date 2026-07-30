# 故障排查

[← 返回 README](../../README.zh-CN.md) · [English](../troubleshooting.md) · [Русский](../ru/troubleshooting.md)

---

## HAPP 不刷新订阅

在 VPS 上检查链接：

```bash
curl -vkI https://your-domain/sub/
curl -vk https://your-domain/sub/<token>
```

不带令牌访问 `/sub/` 必须返回 `404`；`/sub/<token>` 必须返回 `200`，
响应体中包含 `vless://` 链接。然后检查服务：

```bash
systemctl status xrayebator-sub --no-pager -l
systemctl status nginx --no-pager -l
```

## 链接显示为 127.0.0.1

当前是仅本地模式，只用于调试。手机使用请在 HAPP 订阅菜单中切换到按 IP 或按域名的 public TLS。

## 已经添加域名，链接仍显示 IP

请重新启用域名模式：HAPP 订阅 → 设置按域名的 public TLS。
仅添加 DNS 记录不会改变 `.subscription_domain`。

## HAPP 中 XHTTP 不可用

HAPP 的 XHTTP 候选必须是 `xhttp-legacy`，而不是 `xhttp-pq`。更新之后请运行
`sudo xrayebator`，等待迁移完成，再在 HAPP 中强制刷新订阅。
确认该线路存在于配置档中，且其端口存在于运行中的配置里：

```bash
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

最后一列是 `pq_enabled`，不是健康状态。所有非 PQ 线路显示 `false` 属于正常，
只有 `xhttp-pq` 应该是 `true`。

## v2rayNG 时好时坏

`v2rayNG` 不是 HAPP 流程的主力客户端。它拿到的是 v2ray 兼容的订阅体，
但线路能否使用仍取决于客户端对该传输方式的支持以及其内置的 Xray-core 版本。
请逐条测试线路：不存在通用的「从好到坏」顺序。

## 修改 SNI、端口或指纹后连接失效

这是正常现象。请在客户端刷新订阅，或重新获取原始线路。

修改指纹不会重启 Xray，也不影响其他线路。服务端订阅在同一链接上立即更新，
但 HAPP 需要强制刷新或等待下一次自动更新。

## 服务器上有旧配置档但无法使用

如果配置档 JSON 指向的端口已不在 `config.json` 中，说明它已经过期。
新订阅不会下发这些线路，旧令牌返回 `410 Gone`。

## 客户端连不上

按顺序排查：

1. HAPP 版本过旧 —— 更新到 `3.3.6` 或更高版本，彻底退出所有旧 HAPP 进程，只启动一个
   最新实例，然后刷新订阅。
2. 绿色延迟并不能证明主 TUN 正常：HAPP 使用独立的临时 Xray-core 检测线路。在 Linux 上运行
   `ss -lntp | grep ':10808'`；如果没有输出，说明主 core 没有监听，请彻底重启 HAPP。
3. 客户端不支持该传输方式 —— 先用订阅链接或 TCP 线路。
4. SNI 不合适 —— 用 `sudo xrayebator probe-test` 检查并更换。
5. 服务商封锁了端口 —— 更换配置档端口。
6. 指纹被识别 —— 尝试用 `firefox` 代替 `chrome`。
7. 订阅已过期 —— 确认线路存在于运行中的 `config.json`。

Xrayebator 3.0 还会一次性删除旧版本安装的 UDP/443 阻断规则。该规则可能在 TCP 线路检测仍为
绿色时破坏 Telegram。带有额外匹配条件的运维人员自定义路由规则会被保留。

建议常备 2-4 个配置档，便于紧急切换。

## 配置过程中被踢出服务器

连接自己的 VPN 之后再在服务器上做修改，SSH 可能会断开。
最简单的办法是不要通过自己的线路访问服务器。也可以启用 keep-alive：

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

## 整个互联网都无法访问

请检查客户端 DNS。服务商封锁 VPN 时，DNS 往往最先出问题。
在客户端保留一份备用订阅链接列表。桌面客户端还要确认是否需要开启 TUN 模式来做系统代理。

## 可以接入多少用户

界面没有硬性的配置档数量限制。实际容量受 CPU、内存、VPS 带宽、线路数量以及服务商限制约束。
请逐步增加用户数并观察负载。

多个配置档可以同时使用：不同的订阅、SNI、端口和线路提供了更多绕过封锁的选择，
但它们共享同一台 VPS 的资源。

## 安装或使用过程中出现报错

请完整复制终端中的报错文本。如果问题出在 Xrayebator 代码上，请提交 issue。
