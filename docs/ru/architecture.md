# Архитектура

[← Назад к README](../../README.ru.md) · [English](../architecture.md) · [简体中文](../zh-CN/architecture.md)

Разделы: [Репозиторий](#репозиторий) · [Состояние на сервере](#состояние-на-сервере) ·
[Инбаунд против профиля](#инбаунд-против-профиля) ·
[Как работает подписка](#как-работает-подписка) · [Десктоп-GUI](#десктоп-gui)

---

## Репозиторий

```text
Xrayebator/
├── xrayebator            # основное приложение: меню, профили, инбаунды, routing, миграции
├── install.sh            # установка ядра, сервиса, прав, geo-баз, лайфсайкл-команд
├── update.sh             # обновление самого Xrayebator из выбранной ветки
├── uninstall.sh          # снятие сервиса и конфигурации
├── src/                  # десктоп-GUI (Electron + React)
│   ├── main/             # основной процесс: окно, трей, автоапдейт, IPC-хендлеры
│   │   ├── core/         # SSH-клиент, деплойер, менеджер профилей, менеджер сервера,
│   │   │                #   подписка, хранилище серверов (electron-store)
│   ├── preload/          # contextBridge между renderer и main process
│   ├── renderer/         # React-UI: Dashboard, AddServer, ServerKeys, ServerSettings
│   │   └── src/i18n/     # ru.json, en.json, zh.json; переключатель языка в localStorage
│   └── shared/           # TypeScript-типы, общие между main и renderer
├── tests/                # Vitest unit-тесты помощников GUI
├── validation/           # статические и локальные regression-тесты
├── gui-legacy/           # legacy PySide6 GUI (больше не актуальное приложение)
├── docs/                 # документация: ru, en, zh-CN
├── sni_list.txt          # набор SNI-кандидатов
├── ascii_art.txt         # заголовок терминального интерфейса
├── CLAUDE.md             # рабочие правила и политики проекта
└── LICENSE
```

Основная логика управления живёт в одном файле `xrayebator`. Скрипты `install.sh`, `update.sh` и
`uninstall.sh` отвечают за жизненный цикл. Генерируемые `subhttp.sh`, конфиг nginx и systemd-юнит
образуют путь HAPP-подписки.

## Состояние на сервере

```text
/usr/local/bin/
├── xray                          # ядро
├── xrayebator                    # менеджер
├── subhttp.sh                       # backend подписки
├── xrayebator-update
└── xrayebator-uninstall

/usr/local/etc/xray/
├── config.json                   # инбаунды, outbounds, routing, DNS
├── profiles/<name>.json          # метаданные профиля: routes, sub_token, SNI, fingerprint
├── upstreams/cascade.json        # параметры upstream каскада
├── backups/config_<timestamp>_<op>.json          # бэкапы конфига перед каждой правкой
├── .private_key / .public_key    # ключи Reality, генерируются один раз при установке
├── .vless_decryption             # PQ-ключи для xhttp-pq
├── .vless_encryption
├── .subscription_mode            # режим публикации подписки
├── .subscription_domain          # домен подписки, DNS-запись сама его не меняет
├── .subscription_port            # 443 или 8443
├── .happ_defaults.env            # настройки HAPP, включая имя сервера в клиенте
├── .current_branch               # ветка, из которой обновляется Xrayebator
└── .xhttp_migrated, ...          # marker-файлы выполненных миграций

/usr/local/share/xray/            # geoip.dat и geosite.dat
/etc/systemd/system/xray.service.d/security.conf
/etc/systemd/system/xrayebator-sub.service
/etc/nginx/sites-available/xrayebator-sub
/etc/nginx/sites-available/xrayebator-selfsteal
```

## Инбаунд против профиля

Инбаунд — блок в `config.json`, привязанный к порту. Профиль — JSON-файл с метаданными для
пользователя. Несколько профилей могут жить на одном инбаунде, то есть на одном порту.

Из этого следует главное: SNI и fingerprint инбаунда общие для всех профилей на этом порту. Смена
SNI на порту затрагивает все профили, которые на нём висят.

## Как работает подписка

`xrayebator-sub.service` слушает `127.0.0.1:8080`, наружу его публикует nginx по HTTPS. Endpoint:

```text
https://<домен-или-ip>/sub/<32-hex-token>
```

Токен лежит в profile JSON как `sub_token`. При компрометации используйте `Revoke` в меню
подписки — токен меняется, старый URL умирает.

Название подписки в клиенте задаётся отдельно от имени профиля: `Подписка HAPP` → `Настройки HAPP` →
`HAPP_SERVER_NAME`. Так несколько VPS можно по-разному подписать в списке клиента, даже если
внутренний профиль на каждом называется `happ`. При пустом значении используется имя профиля.

Поведение по клиентам:

- HAPP получает plain-text список `vless://`, HAPP-заголовки и опциональный `happ://routing/onadd/...`;
- `v2rayNG` и `v2rayN` получают классический base64-body без HAPP-метаданных;
- профили без живого инбаунда не показываются в меню подписки, а их старые URL возвращают `410 Gone`.

## Правки конфига

Любое изменение проходит один и тот же путь:

```text
backup_config ────► /usr/local/etc/xray/backups/config_<timestamp>_<op>.json
safe_jq_write ────► временный файл в целевом каталоге → валидация → атомарный rename
safe_restart_xray ► xray run -test -config → systemctl restart
                    при ошибке — rollback из бэкапа, Xray работает на старом конфиге
```

Миграции выполняются один раз и отмечаются marker-файлами в `/usr/local/etc/xray/`. Схема одна:
маркер отсутствует → backup → правка → рестарт → создать маркер.

## Десктоп-GUI

Десктоп-приложение (`src/`) — парольный CLI-фронтенд поверх SSH. Оно никогда не правит
`config.json` напрямую: каждая операция мапится на документированную CLI-команду, выполненную на
сервере:

| Действие GUI | Команда на сервере |
|---|---|
| Добавить сервер / деплой | upload `install.sh` + `xrayebator` → `bash install.sh` → `xrayebator quickstart --email <email>` |
| Обновить подписку | HTTP GET сохранённого URL подписки |
| Список профилей | `xrayebator profiles` |
| Создать профиль | `xrayebator profile-create --name N [--transport T] [--port P] [--count N]` |
| Удалить профиль | `xrayebator profile-delete --name N` |
| Сменить fingerprint | `xrayebator fp-change --name N [--route R] --fp F` |
| Сменить SNI | `xrayebator sni-change --name N [--route R] --sni S` |
| Загрузить SNI-кандидатов | `xrayebator sni-list` |
| Сменить порт | `xrayebator port-change --name N [--route R] --port P` |
| Обновить сервер | `xrayebator update <branch>` (self-update + ядро) |
| Удалить сервер | upload `uninstall.sh` → `yes | bash uninstall.sh` |

Renderer общается с main process только через `window.api` (мост preload через `contextBridge`,
`contextIsolation: true`). Main process владеет единственной копией SSH-библиотеки (`ssh2`);
renderer не видит креды за пределами того единственного IPC-вызова, которому они нужны.
Метаданные серверов хранятся через `electron-store` в каталоге данных приложения; SSH-пароль
держится в памяти на время одной операции.

Границы процессов:

```text
renderer (React)
    │  window.api (preload-мост, contextIsolated)
    ▼
main process  ──►  ssh2 (SSH)  ──►  xrayebator CLI на VPS
```
