# 架构

[← 返回 README](../../README.zh-CN.md) · [English](../architecture.md) · [Русский](../ru/architecture.md)

章节：[仓库结构](#仓库结构) · [服务器上的状态](#服务器上的状态) ·
[入站与配置档的区别](#入站与配置档的区别) · [订阅如何工作](#订阅如何工作) ·
[桌面图形界面](#桌面图形界面)

---

## 仓库结构

```text
Xrayebator/
├── xrayebator            # 主程序：菜单、配置档、入站、路由、迁移
├── install.sh            # 安装内核、服务、权限、geo 数据库、生命周期命令
├── update.sh             # 从指定分支更新 Xrayebator 本身
├── uninstall.sh          # 移除服务与配置
├── src/                  # 桌面图形界面（Electron + React）
│   ├── main/             # 主进程：窗口、托盘、自动更新、IPC 处理器
│   │   ├── core/         # SSH 客户端、部署器、配置档管理器、服务器管理器、
│   │   │                #   订阅、服务器存储（electron-store）
│   ├── preload/          # 渲染进程与主进程之间的 contextBridge
│   ├── renderer/         # React UI：Dashboard、AddServer、ServerKeys、ServerSettings
│   │   └── src/i18n/     # ru.json、en.json、zh.json；localStorage 中的语言切换
│   └── shared/           # main 与 renderer 共享的 TypeScript 类型
├── tests/                # GUI 辅助函数的 Vitest 单元测试
├── validation/           # 静态与本地回归测试
├── gui-legacy/           # 旧版 PySide6 桌面图形界面（不再是活跃应用）
├── docs/                 # 文档：en、ru、zh-CN
├── sni_list.txt          # 候选 SNI 列表
├── ascii_art.txt         # 终端界面标题图
├── CLAUDE.md             # 项目工作规则与策略
└── LICENSE
```

管理逻辑集中在单个 `xrayebator` 文件中。`install.sh`、`update.sh` 与 `uninstall.sh`
负责生命周期。生成的 `subhttp.sh`、nginx 配置与 systemd 单元共同构成 HAPP 订阅链路。

## 服务器上的状态

```text
/usr/local/bin/
├── xray                          # 内核
├── xrayebator                    # 管理器
├── subhttp.sh                       # 订阅后端
├── xrayebator-update
└── xrayebator-uninstall

/usr/local/etc/xray/
├── config.json                   # 入站、出站、路由、DNS
├── profiles/<name>.json          # 配置档元数据：routes、sub_token、SNI、指纹
├── upstreams/cascade.json        # 级联上游参数
├── backups/config_<timestamp>_<op>.json          # 每次改动前的配置备份
├── .private_key / .public_key    # Reality 密钥，安装时生成一次
├── .vless_decryption             # xhttp-pq 使用的 PQ 密钥
├── .vless_encryption
├── .subscription_mode            # 订阅发布模式
├── .subscription_domain          # 订阅域名，仅改 DNS 记录不会改变它
├── .subscription_port            # 443 或 8443
├── .happ_defaults.env            # HAPP 设置，含客户端中显示的服务器名
├── .current_branch               # Xrayebator 的更新分支
└── .xhttp_migrated, ...          # 已完成迁移的标记文件

/usr/local/share/xray/            # geoip.dat 与 geosite.dat
/etc/systemd/system/xray.service.d/security.conf
/etc/systemd/system/xrayebator-sub.service
/etc/nginx/sites-available/xrayebator-sub
/etc/nginx/sites-available/xrayebator-selfsteal
```

## 入站与配置档的区别

入站是 `config.json` 中与端口绑定的配置块；配置档是面向用户的元数据 JSON 文件。
多个配置档可以位于同一个入站上，也就是同一个端口上。

由此得出关键结论：入站的 SNI 与指纹由该端口上的所有配置档共享。
修改某个端口的 SNI 会影响挂在该端口上的全部配置档。

## 订阅如何工作

`xrayebator-sub.service` 监听 `127.0.0.1:8080`，由 nginx 通过 HTTPS 对外发布。端点形如：

```text
https://<域名或IP>/sub/<32位十六进制令牌>
```

令牌以 `sub_token` 保存在配置档 JSON 中。一旦泄露，请在订阅菜单中使用 `Revoke`：
令牌会更换，旧链接立即失效。

客户端中显示的订阅名称与配置档名称是分开设置的：
`Подписка HAPP` → `Настройки HAPP` → `HAPP_SERVER_NAME`。
因此即使每台 VPS 上的内部配置档都叫 `happ`，也可以在客户端列表中显示不同名称。
留空时使用配置档名称。

各客户端的行为：

- HAPP 收到纯文本的 `vless://` 列表、HAPP 头部以及默认启用的托管
  `happ://routing/onadd/...` 配置；
- 该配置通过令牌保护的 `/sub/<token>/geoip.dat` 与 `/sub/<token>/geosite.dat`
  下载 geo 数据库，因此客户端无需直连 GitHub；
- `v2rayNG` 与 `v2rayN` 收到不含 HAPP 元数据的经典 base64 订阅体；
- 没有存活入站的配置档不会出现在订阅菜单中，其旧链接返回 `410 Gone`。

如需关闭，可在 `.happ_defaults.env` 中设置 `HAPP_ROUTING_ENABLED=false`。自定义
`.happ_routing.json` 只有通过严格的 HAPP 结构校验后才会覆盖托管配置；无效 JSON 会回退到
托管配置，并把原因写入服务日志。

## 配置改动流程

任何改动都走同一条路径：

```text
backup_config ────► /usr/local/etc/xray/backups/config_<timestamp>_<op>.json
safe_jq_write ────► 在目标目录内写临时文件 → 校验 → 原子重命名
safe_restart_xray ► xray run -test -config → systemctl restart
                    失败时从备份回滚，Xray 继续使用旧配置
```

迁移只执行一次，并由 `/usr/local/etc/xray/` 下的标记文件记录。流程始终一致：
标记不存在 → 备份 → 修改 → 重启 → 写入标记。

## 桌面图形界面

桌面应用（`src/`）是通过 SSH 调用 CLI 的、以密码为前置条件的界面。它从不直接修改
`config.json`：每个操作都映射到服务器上执行的一条已文档化 CLI 命令：

| GUI 操作 | 服务器命令 |
|---|---|
| 添加服务器 / 部署 | 上传 `install.sh` + `xrayebator` → `bash install.sh` → `xrayebator quickstart --email <邮箱>` |
| 刷新订阅 | HTTP GET 已保存的订阅链接 |
| 列出配置档 | `xrayebator profiles` |
| 创建配置档 | `xrayebator profile-create --name N [--transport T] [--port P] [--count N]` |
| 删除配置档 | `xrayebator profile-delete --name N` |
| 修改指纹 | `xrayebator fp-change --name N [--route R] --fp F` |
| 修改 SNI | `xrayebator sni-change --name N [--route R] --sni S` |
| 加载候选 SNI | `xrayebator sni-list` |
| 修改端口 | `xrayebator port-change --name N [--route R] --port P` |
| 更新服务器 | `xrayebator update <分支>`（自更新 + 内核） |
| 卸载服务器 | 上传 `uninstall.sh` → `yes | bash uninstall.sh` |

渲染进程只能通过 `window.api` 与主进程通信（preload 桥接使用 `contextBridge`，
`contextIsolation: true`）。主进程独占唯一的 SSH 库副本（`ssh2`）；渲染进程除单个需要凭据的
IPC 调用外，永远不会接触凭据。服务器元数据通过 `electron-store` 保存在应用数据目录中；
SSH 密码仅在一次操作期间驻留内存。

进程边界：

```text
渲染进程 (React)
    │  window.api（preload 桥接，contextIsolated）
    ▼
主进程  ──►  ssh2 (SSH)  ──►  服务器上的 xrayebator CLI
```
