# Настройка

[← Назад к README](../../README.ru.md) · [English](../configuration.md) · [简体中文](../zh-CN/configuration.md)

Разделы: [Требования и проверенные системы](#требования-и-проверенные-системы) ·
[Переменные окружения установщика](#переменные-окружения-установщика) ·
[Firewall и параметры хоста](#firewall-и-параметры-хоста) · [Главное меню](#главное-меню) ·
[Каскад](#каскад-и-upstream-ноды) ·
[Self-steal](#собственный-домен-и-self-steal-заглушка) · [Домен и DNS](#домен-и-dns)

---

## Требования и проверенные системы

Установщик имеет жёсткие требования:

- права root (root shell или пользователь с `sudo`, дающим root);
- Bash (запускайте `install.sh` и менеджер через Bash, а не `sh`);
- apt-основанная система Debian/Ubuntu с `apt`/`apt-get`;
- работающее окружение systemd (`systemctl` и `/run/systemd/system`).

Поддерживаемое семейство шире одного релиза, но текущая матрица проверки покрывает:

| Дистрибутив | Проверенные релизы |
|---|---|
| Debian | 12, 13 |
| Ubuntu | 22.04, 24.04 |

KVM-образный VPS с работающим DNS, исходящим HTTPS и достижимым SSH — практическая базовая линия.
Контейнеры без systemd отвергаются установщиком, а не настраиваются частично.

## Переменные окружения установщика

| Переменная | Значение | Что делает |
|---|---|---|
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

## Firewall и параметры хоста

Xrayebator не меняет алгоритм TCP congestion control и не записывает или применяет системные
значения `sysctl`. Сетевые параметры хоста остаются под управлением владельца VPS.

При обновлении старой установки v3.0 запускает одноразовую миграцию. Она удаляет только точные
legacy-файлы и блоки, ранее созданные Xrayebator, и сразу переключает активный BBR на `cubic`
(или `reno`, если `cubic` недоступен). Чужие sysctl-файлы не редактируются: миграция показывает их
оператору и повторяет проверку при следующем запуске. Удалённые project-owned файлы сохраняются в
`/usr/local/etc/xray/backups/` и не восстанавливаются при ошибке live-переключения, чтобы настройка
не включилась снова после перезагрузки.

Установщик устанавливает `ufw` при необходимости и обрабатывает hazard блокировки SSH до его
включения:

1. определяет активный SSH-порт из слушающих сокетов, а когда доступно — из `sshd -T` и
   SSH-конфигурации;
2. проверяет, разрешён ли этот порт, или открывает его до включения UFW;
3. регистрирует только созданные Xrayebator правила в root-owned манифесте
   `/usr/local/etc/xray/.ufw_owned`;
4. если SSH-порт не удалось определить или безопасно открыть, UFW остаётся выключенным, а не
   применяется deny-политика, которая могла бы заблокировать VPS.

Если UFW уже был активен, он не отключается, а существующие правила остаются неуправляемыми. После
успешной проверки SSH установщик добавляет следующие сервисные порты: `22, 80, 443, 8443, 2053, 2083,
2087, 8080, 2096, 8880, 9443/tcp`. Список не означает, что SSH использует порт 22; всегда
сравнивайте numbered rules до и после установки. Собственные правила удаляются при uninstall, а
правила, существовавшие до установки, не трогаются.

## Главное меню

Интерактивное меню использует эти точные значения:

| Пункт | Назначение |
|---|---|
| `1` | Создать профиль вручную: один маршрут или multi-route набор |
| `2` | Удалить профиль и подчистить неиспользуемые инбаунды/порты firewall |
| `3` | Показать данные подключения и сгенерированные ссылки для выбранного профиля |
| `4` | Управление профилем: SNI, клиентский fingerprint, порт и продвинутые настройки |
| `5` | Обновить отдельный профиль до post-quantum XHTTP + Reality |
| `6` | Подписка HAPP: настройка публичного/локального publishing, URL/QR, revoke и HAPP-настройки; managed профиль имеет 7 маршрутов, публикуемый список — 6 |
| `7` | Bypass routing: выбранные домены (банки, маркетплейсы, Steam…) идут напрямую, минуя туннель |
| `8` | Каскад и upstream-ноды |
| `9` | Собственный домен и self-steal заглушка |
| `10` | Поднять outbound-сервер, чтобы другой VPS мог использовать этот как зарубежную ноду каскада |
| `11` | Бэкенд Hysteria 2: установка/статус/ссылка клиента/удаление (быстрый UDP-транспорт) |
| `12` | Бэкенд AmneziaWG 2.0: установка/статус/конфиг клиента/удаление (системный VPN) |
| `13` | Статус всех мультипротокольных бэкендов |
| `0` | Выход |

Действия пронумерованы подряд от `1` до `13`; `0` завершает программу. SNI и порт — общие настройки
инбаунда, поэтому их изменение может затронуть другие профили на том же порту. Fingerprint —
клиентская настройка профиля/маршрута; его изменение не перезапускает Xray и не меняет другие
маршруты.

## Команды

| Команда | Что делает |
|---|---|
| `sudo xrayebator` | Открыть интерактивное меню |
| `sudo xrayebator update` | Обновить только бинарник Xray-core |
| `sudo xrayebator update <branch>` | Self-update менеджера из canonical raw-репозитория (ветка branch), продолжить новым скриптом, затем обновить Xray-core; ветка закрепляется в `.current_branch` для последующих обновлений из GUI |
| `sudo xrayebator probe-test` | Проверить SNI reachability с VPS |
| `sudo xrayebator quickstart --email <адрес>` | Путь одноразового деплоя (используется GUI): broad setup/migration, IP-TLS endpoint на `8443` и стандартный schema-v3 HAPP-профиль из 7 маршрутов; выводит JSON с `subscription_url`. Migration calls best-effort, проверяйте итоговый профиль и сервисы |
| `sudo xrayebator quickstart --without-email` | Тот же путь развёртывания без ACME email; Certbot регистрирует аккаунт с `--register-unsafely-without-email`, поэтому уведомления и восстановление аккаунта по email недоступны |
| `sudo xrayebator inspect --json` | Read-only проверка установки для GUI-импорта: возвращает состояние Xray, профилей и маркеров подписки; не запускает установку, миграции или изменения конфигурации |
| `sudo xrayebator happ-setup` | Сокращённый re-entry на существующей установке: проверяет subscription service и usable multi-route profile; при отсутствии markers проверяет IP-TLS endpoint на `8443`, но не фабрикует markers |
| `sudo xrayebator profiles` | Вывести все профили сервера JSON-массивом (для «Настроек сервера» GUI); срок содержит epoch-секунды (`expire`) для принуждения и календарную дату в зоне сервера (`expire_date`) для отображения, поэтому клиент с другой временной зоной видит выбранную дату |
| `sudo xrayebator profile-create --name ИМЯ [--transport tcp\|tcp-utls\|tcp-xudp\|tcp-mux\|grpc\|xhttp] [--port P] [--count N] [--expire ДАТА]` | Создать профили без интерактива; `--expire` принимает `ГГГГ-ММ-ДД[ ЧЧ:ММ]`, epoch-секунды или 13-значные миллисекунды. Дата без времени действует включительно до `23:59:59` по локальным часам сервера; указанное время трактуется в той же зоне. Уже прошедший срок отклоняется; `{"ok":true,"names":[...],"errors":[...]}` |
| `sudo xrayebator profile-delete --name ИМЯ` | Удалить профиль без интерактива; `{"ok":true,"name":"..."}` |
| `sudo xrayebator profile-revoke --name ИМЯ [--full]` | Перевыпустить ссылку подписки: новый `sub_token`; с `--full` — ещё и новый uuid во всех inbound'ах профиля (уже скачанные конфиги отваливаются); JSON |
| `sudo xrayebator profile-expire --name ИМЯ --expire ДАТА\|epoch\|none` | Задать, продлить или снять срок действия профиля; дата без времени действует включительно до `23:59:59` по локальным часам сервера, указанное время используется как есть в той же зоне; применение немедленное (истёкший срок сразу снимает клиента, продление возвращает); JSON |
| `sudo xrayebator expire-check` | Применить все наступившие сроки пакетно; идемпотентно, без изменений не перезапускает Xray. Вызывается таймером `xrayebator-expire.timer` каждые 10 минут |
| `sudo xrayebator fp-change --name ИМЯ [--route R] --fp ОТПЕЧАТОК` | Сменить клиентский fingerprint для одного маршрута профиля; JSON |
| `sudo xrayebator sni-change --name ИМЯ [--route R] --sni SNI` | Сменить общий inbound SNI и синхронизировать профили на этом порту; JSON |
| `sudo xrayebator sni-list` | Вывести SNI-кандидаты по категориям для GUI; JSON |
| `sudo xrayebator port-change --name ИМЯ [--route R] --port ПОРТ\|random` | Сменить порт инбаунда, firewall и метаданные подписки; клиенту переподключиться; JSON |
| `sudo xrayebator bypass list` | Показать текущие bypass-правила (JSON) |
| `sudo xrayebator bypass add --domain D` | Добавить домен в bypass-правила |
| `sudo xrayebator bypass remove --domain D` | Убрать домен из bypass-правил |
| `sudo xrayebator bypass reset` | Сбросить все кастомные bypass-правила |
| `sudo xrayebator bypass bundle [--group a,b,c]` | Применить дефолтные группы bypass; без `--group` — все группы |
| `sudo xrayebator backend-status` | Статус реестра мультипротокольных бэкендов в JSON (`{"ok":true,"backends":{…}}`) |
| `sudo xrayebator hysteria2-install [--port P] [--grant-all]` | Установить UDP-бэкенд Hysteria 2: бинарник из релизов `HyNetworks/hysteria` (SHA-256), выделенный пользователь `hysteria`, свой systemd-юнит с `CAP_NET_BIND_SERVICE`, QUIC-sysctl буферы, адаптивный TLS (сертификат подписки Let's Encrypt + deploy-hook, иначе self-signed); UDP-порт 443 по умолчанию; JSON (`already: true` если уже стоит) |
| `sudo xrayebator hysteria2-uninstall` | Удалить бэкенд Hysteria 2 (сервис, конфиг, сертификаты, правило firewall); JSON |
| `sudo xrayebator hysteria2-status` | Статус бэкенда Hysteria 2 (JSON) |
| `sudo xrayebator hysteria2-grant --name N` | Выдать per-profile креденшел Hysteria 2 (в `.backends.hysteria2` профиля); серверный конфиг регенерируется из всех профилей; JSON |
| `sudo xrayebator awg-install [--grant-all]` | Установить системный VPN-бэкенд AmneziaWG 2.0: kernel-модуль через DKMS (PPA `amnezia/ppa`, фолбэк — сборка), интерфейс `awg0` на случайном высоком UDP-порту, junk-параметры по спеке AWG, `ip_forward` + MASQUERADE; JSON |
| `sudo xrayebator awg-uninstall` | Удалить бэкенд AmneziaWG (интерфейс, конфиг, symlink, правило firewall; пакеты/модуль остаются в системе); JSON |
| `sudo xrayebator awg-status` | Статус бэкенда AmneziaWG (JSON) |
| `sudo xrayebator awg-grant --name N` | Выдать per-profile peer (ключевая пара + preshared key + адрес `10.8.1.x` в `.backends.awg` профиля); `awg0.conf` регенерируется; JSON |
| `sudo xrayebator awg-conf --name N` | Клиентский `.conf` peer-а профиля в JSON `{ok, name, conf}` — full-tunnel AllowedIPs, серверные junk-параметры, endpoint; импорт в клиент AmneziaWG/AmneziaVPN |
| `sudo xrayebator-update [branch]` | Запустить полный `update.sh` lifecycle update; без аргумента — интерактивный выбор ветки |
| `sudo xrayebator-uninstall` | Снять сервис и конфигурацию |

Эти update-команды намеренно различаются:

| | `sudo xrayebator update <branch>` | `sudo xrayebator-update [branch]` |
|---|---|---|
| С чего начинается | Установленный менеджер | Полный lifecycle updater |
| Откуда берёт | Canonical raw-файл для запрошенной ветки | Update workflow выбранной ветки |
| Основной результат | Self-update менеджера + обновление Xray-core | Скрипты менеджера, данные, интеграция подписки и refresh сервиса, как реализовано workflow |
| Ветка по умолчанию | Явный аргумент | Интерактивный выбор (текущая ветка отображается) |

Десктопный GUI в Server Settings вызывает `xrayebator update <branch>`. Он не использует полный
`xrayebator-update` workflow.

## Десктоп-GUI

Активное Electron-приложение — это CLI-фронтенд поверх SSH, а не полная замена терминальному меню.
Оно выполняет деплой через `quickstart`, обновляет сохранённый `subscription_url` и предоставляет
и группы, а также выбранные SNI, fingerprint, port, update и uninstall.
`probe-test`, HAPP setup, cascade, self-steal, интерактивное меню и диагностика сервиса
остаются серверными операциями.

См. [Electron Desktop GUI](desktop-gui.md) для полного описания команд, границы безопасности, сборки
и тестов.

Локальные проверки разработки:

```bash
npm install
npm run dev
npm run build
npm test
npm run typecheck
```

## Bypass routing

Bypass routing отправляет выбранные домены мимо туннеля: такой трафик идёт `direct`, остальное
продолжает ходить
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

## Мультипротокольные бэкенды

Помимо Xray Reality, на одном VPS можно поднять дополнительные транспорты, управляемые из того же
CLI/меню. Всё состояние бэкендов живёт в нейтральном корне, который не трогает
`/usr/local/etc/xray/`:

```text
/usr/local/etc/xrayebator/
├── backends.json                 # реестр: installed/version/port/флаги по бэкендам (644, без секретов)
└── backends/
    ├── hysteria2/                # server.yaml, сертификаты, placeholder-credential
    └── awg/                      # awg0.conf, server-params.json (0600)
```

Креденшелы per-profile хранятся в самом JSON профиля (`.backends.hysteria2`, `.backends.awg`) —
профиль является единственным источником правды, а серверные конфиги бэкендов всегда
регенерируются из профилей. События жизненного цикла профиля (создание/удаление/revoke/истечение/
продление) автоматически применяются в каждый установленный бэкенд: revoke ротирует пароль
Hysteria и ключи AWG peer-а, истечение срока снимает гранты из обоих серверных конфигов, продление
возвращает.

### Hysteria 2 (быстрый UDP)

`hysteria2-install` скачивает бинарник из официальных релизов `HyNetworks/hysteria` (SHA-256),
создаёт пользователя `hysteria` и отдельный systemd-юнит, слушает UDP 443 по умолчанию (QUIC рядом
с TCP 443 Reality-инбаундом). TLS адаптивный: если у подписки уже есть сертификат Let's Encrypt —
используется он (`insecure=0` у клиентов), иначе генерируется self-signed (`insecure=1`). Пока ни
у одного профиля нет гранта, в auth-карте висит `_xrayebator_placeholder` — Hysteria отвергает
пустую userpass-карту. Ссылки вида
`hysteria2://user:pass@host:port/?sni=…&insecure=0|1#name` добавляются в оба тела подписки (HAPP и
generic); флаг `sub_body` в реестре — выключатель на случай капризного парсера.

### AmneziaWG 2.0 (системный VPN)

`awg-install` собирает kernel-модуль через DKMS (основной путь — PPA `amnezia/ppa`; фолбэк —
сборка из исходников, для ядер ≥ 5.6 нужен полный `linux-source`) и поднимает интерфейс `awg0`
через `awg-quick@awg0` на случайном высоком UDP-порту, подсеть `10.8.1.0/24`, `ip_forward` и
MASQUERADE на интерфейсе default-route. Junk-параметры генерируются по спеке AWG: `Jc` 1..128,
`Jmin < Jmax ≤ 1280`, `S1`/`S2` 15..150 с `S1+56 ≠ S2`, `H1`–`H4` уникальные в 5..2147483647.
Каждый профиль-пир получает ключевую пару, preshared key и первый свободный адрес; клиентский
`.conf` (пункт меню 12 или `awg-conf --name N`) несёт full-tunnel `AllowedIPs` и серверные
junk-параметры, и начинается с самодокументирующейся шапки: профиль работает через
AmneziaVPN/AmneziaWG, а не V2Ray-клиенты (HAPP). В десктоп-GUI те же ключи выдаются per-профиль
кнопкой «Ключи» в Server Settings: ссылка Hysteria 2 и AWG `.conf` текстом с QR и выдачей гранта
в один клик. Изменения peer-ов перезапускают интерфейс с откатом — короткий обрыв туннеля для
всех peer-ов, приемлемо, поскольку гранты и отзывы редки.

### AWG 2.0 vs 3.x — и почему 3.1 важна против DPI/ТСПУ

По разделению протокола в upstream параметры AmneziaWG делятся на две группы:

| Должны совпадать побайтово на сервере и клиенте | Локальные для каждой стороны |
|---|---|
| `S1`–`S4`, `H1`–`H4` | `PersistentKeepalive` (рекомендуется 22–30) |
| 3.0: `HeaderProtectionKey` | 3.0: `ContentPaddingAddition`, `Rekey*`, `Reject*`, `Keepalive*`, `MaxHandshakeAttempts` (число или диапазон `"a-b"`) |
| 3.1: `RandomTrailers` | 3.1: `DisableCookies` |

Xrayebator реализует набор 3.1: junk-параметры плюс `S1`–`S4` (≥ 12), случайно сгенерированный
`HeaderProtectionKey`, общий для сервера и каждого клиентского `.conf`, и `RandomTrailers = on`.
`DisableCookies` доступен, но по умолчанию выключен (ценой встроенной защиты от amplification).
Новые установки получают 3.1 сразу; для установок до 3.1-этапа — пункт меню 12 → «Режим AWG 3.1»
или `awg-31 --on|--off`: догенерирует недостающие ключи, переключает формат конфига и
регенерирует интерфейс. Предупреждение о миграции в силе: 3.1-ключи живут в группе «должны
совпадать», поэтому после переключения **все ранее выданные клиентские `.conf` нужно
перекачать**, а клиентам нужен AmneziaVPN ≥ 5.0.1.5 — старые отказываются импортировать конфиг
целиком. Проверка по `awg show`: нет `latest handshake` — расходится группа «должны совпадать»;
есть хендшейк, но нет трафика — ищите в `awg-quick`/маршрутизации/firewall.

## Каскад и upstream-ноды

Каскад — серверный режим outbound и routing, а не новый профиль клиента. Клиент продолжает
подключаться к текущему VPS:

```text
клиент → текущий VPS → зарубежный VLESS Reality upstream → интернет
```

Меню `8` сохраняет параметры в `/usr/local/etc/xray/upstreams/cascade.json`, добавляет outbound
`cascade-upstream` и переключает только catch-all правило `network=tcp,udp`.

Поддерживаются upstream двух типов: VLESS Reality over TCP, включая Vision и XUDP, и XHTTP. Меню
принимает готовую ссылку `vless://` и переносит transport-специфичные параметры само; при ручном
вводе нужны `address`, `port`, `uuid`, `publicKey`, `shortId`, SNI и fingerprint. Если каскад уже
активен, смена upstream пересобирает outbound и routing и перезапускает Xray — отдельно выключать и
включать не требуется.

Отключение каскада удаляет outbound `cascade-upstream` и возвращает catch-all в `direct`.

Пункт `10` настраивает обратную сторону: делает из текущего VPS зарубежную ноду, к которой
подключается каскад с другого сервера.

## Собственный домен и self-steal заглушка

Self-steal ставит nginx с валидным сертификатом на `127.0.0.1:9444`, а Reality-инбаунды получают
`serverNames=[domain]` и `dest=127.0.0.1:9444`. Для XHTTP дополнительно обновляется
`xhttpSettings.host`.

Нужен домен с A- или AAAA-записью на VPS и email для Let's Encrypt. Меню ставит `nginx` и `certbot`,
пишет конфиг в `/etc/nginx/sites-available/xrayebator-selfsteal`, включает и перезагружает nginx,
открывает и лимитирует `80/tcp` при активном UFW и выпускает сертификат через webroot challenge.

Доступные шаблоны: `Simple web template`, `SNI template`, `Nothing SNI template`.

Если инбаунда на `443` нет, Xrayebator создаёт служебный fallback-only Reality инбаунд `inbound-443`
без клиентов — иначе внешний TLS-пробник на `https://domain/` не дойдёт до заглушки.

## Домен и DNS

Для доменного режима создайте `A`-запись на IPv4 VPS. `AAAA` добавляйте только если IPv6 реально
настроен и доступен. Автоматический IP-TLS flow в настоящее время поддерживает публичный IPv4;
для IPv6-only VPS используйте доменный режим.

Если домен в Cloudflare, для тестов надёжнее режим `DNS only`, а не `Proxied`: certbot должен
достучаться до VPS по HTTP challenge на порту 80.

Сгенерированный `subscription_url` следует выбранному публичному listener: порт `443` опускается из
HTTPS URL, а `8443` или другой публичный порт включается, например
`https://domain:8443/sub/<token>`. DNS-запись сама по себе не меняет сохранённый домен подписки;
при смене endpoint перезапустите настройку домена.