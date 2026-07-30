<div align="center">

# Xrayebator

<h3>
Xray VLESS Reality на своём VPS: <strong>инбаунды</strong> · <strong>профили</strong> ·
<strong>HAPP-подписка</strong> · <strong>bypass</strong> · <strong>каскад</strong>
</h3>

<p>
<img alt="Bash 5.0+" src="https://img.shields.io/badge/bash-5.0%2B-4EAA25?style=flat-square&logo=gnubash&logoColor=white">
<img alt="Xray-core Reality" src="https://img.shields.io/badge/Xray--core-Reality-22D3EE?style=flat-square">
<img alt="HAPP subscription" src="https://img.shields.io/badge/subscription-HAPP-A78BFA?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square"></a>
</p>

<p>
<strong>Один bash-скрипт превращает чистый VPS в личный VLESS Reality сервер.</strong><br>
Xrayebator ставит Xray-core, поднимает Reality-инбаунды на случайных портах, создаёт профиль
из семи маршрутов и отдаёт их клиенту одной HTTPS-ссылкой подписки. Актуальная линия — 2.0.
</p>

</div>

```bash
curl -fsSLo ./xrayebator-install.sh \
  https://raw.githubusercontent.com/howdeploy/Xrayebator/main/install.sh
less ./xrayebator-install.sh          # просмотрите скрипт перед запуском
sudo bash ./xrayebator-install.sh
```

<div align="center">

<p>
Debian 12/13 · Ubuntu 22.04/24.04 · от 512 MB RAM · права <code>root</code> или <code>sudo</code><br>
Дальше — <code>sudo xrayebator</code> → пункт <code>9</code> и подписка готова.
Подробности: <a href="#быстрый-старт">Быстрый старт</a>
</p>

<p>
<a href="#зачем-это-нужно">Назначение</a> ·
<a href="#карта-возможностей">Возможности</a> ·
<a href="#как-это-работает">Как это работает</a> ·
<a href="#быстрый-старт">Быстрый старт</a> ·
<a href="#настройка">Настройка</a> ·
<a href="#архитектура">Архитектура</a> ·
<a href="#безопасность">Безопасность</a> ·
<a href="#тесты">Тесты</a> ·
<a href="#известные-ограничения">Ограничения</a>
</p>

</div>

---

## Зачем это нужно

Личный VLESS Reality — это десяток ручных шагов: собрать инбаунд, сгенерировать ключи, подобрать
SNI, не сломать конфиг, раздать ссылку на телефон. Одна опечатка в `config.json` — и Xray не
поднимается.

Одного маршрута при этом мало. DPI режет транспорты неравномерно: в одной сети живёт TCP Vision, в
другой — только gRPC, в третьей вообще ничего кроме XHTTP. Держать под это несколько отдельных
конфигов вручную неудобно.

Xrayebator решает обе задачи так:

- профиль — это не один маршрут, а набор `routes` с общим `sub_token`;
- клиент получает весь набор одной короткой ссылкой подписки, а не семью ссылками `vless://`;
- любое изменение конфига идёт через backup, валидацию `xray run -test` и авто-rollback, поэтому
  неудачная правка не оставляет сервер без VPN;
- смена SNI, порта или fingerprint не требует пересоздавать профиль.

