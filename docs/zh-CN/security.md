# 安全

[← 返回 README](../../README.zh-CN.md) · [English](../security.md) · [Русский](../ru/security.md)

章节：[服务账户与权限](#服务账户与权限) · [订阅安全](#订阅安全) · [VPS 的 SSH 访问](#vps-的-ssh-访问)

---

## 服务账户与权限

Xray 以系统用户 `xray` 运行。Drop-in 文件
`/etc/systemd/system/xray.service.d/security.conf` 设置 `User=xray`，
并把能力集收窄为 `CAP_NET_BIND_SERVICE`，这足以绑定低端口。
只有在系统没有自带单元时，安装脚本才会创建基础单元，该单元声明了更宽的 bounding set，
但 drop-in 会覆盖这两条指令。

状态文件的实际权限：

| 路径 | 属主 | 权限 |
|---|---|---|
| `/usr/local/etc/xray/` | `xray:xray` | 递归 |
| `config.json` | `xray:xray` | `0644` |
| `.private_key` | `xray:xray` | `0600` |
| `.public_key` | `xray:xray` | `0644` |

也就是说，服务账户可以写入自己的配置与配置档。

> 不要在 `/usr/local/etc/xray/` 中放置任何随后会被 root 执行或 `source` 的内容，
> 也不要在该目录保存无关的机密信息。

## 订阅安全

订阅链接不能视为公开信息。它由不可猜测的令牌保护，但任何拿到链接的人都能下载线路列表。

服务端已经做到的：

- 32 位十六进制令牌，由 `openssl rand -hex 16` 生成；
- 不带有效令牌访问 `/sub/` 一律返回相同的 `404`；
- 没有存活线路的配置档返回 `410`，不下发任何线路；
- nginx 添加 `Cache-Control: no-store`；
- 根路径 `/` 以及 `/sub/` 之外的任何路径返回 `404`；
- `/sub/` location 设有限流；
- `Revoke` 会轮换 `sub_token`。

需要运维自己注意的：

- 不要把订阅链接发到公开聊天中；
- 一旦泄露立即点击 `Revoke`；
- 不要把仅本地的链接交给外部客户端；
- 在没有理清 nginx 配置之前，不要在同一域名下托管他人的面板或代理。

## VPS 的 SSH 访问

Xrayebator 可以直接以 `root` 安装，但更稳妥的做法是使用独立用户。

在服务器上：

```bash
adduser <username>
usermod -aG sudo <username>
su - <username>
```

在自己的电脑上：

```bash
ssh-keygen -t ed25519 -C <your_email@example.com>
ssh-copy-id <username>@<服务器IP>
```

然后以 `<username>@<服务器IP>` 登录。确认密钥登录可用之后，再关闭密码登录，
必要时禁止 root 登录：

```bash
sudo nano /etc/ssh/sshd_config
```

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

> 丢失 SSH 密钥就等于失去服务器访问权限。先确认密钥登录正常，再关闭密码登录。

为了让 SSH 会话在配置 VPN 期间不断开，keep-alive 很有用：

```text
ClientAliveInterval 60
ClientAliveCountMax 120
TCPKeepAlive yes
```