Проект развивает и тестирует один человек. Ограничения из этого следуют прямо и описаны в разделе
[Известные ограничения](#известные-ограничения) — читайте его до установки на важный VPS.

## Карта возможностей

| Возможность | Что делает | Где реализовано |
|---|---|---|
| Установка Xray-core | Скачивает релиз с GitHub, обязательно сверяет SHA-256 с `.dgst`, ставит бинарь через `install -m 755`, делает self-test | `install.sh` |
| Reality-инбаунды | Поднимает инбаунды на свободных портах `30000-60000`, сверяясь и с `config.json`, и с реально слушающими сокетами | `xrayebator` |
| Multi-route профиль | Один профиль = набор маршрутов с общим `sub_token`; несколько профилей могут делить один порт | `profiles/<name>.json` |
| HAPP-подписка | Локальный HTTP-сервер отдаёт список `vless://` и HAPP-метаданные, наружу его публикует nginx по HTTPS | `subhttp.sh`, `xrayebator-sub.service` |
| Post-quantum XHTTP | Маршрут `xhttp-pq` работает с VLESS-шифрованием `mlkem768x25519plus` | `.vless_encryption`, `.vless_decryption` |
| Совместимость с v2ray | `v2rayNG`/`v2rayN` получают классический base64-body без HAPP-метаданных | `subhttp.sh` |
| Revoke подписки | Генерирует новый 32-символьный hex-токен, старый URL перестаёт работать | `openssl rand -hex 16` |
| Bypass routing | Семь групп доменов можно отправить напрямую через `freedom`, минуя VPN | меню `11` |
| Каскад | Переключает catch-all `tcp,udp` на зарубежный VLESS Reality upstream типа `tcp` или `xhttp` | `upstreams/cascade.json` |
| Self-steal заглушка | Ставит nginx с валидным сертификатом на `127.0.0.1:9444` и заводит Reality fallback на него | меню `13` |
| Безопасная запись JSON | Пишет временный файл в целевом каталоге, валидирует, атомарно переименовывает | `safe_jq_write` |
| Безопасный рестарт | Прогоняет `xray run -test -config` до рестарта; при ошибке откатывает конфиг из бэкапа | `safe_restart_xray` |
| Миграции | Одноразовые миграции по marker-файлам: backup → правка → рестарт → маркер | `run_migration` |
| geo-базы | Кладёт расширенные `geoip.dat` и `geosite.dat` из релизов Loyalsoldier в `/usr/local/share/xray` | `install.sh` |

Не поддерживается и не заявляется: H2, WebSocket, SplitHTTP, подписки Clash/mihomo, переводы README
на другие языки.

## Как это работает

Управляющий поток. Любая правка конфига проходит один и тот же путь:

```text
sudo xrayebator
      │
      ▼
xrayebator  (bash)
создание профиля · смена SNI/port/fingerprint · миграции · routing
      │
      ├─ backup_config ───────► /usr/local/etc/xray/backups/<timestamp>
      │
      ├─ safe_jq_write ───────► config.json  +  profiles/<name>.json
      │
      └─ safe_restart_xray
               │
               ├─ xray run -test -config  → ok ──► systemctl restart xray
               │
               └─ конфиг невалиден ───────────────► rollback из бэкапа,
                                                    Xray продолжает работать
                                                    на старом конфиге
```

Клиентский поток. От ссылки подписки до выхода в интернет:

```text
клиент (HAPP)
    │  https://<домен-или-ip>/sub/<32-hex-token>
    ▼
nginx  :443  (или :8443, если 443 занят)
    │  proxy_pass
    ▼
xrayebator-sub.service   127.0.0.1:8080
    │  читает profiles/*.json и сверяет маршруты с живым config.json
    ▼
список vless://  — из 7 маршрутов профиля HAPP получает 6
    │
    ▼
Reality-инбаунд на порту 30000-60000   (User=xray, CAP_NET_BIND_SERVICE)
    │
    ├─ домен из включённой bypass-группы ──► freedom  (напрямую, без VPN)
    │
    └─ весь остальной tcp/udp ────────────► direct
                                            ИЛИ cascade-upstream ──► зарубежный VPS
```

### Маршруты профиля

HAPP-флоу создаёт или переиспользует профиль из семи маршрутов:

| Маршрут | Транспорт | Назначение |
|---|---|---|
| `xhttp-legacy` | xhttp | HAPP-совместимый XHTTP-фолбэк, `decryption=none`, без PQ |
| `xhttp-pq` | xhttp | XHTTP с post-quantum шифрованием `mlkem768x25519plus` |
| `tcp-mux` | tcp | TCP Reality без Vision-flow, отдельный совместимый фолбэк |
| `grpc` | grpc | gRPC Reality; чувствителен к HTTP/2 и SNI |
| `tcp-vision` | tcp | TCP Reality с `xtls-rprx-vision` |
| `tcp-utls-firefox` | tcp | TCP Vision с отпечатком Firefox |
| `tcp-xudp` | tcp | TCP Vision + XUDP, узкий фолбэк для жёстких мобильных сетей |

В подписку HAPP уходит шесть маршрутов из семи: если в профиле есть `xhttp-legacy`, то
PQ-XHTTP не отдаётся как XHTTP-кандидат. В самом profile JSON при этом остаются все семь.

Базовый client fingerprint для новых и обновлённых профилей — `firefox`. Явно выбранные отпечатки,
отличные от устаревшего `chrome`, при обновлении сохраняются.

Порядок маршрутов в подписке стабилен, но это не рейтинг «лучший → худший». Работоспособность
транспорта зависит от клиента, версии Xray-core внутри него и конкретной сети.

### Режимы публикации подписки

| Режим | Что получается | Когда использовать |
|---|---|---|
| Public TLS по IP VPS | `https://<ip>/sub/<token>` | Быстрый старт без домена. Сертификаты Let's Encrypt на IP короткоживущие, renew обязателен |
| Public TLS по домену | `https://sub.example.com/sub/<token>` | Рекомендуется для постоянного использования |
| Local-only debug | `http://127.0.0.1:8080/sub/<token>` | Только проверка с самого VPS или через SSH-туннель. С телефона напрямую не работает |

---

## Быстрый старт

### Требования

- VPS с Debian 12/13 или Ubuntu 22.04/24.04 LTS и доступом `root` либо `sudo`
- RAM от 512 MB, рекомендуется 1 GB и больше
- 1 ядро CPU, рекомендуется 2 и больше
- 1 GB свободного места на диске

Установщик тянет пакеты `ca-certificates curl wget jq qrencode uuid-runtime ufw unzip openssl socat`.

> Версию ОС установщик не проверяет — матрица выше заявленная, а не форсируемая. Основная
> field-проверка идёт на Debian. Перед установкой на важный VPS сделайте снапшот.

### Установка

Скачайте скрипт, просмотрите его и только затем запустите локальный файл от root:

```bash
curl -fsSLo ./xrayebator-install.sh \
  https://raw.githubusercontent.com/howdeploy/Xrayebator/main/install.sh
less ./xrayebator-install.sh
sudo bash ./xrayebator-install.sh
```

> Установщик задаёт вопрос про TCP-тюнинг и самостоятельно управляет UFW. Разберитесь с разделами
> [Переменные окружения установщика](#переменные-окружения-установщика) и
> [Firewall и системные sysctl](#firewall-и-системные-sysctl) ДО запуска, особенно если SSH висит на
> нестандартном порту.

### Подписка HAPP за пять шагов

1. Запустите меню:

   ```bash
   sudo xrayebator
   ```

2. Выберите `9) Подписка HAPP`.
3. Выберите режим публикации: по IP VPS — быстро и без домена, по домену — для постоянного
   использования.
4. Xrayebator создаст профиль `happ`, поднимет инбаунды, выпустит сертификат и покажет URL и QR-код.
5. Импортируйте в HAPP именно subscription URL или QR, а не отдельную ссылку `vless://`.

Для ручного контроля SNI, транспорта или отдельного маршрута используйте `1) Создать новый профиль`.

---

## Настройка

### Переменные окружения установщика

| Переменная | Значение | Что делает |
|---|---|---|
| `XRAY_TCP_TUNING` | `none` · `bbr` · `extended` | Задаёт режим TCP-тюнинга заранее, вопрос при установке не задаётся |
| `XRAY_FORCE_IPV4` | `1` | Принудительно качает релиз Xray по IPv4 |
| `XRAY_DOWNLOAD_PROXY` | URL прокси | Скачивание ядра через HTTP или SOCKS прокси |
| `XRAY_LOCAL_ZIP` | путь к файлу | Берёт локальный ZIP ядра вместо загрузки |
| `XRAY_LOCAL_DGST` | путь к файлу | Берёт локальный `.dgst` манифест SHA-256 |

Если GitHub Releases недоступен:

```bash
XRAY_FORCE_IPV4=1 XRAY_DOWNLOAD_PROXY=socks5h://127.0.0.1:1080 \
  sudo -E bash ./xrayebator-install.sh
```

Либо скачайте официальный ZIP и `.dgst` любым другим каналом и передайте локальные пути. Проверка
SHA-256 обязательна и не отключается:

```bash
XRAY_LOCAL_ZIP=/tmp/Xray-linux-64.zip \
XRAY_LOCAL_DGST=/tmp/Xray-linux-64.zip.dgst \
  sudo -E bash ./xrayebator-install.sh
```

### Firewall и системные sysctl

TCP congestion control установщик спрашивает отдельным шагом. Вариант по умолчанию — ничего не
менять. Если выбрать BBR или расширенный тюнинг, установщик пишет
`/etc/sysctl.d/99-xrayebator-tcp.conf` и применяет `sysctl --system`. В неинтерактивном режиме, без
TTY, применяется `none`.

UFW установщик настраивает сам: ставит пакет `ufw`, при неактивном UFW включает его командой
`ufw --force enable`, затем открывает порты `22, 80, 443, 8443, 2053, 2083, 2087, 8080, 2096, 8880,
9443/tcp` и перезагружает правила.

> Список портов фиксированный, вашего SSH-порта в нём может не быть. Если SSH висит не на `22` или у
> вас своя политика firewall — сравните numbered rules до и после установки. Правила, открытые
> установщиком, при удалении Xrayebator не убираются.

### Главное меню

| Пункт | Назначение |
|---|---|
| `1` | Создать профиль вручную: одиночный маршрут или набор |
| `2` | Удалить профиль и связанные инбаунды |
| `3` | Показать данные подключения по профилю |
| `4` | Управление профилем: SNI, fingerprint, port, advanced |
| `8` | Обновить отдельный профиль до PQ XHTTP |
| `9` | Подписка HAPP: профиль из 7 маршрутов, public TLS, URL, QR, revoke |
| `11` | Bypass routing: домены напрямую, минуя VPN |
| `12` | Каскад и upstream-ноды |
| `13` | Собственный домен и self-steal заглушка |
| `14` | Поднять outbound-сервер, чтобы использовать этот VPS как зарубежную ноду каскада |
| `0` | Выход |

Нумерация с пропусками — пункты `5`, `6`, `7` и `10` в текущей версии отсутствуют.

Смена SNI или порта перезапускает соответствующий серверный инбаунд. Fingerprint — клиентский
параметр: он меняется только у выбранного маршрута и не требует перезапуска Xray. После любого
изменения обновите подписку в клиенте принудительно или заново получите raw route через
`3) Подключиться по профилю`.

### Команды

| Команда | Что делает |
|---|---|
| `sudo xrayebator` | Открыть интерактивное меню |
| `sudo xrayebator update` | Обновить **только ядро Xray-core**, сам Xrayebator не трогается |
| `sudo xrayebator probe-test` | Проверить с VPS доступность SNI перед его сменой |
| `sudo xrayebator-update` | Обновить **сам Xrayebator** из ветки, запомненной в `.current_branch` |
| `sudo xrayebator-update main` | Обновить сам Xrayebator принудительно из ветки `main` |
| `sudo xrayebator-uninstall` | Снять сервис и конфигурацию, см. [Обновление и удаление](#обновление-и-удаление) |

Разница `xrayebator update` и `xrayebator-update main` — принципиальная, названия похожи только
внешне:

| | `sudo xrayebator update` | `sudo xrayebator-update main` |
|---|---|---|
| Что обновляет | Бинарь Xray-core | Скрипты самого Xrayebator |
| Откуда берёт | GitHub Releases проекта XTLS | GitHub-ветка `main` этого репозитория |
| Аргумент | Не принимает | Принимает имя ветки: `main`, `dev`, `experimental` или любую другую |
| На что влияет | Версия ядра, транспорты, протоколы | Меню, миграции, генерация подписки |
| Побочный эффект | Перезапуск Xray после проверки конфига | Прогон миграций при следующем запуске меню |

### Bypass routing

Bypass добавляет правила в Xray routing, чтобы выбранные домены шли через `freedom` напрямую, не
через VPN. Правила `domain -> direct` стоят выше catch-all, поэтому продолжают работать и при
включённом каскаде.

Группы дефолтного бандла:

| Группа | Содержимое |
|---|---|
| `steam` | Steam: CDN, чат, community |
| `banks` | RU-банки и платежи |
| `marketplaces` | RU-маркетплейсы и retail |
| `streaming` | RU-стриминг и медиа |
| `yandex` | Экосистема Yandex |
| `vk` | VKontakte |
| `mailru` | VK Group и Mail.ru |

Меню интерактивное: стрелки двигают выбор, пробел включает и выключает группу, Enter применяет.

### Каскад и upstream-ноды

Каскад — серверный режим outbound и routing, а не новый профиль клиента. Клиент продолжает
подключаться к текущему VPS:

```text
клиент → текущий VPS → зарубежный VLESS Reality upstream → интернет
```

Меню `12` сохраняет параметры в `/usr/local/etc/xray/upstreams/cascade.json`, добавляет outbound
`cascade-upstream` и переключает только catch-all правило `network=tcp,udp`.

Поддерживаются upstream двух типов: VLESS Reality over TCP, включая Vision и XUDP, и XHTTP. Меню
принимает готовую ссылку `vless://` и переносит transport-специфичные параметры само; при ручном
вводе нужны `address`, `port`, `uuid`, `publicKey`, `shortId`, SNI и fingerprint. Если каскад уже
активен, смена upstream пересобирает outbound и routing и перезапускает Xray — отдельно выключать и
включать не требуется.

Отключение каскада удаляет outbound `cascade-upstream` и возвращает catch-all в `direct`. Все
изменения идут через `backup_config`, `safe_jq_write` и `safe_restart_xray`.

Пункт `14` настраивает обратную сторону: делает из текущего VPS зарубежную ноду, к которой
подключается каскад с другого сервера.

### Собственный домен и self-steal заглушка

Self-steal ставит nginx с валидным сертификатом на `127.0.0.1:9444`, а Reality-инбаунды получают
`serverNames=[domain]` и `dest=127.0.0.1:9444`. Для XHTTP дополнительно обновляется
`xhttpSettings.host`.

Нужен домен с A- или AAAA-записью на VPS и email для Let's Encrypt. Меню ставит `nginx` и `certbot`,
пишет конфиг в `/etc/nginx/sites-available/xrayebator-selfsteal`, включает и перезагружает nginx,
открывает и лимитирует `80/tcp` при активном UFW и выпускает сертификат через webroot challenge.

Доступные шаблоны: `Simple web template`, `SNI template`, `Nothing SNI template`.

Если инбаунда на `443` нет, Xrayebator создаёт служебный fallback-only Reality инбаунд `inbound-443`
без клиентов — иначе внешний TLS-пробник на `https://domain/` не дойдёт до заглушки.

### Домен и DNS

Для доменного режима создайте `A`-запись на IPv4 VPS. `AAAA` добавляйте только если IPv6 реально
настроен и доступен.

Если домен в Cloudflare, для тестов надёжнее режим `DNS only`, а не `Proxied`: certbot должен
достучаться до VPS по HTTP challenge на порту 80.

Если `443` занят Xray или другим сервисом, подписка уходит на `8443`, и URL получает порт:
`https://domain:8443/sub/<token>`.

---

## Архитектура

### Репозиторий

```text
Xrayebator/
├── xrayebator            # основное приложение: меню, профили, инбаунды, routing, миграции
├── install.sh            # установка ядра, сервиса, прав, geo-баз, лайфсайкл-команд
├── update.sh             # обновление самого Xrayebator из выбранной ветки
├── uninstall.sh          # снятие сервиса и конфигурации
├── validation/           # статические и локальные regression-тесты
├── sni_list.txt          # набор SNI-кандидатов
├── ascii_art.txt         # заголовок терминального интерфейса
├── CLAUDE.md             # рабочие правила и политики проекта
└── LICENSE
```

Основная логика управления живёт в одном файле `xrayebator`. Скрипты `install.sh`, `update.sh` и
`uninstall.sh` отвечают за жизненный цикл. Генерируемые `subhttp.sh`, конфиг nginx и systemd-юнит
образуют путь HAPP-подписки.

### Состояние на сервере

```text
/usr/local/bin/
├── xray                          # ядро
├── xrayebator                    # менеджер
├── subhttp                       # backend подписки
├── xrayebator-update
└── xrayebator-uninstall

/usr/local/etc/xray/
├── config.json                   # инбаунды, outbounds, routing, DNS
├── profiles/<name>.json          # метаданные профиля: routes, sub_token, SNI, fingerprint
├── upstreams/cascade.json        # параметры upstream каскада
├── backups/<timestamp>/          # бэкапы конфига перед каждой правкой
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

### Инбаунд и профиль — не одно и то же

Инбаунд — блок в `config.json`, привязанный к порту. Профиль — JSON-файл с метаданными для
пользователя. Несколько профилей могут жить на одном инбаунде, то есть на одном порту.

Из этого следует главное: SNI и fingerprint инбаунда общие для всех профилей на этом порту. Смена
SNI на порту затрагивает все профили, которые на нём висят.

### Как работает подписка

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

---

## Безопасность

### Сервисный аккаунт и права

Xray работает от системного пользователя `xray`. Drop-in
`/etc/systemd/system/xray.service.d/security.conf` задаёт `User=xray` и сужает капабилити до
`CAP_NET_BIND_SERVICE` — этого достаточно для низких портов. Базовый unit, который установщик
создаёт только при отсутствии пакетного, объявляет более широкий bounding set, но drop-in
перекрывает обе директивы.

Фактические права на состояние: каталог `/usr/local/etc/xray/` целиком принадлежит `xray:xray`,
`config.json` имеет режим `0644`, `.private_key` — `0600`, `.public_key` — `0644`. То есть
сервисный аккаунт может писать в свой конфиг и профили.

> Не размещайте в `/usr/local/etc/xray/` ничего, что root потом исполняет или подключает через
> `source`, и не храните там посторонние секреты.

### Безопасность подписки

URL подписки нельзя считать публичным. Он защищён непрозрачным токеном, но любой, кто получил URL,
скачает список маршрутов.

Что уже сделано на стороне сервера:

- токен 32 hex-символа, генерируется `openssl rand -hex 16`;
- `/sub/` без валидного токена возвращает одинаковый `404`;
- профиль без живых маршрутов возвращает `410` и не выдаёт маршруты;
- nginx добавляет `Cache-Control: no-store`;
- корень `/` и любые пути вне `/sub/` возвращают `404`;
- на location `/sub/` стоит rate limit;
- `Revoke` меняет `sub_token`.

Что остаётся на операторе:

- не публиковать subscription URL в открытых чатах;
- при утечке сразу нажать `Revoke`;
- не отдавать внешнему клиенту local-only URL;
- не держать на том же домене чужие панели и прокси, не разобравшись в конфиге nginx.

### Доступ к VPS по SSH

Установить Xrayebator можно прямо из-под `root`, но по-хорошему нужен отдельный пользователь.

На сервере:

```bash
adduser <username>
usermod -aG sudo <username>
su - <username>
```

На своём компьютере:

```bash
ssh-keygen -t ed25519 -C <your_email@example.com>
ssh-copy-id <username>@<айпи_сервера>
```

Затем зайдите как `<username>@<айпи_сервера>`. Если вход по ключу работает, отключите пароль и при
желании запретите root-login:

```bash
sudo nano /etc/ssh/sshd_config
```

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

> Потеряете SSH-ключи — потеряете доступ к серверу. Сначала убедитесь, что вход по ключу работает, и
> только потом отключайте пароль.

---

## Тесты

```bash
bash -n xrayebator install.sh update.sh uninstall.sh
for test_file in validation/*.sh; do bash "$test_file" || exit; done
shellcheck -S error xrayebator install.sh update.sh uninstall.sh
```

В `validation/` лежат статические и локальные regression-тесты. Они покрывают транзакционную
безопасность и rollback обновления, миграции и починку путей XHTTP-маршрутов, обработчик
HAPP-подписки, синхронность маршрутов и подписки при смене fingerprint, cascade routing и импорт
upstream, отсечение мёртвых stealth-маршрутов, сохранение аргументов multiroute, синхронность
обновления Xray-core и генерацию ссылок `vless://`.

> Статические тесты не заменяют проверку на disposable VPS: создание и удаление профиля, валидацию
> конфига, рестарт сервисов, rollback и реальное подключение клиента.

Ручные проверки на живом сервере:

```bash
sudo xrayebator probe-test                                        # доступность SNI с VPS
sudo /usr/local/bin/xray test -config /usr/local/etc/xray/config.json
sudo systemctl status xray --no-pager -l
sudo systemctl status xrayebator-sub --no-pager -l
curl -sS -i http://127.0.0.1:8080/sub/                            # ожидается 404
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

---

## Известные ограничения

- Установщик включает UFW через `ufw --force enable` и открывает фиксированный список из
  одиннадцати портов. SSH на нестандартном порту в этот список не входит.
- `xrayebator-update` автоматически удаляет обнаруженный `/opt/AdGuardHome` как deprecated: сначала
  возвращает Xray DNS на DoH, затем останавливает сервис и удаляет файлы. Если AdGuard Home на этом
  VPS нужен — не обновляйтесь без снапшота.
- Каталог `/usr/local/etc/xray/` целиком принадлежит `xray:xray`, а `config.json` имеет режим `0644`:
  сервисный аккаунт может писать в собственный конфиг и профили.
- Версию ОС установщик не проверяет. Матрица поддержки заявленная, а не форсируемая.
- Ядро Xray проверяется по SHA-256 обязательно, а geo-базы Loyalsoldier скачиваются без сверки
  контрольной суммы.
- `xrayebator-uninstall` снимает не всё: он останавливает и отключает `xray`, удаляет
  `/usr/local/etc/xray`, `/usr/local/bin/xrayebator` и юниты `xray.service` и `xray@.service`. Он
  НЕ удаляет бинарь `/usr/local/bin/xray`, `subhttp`, `xrayebator-update`, `xrayebator-uninstall`,
  юнит `xrayebator-sub.service`, конфиги nginx, geo-базы, правила UFW и системного пользователя
  `xray`. Остатки убирайте вручную.
- Маршрут `tcp-mux` сохраняется для совместимости, но это не mux-пресет.
- H2, WebSocket, SplitHTTP и подписки Clash/mihomo не поддерживаются.
- Переводов README нет, документация только на русском.
- Ёмкость по пользователям ничем не ограничена в интерфейсе, но упирается в CPU, RAM, канал VPS,
  число маршрутов и лимиты провайдера.

---

## Обновление и удаление

```bash
sudo xrayebator update            # только ядро Xray-core
sudo xrayebator-update            # сам Xrayebator, ветка из .current_branch
sudo xrayebator-update main       # сам Xrayebator, принудительно из main
sudo xrayebator-uninstall         # снять сервис и конфигурацию
```

`xrayebator-update` принимает имя ветки первым аргументом и умеет `main`, `dev`, `experimental` и
любую другую. Выбранная ветка запоминается в `/usr/local/etc/xray/.current_branch` и показывается в
шапке меню.

После обновления самого Xrayebator первый запуск `sudo xrayebator` прогоняет миграции. Дождитесь их
завершения и только потом обновляйте подписку в клиенте.

Если установка уже есть, а подтянуть свежий основной скрипт нужно руками:

```bash
curl -fsSLo ./xrayebator.new \
  https://raw.githubusercontent.com/howdeploy/Xrayebator/main/xrayebator
bash -n ./xrayebator.new
less ./xrayebator.new
sudo install -m 0755 -o root -g root ./xrayebator.new /usr/local/bin/xrayebator
sudo xrayebator
```

Что именно остаётся в системе после `xrayebator-uninstall` — см.
[Известные ограничения](#известные-ограничения).

---

## Troubleshooting

### HAPP не обновляет подписку

Проверьте URL с VPS:

```bash
curl -vkI https://your-domain/sub/
curl -vk https://your-domain/sub/<token>
```

`/sub/` без токена должен вернуть `404`. `/sub/<token>` — `200` и тело со ссылками `vless://`. Затем
сервисы:

```bash
systemctl status xrayebator-sub --no-pager -l
systemctl status nginx --no-pager -l
```

### URL показывает 127.0.0.1

Включён local-only режим, он только для отладки. Для телефона включите
`Подписка HAPP` → public TLS по IP или по домену.

### URL показывает IP, хотя домен уже добавлен

Нужно заново включить доменный режим: `Подписка HAPP` → `Установить public TLS по домену`. Сама
DNS-запись значение `.subscription_domain` не меняет.

### XHTTP в HAPP не работает

XHTTP-кандидатом для HAPP должен быть `xhttp-legacy`, а не `xhttp-pq`. После обновления запустите
`sudo xrayebator`, дождитесь миграций и принудительно обновите подписку в HAPP. Проверьте, что
маршрут есть в профиле, а его порт — в живом конфиге:

```bash
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

Последняя колонка — `pq_enabled`, а не health-статус. Для всех не-PQ маршрутов `false` ожидаем;
`true` должен быть только у `xhttp-pq`.

### v2rayNG то подключается, то нет

`v2rayNG` не основной клиент HAPP-флоу. Он получает v2ray-совместимый body, но маршруты всё равно
зависят от поддержки конкретного транспорта и версии Xray-core внутри клиента. Проверяйте маршруты
по отдельности: универсального порядка «лучший → худший» нет.

### После смены SNI, порта или fingerprint подключение умерло

Это нормально. Обновите подписку в клиенте или заново получите raw route.

Смена fingerprint не перезапускает Xray и не затрагивает другие маршруты. Серверная подписка
обновляется сразу по тому же URL, но HAPP нужно обновить принудительно или дождаться очередного
автообновления.

### На сервере есть старые профили, но они не работают

Если profile JSON указывает на порты, которых уже нет в `config.json`, это устаревший профиль. Новая
подписка такие маршруты не отдаёт, старый токен возвращает `410 Gone`.

### Подключение с клиента не работает

Причины по порядку:

1. Клиент не поддерживает транспорт — начните с subscription URL или TCP-маршрутов.
2. SNI не подходит — проверьте его через `sudo xrayebator probe-test` и замените.
3. Порт блокируется провайдером — смените порт профиля.
4. Fingerprint детектируется — попробуйте `firefox` вместо `chrome`.
5. Подписка устарела — убедитесь, что маршрут есть в живом `config.json`.

Держите наготове 2-4 профиля, чтобы переключаться в экстренной ситуации.

### Меня выкинуло с сервера во время настройки

Если подключиться к своему же VPN и затем менять что-то на сервере, SSH может оборваться. Самое
простое — заходить на сервер не через собственный маршрут. Можно добавить keep-alive:

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

### Пропал доступ ко всему интернету

Проверьте DNS на клиенте. При блокировках VPN-провайдеров DNS ломается первым. Держите на клиенте
список альтернативных ссылок подписки. На настольных клиентах проверьте, включён ли TUN-режим, если
он нужен для системного проксирования.

### Вылезла ошибка при установке или работе

Скопируйте текст ошибки из терминала целиком. Если проблема в коде Xrayebator — открывайте issue.

---

## Клиенты

Импортируйте в клиент subscription URL, а не отдельную ссылку `vless://`. Raw routes через
`3) Подключиться по профилю` нужны для диагностики.

| Клиент | Статус | Комментарий |
|---|---|---|
| HAPP | Рекомендуется | Целевой клиент. Поддерживает подписку по URL и QR и ссылки VLESS |
| v2rayNG | Частично | Получает base64-подписку, HAPP-метаданные не использует |
| v2rayN | Частично | Подписки с VLESS работают, HAPP-специфика не используется |
| Shadowrocket | Вручную | Годится для raw VLESS, не основной клиент для подписки |
| sing-box · Hiddify · NekoBox · mihomo | Не целевые | Не рассчитывайте на PQ-XHTTP и HAPP-роутинг |

- Android: [HAPP](https://www.happ.su/) · [v2rayNG](https://github.com/2dust/v2rayNG) · [NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid)
- iOS: [HAPP](https://www.happ.su/) · [Shadowrocket](https://apps.apple.com/app/shadowrocket/id932747118) · [V2Box](https://apps.apple.com/app/v2box-v2ray-client/id6446814690)
- Windows: [Throne](https://github.com/throneproj/Throne) · [v2rayN](https://github.com/2dust/v2rayN) · [NekoRay](https://github.com/MatsuriDayo/nekoray)
- macOS: [Throne](https://github.com/throneproj/Throne) · [V2RayXS](https://github.com/tzmax/V2RayXS) · [Qv2ray](https://github.com/Qv2ray/Qv2ray)
- Linux: [Throne](https://github.com/throneproj/Throne) · [v2rayA](https://github.com/v2rayA/v2rayA) · [Qv2ray](https://github.com/Qv2ray/Qv2ray)

Документация клиентов: [HAPP subscription](https://www.happ.su/main/faq/adding-configuration-subscription) ·
[формат подписки v2rayN](https://github.com/2dust/v2rayN/wiki/Description-of-subscription)

---

## Лицензия

MIT. Подробности в файле [LICENSE](LICENSE).

## Благодарности

- [XTLS/Xray-core](https://github.com/XTLS/Xray-core) — за протокол.
- [HAPP](https://www.happ.su/) — за целевой клиент и формат подписки.
- [2dust/v2rayNG](https://github.com/2dust/v2rayNG) и [2dust/v2rayN](https://github.com/2dust/v2rayN) — за клиенты и формат подписок.
- [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat) — за расширенные geo-базы.
- [Umalanif/xray-server-setup](https://github.com/Umalanif/xray-server-setup) — за референс с uTLS и автоматизацию.
- [ServerTechnologies/simple-xray-core](https://github.com/ServerTechnologies/simple-xray-core) — за быстрое развёртывание.
- Сообществу — за поддержку и тестирование.

## Поддержка проекта

Звезда на GitHub — самый простой способ поддержать проект.

Донат:

```text
EVM     0x7acE4442b92f2769c24484c78A13024B139E1A5b
Solana  FS9RBrG5yXJty3WNWgkBkfai6BfNoYxGMFeH1LQEpRZr
TON     UQA56zsOv3zvU5x-p7iNNDL8jHh9dt7Q7WlY_gfbaj4ZhcyT
BTC     34EznmkBGpBu4dUnzoHL5GBnpg2Rq86v4H
```

---

<div align="center">
<strong>Сделано для свободного интернета</strong>
</div>
