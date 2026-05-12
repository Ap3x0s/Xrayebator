# Xrayebator

Автоматизированная установка и управление личным Xray VLESS Reality на VPS.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bash](https://img.shields.io/badge/bash-5.0+-green.svg)](https://www.gnu.org/software/bash/)
[![Xray](https://img.shields.io/badge/Xray-core-blue.svg)](https://github.com/XTLS/Xray-core)

Xrayebator ставит Xray-core, создает Reality inbound'ы, генерирует профили и раздает их через HAPP-compatible подписку. Текущая ветка сфокусирована на live-тестировании HAPP subscription: один профиль создает набор маршрутов, а клиент получает их одной ссылкой подписки.

## Статус Ветки

Эта README описывает ветку `feature/happ-subscription-server`, а не старое состояние `main`.

Важное отличие от старой архитектуры: теперь профиль не равен одному маршруту. Один профиль содержит несколько routes с одним `sub_token`; подписка `/sub/<token>` отдает только live-маршруты, которые реально есть в `config.json`.

## Что Сейчас Умеет

- Установка актуального Xray-core и systemd unit.
- Создание multi-route профиля: одна подписка, несколько транспортов.
- HAPP subscription server через `xrayebator-sub.service` + nginx.
- Public HTTPS subscription по IP VPS или по домену.
- Local-only режим `127.0.0.1:8080` только для debug/SSH tunnel.
- HAPP-compatible XHTTP fallback без PQ encryption.
- Отдельный XHTTP+PQ маршрут с `mlkem768x25519plus`.
- v2ray-compatible base64 subscription body для v2rayNG/v2rayN.
- Revoke подписки через смену `sub_token`.
- Смена SNI, fingerprint, port и advanced-настроек профиля.
- Bypass routing: домены можно отправлять напрямую, не через VPN.
- Автоматические миграции существующих профилей при запуске `xrayebator`.

## Чего Здесь Больше Нет

- AdGuard Home меню и обещания DNS-фильтрации через AdGuard удалены.
- Старый список фиксированных портов неактуален: маршруты создаются на случайных высоких портах.
- Старый режим "выбери один тип профиля" больше не основной: пункт создания профиля сразу создает весь набор маршрутов.
- H2, WebSocket, SplitHTTP и Clash/mihomo subscriptions не заявлены как поддерживаемые.

## Установка

Поддерживаются Debian 10+ и Ubuntu 20.04+. Live-тесты этой ветки в основном идут на Debian.

Минимум: 512 MB RAM, 1 CPU, 1 GB диска. Нужен root или пользователь с `sudo`.

Установка именно из этой ветки:

```bash
curl -fsSL https://raw.githubusercontent.com/howdeploy/Xrayebator/refs/heads/feature/happ-subscription-server/install.sh | sudo bash
```

Альтернатива через `wget`:

```bash
wget -qO- https://raw.githubusercontent.com/howdeploy/Xrayebator/refs/heads/feature/happ-subscription-server/install.sh | sudo bash
```

Если установка уже есть и нужно просто подтянуть последний скрипт этой ветки:

```bash
sudo curl -fsSL 'https://raw.githubusercontent.com/howdeploy/Xrayebator/refs/heads/feature/happ-subscription-server/xrayebator' -o /usr/local/bin/xrayebator
sudo chmod +x /usr/local/bin/xrayebator
sudo xrayebator
```

Обновление через updater с указанием ветки:

```bash
sudo xrayebator-update feature/happ-subscription-server
```

## Быстрый Старт

1. Запустите меню:

```bash
sudo xrayebator
```

2. Выберите `1) Создать новый профиль`.

Создание профиля автоматически добавит набор маршрутов:

| Маршрут | Назначение |
| --- | --- |
| `xhttp-legacy` | Основной HAPP-compatible XHTTP, `decryption=none`, без PQ. |
| `xhttp-pq` | XHTTP + VLESS post-quantum encryption `mlkem768x25519plus`. |
| `tcp-mux` | TCP Reality без Vision-flow, запасной вариант. |
| `grpc` | gRPC Reality, чувствителен к HTTP/2/SNI. |
| `tcp-vision` | TCP Reality + Vision. |
| `tcp-utls-firefox` | TCP Vision с fingerprint Firefox. |
| `tcp-xudp` | TCP Vision + XUDP, узкий fallback для жестких мобильных сетей. |

3. Выберите `9) Подписка HAPP`.

4. Для обычного телефона/клиента выберите один из public-режимов:

| Пункт | Когда использовать |
| --- | --- |
| `1) Установить public TLS по IP VPS` | Быстрый режим без домена. URL будет вида `https://<ip>/sub/<token>`. IP certificates у Let's Encrypt short-lived, renew должен работать. |
| `2) Установить public TLS по домену` | Рекомендуется для постоянного использования. URL будет вида `https://sub.example.com/sub/<token>`. |
| `3) local-only debug` | Только для проверки на сервере или через SSH tunnel. Не работает напрямую с телефона. |

5. Откройте `4) Управление подпиской`, выберите профиль и покажите QR-код subscription URL.

6. Импортируйте подписку в HAPP.

## Домен и DNS

Для доменного режима создайте `A` запись на IPv4 VPS. `AAAA` используйте только если IPv6 реально настроен и доступен на VPS.

Если домен в Cloudflare, для тестов надежнее поставить запись в режим `DNS only`, а не `Proxied`. Certbot должен достучаться до VPS по HTTP challenge на 80 порту.

Если 443 занят Xray или другим сервисом, подписка автоматически уйдет на 8443, и URL будет с портом: `https://domain:8443/sub/<token>`.

## Как Работает Подписка

`xrayebator-sub.service` слушает локально `127.0.0.1:8080`. Наружу его публикует nginx через HTTPS.

Endpoint имеет вид:

```text
https://<domain-or-ip>/sub/<32-hex-token>
```

Токен хранится в profile JSON как `sub_token`. Если токен скомпрометирован, используйте `Revoke` в меню подписки: старый URL перестанет работать.

Поведение по клиентам:

- HAPP получает plain-text список `vless://` routes, HAPP headers и опциональный `happ://routing/onadd/...`.
- Если есть `xhttp-legacy`, HAPP не получает PQ-XHTTP как XHTTP-кандидат.
- v2rayNG/v2rayN получают классический base64 body без HAPP metadata.
- Старые profile JSON без live inbound не показываются в меню подписки; старые URL возвращают `410 Gone`.

## Клиенты

Совместимость на 12 мая 2026.

| Клиент | Статус | Комментарий |
| --- | --- | --- |
| HAPP | Рекомендуется | Основной целевой клиент этой ветки. Поддерживает добавление стандартной подписки по URL/QR и VLESS links. |
| v2rayNG | Частично | Получает v2ray-compatible base64 подписку. HAPP routing metadata не используется. Для нестабильных маршрутов переключайтесь на TCP/gRPC/legacy raw route. |
| v2rayN | Частично | Подписки с VLESS поддерживаются, но HAPP-specific metadata не используется. |
| Shadowrocket | Advanced/manual | Может быть полезен для raw VLESS, но не является основным клиентом для HAPP subscription flow. |
| sing-box / Hiddify / NekoBox / mihomo | Не целевые | Не рассчитывайте на PQ-XHTTP и HAPP subscription routing. Используйте только вручную проверенные legacy маршруты. |

Практическая рекомендация: для HAPP импортируйте именно subscription URL, а не отдельный raw `vless://`. Для диагностики можно смотреть raw routes через `Подключиться по профилю`, но основной UX этой ветки — одна подписка на профиль.

Ссылки на документацию клиентов:

- HAPP: https://www.happ.su/main/faq/adding-configuration-subscription
- v2rayNG: https://github.com/2dust/v2rayNG
- v2rayN subscription format: https://github.com/2dust/v2rayN/wiki/Description-of-subscription

## Главное Меню

Актуальные пункты:

| Пункт | Назначение |
| --- | --- |
| `1` | Создать новый multi-route профиль. |
| `2` | Удалить профиль и связанные inbound'ы. |
| `3` | Показать данные подключения по профилю. |
| `4` | Управление профилем: SNI, fingerprint, port, advanced. |
| `8` | Обновить отдельный профиль до PQ XHTTP. |
| `9` | HAPP subscription: public TLS, local handler, URL/QR/revoke. |
| `11` | Bypass routing: домены напрямую, минуя VPN. |

## Bypass Routing

Bypass routing добавляет правила в Xray routing, чтобы выбранные домены шли через `freedom` outbound напрямую.

Есть дефолтный bundle с группами:

- Steam
- RU-сервисы
- RU-банки
- RU-маркетплейсы
- Yandex

Меню интерактивное: стрелки двигают выбор, пробел включает/выключает группу, Enter применяет настройки.

## Безопасность Подписки

URL подписки нельзя считать публичным. Он защищен opaque token'ом, но любой, кто получил URL, может скачать список routes.

Что уже сделано:

- token 32 hex символа;
- `/sub/<token>` без валидного токена возвращает одинаковый 404;
- stale profile возвращает 410 без выдачи маршрутов;
- nginx добавляет `Cache-Control: no-store`;
- endpoint `/` и любые не-`/sub/` пути возвращают 404;
- есть rate limit на nginx location `/sub/`;
- revoke меняет `sub_token`.

Что нужно делать оператору:

- не публиковать subscription URL в открытых чатах;
- при утечке нажать `Revoke`;
- не использовать local-only URL для внешнего клиента;
- не держать Cloudflare/прокси/панели на том же домене без понимания nginx config.

## Частые Проблемы

### HAPP не обновляет подписку

Проверьте URL с VPS:

```bash
curl -vkI https://your-domain/sub/
curl -vk https://your-domain/sub/<token>
```

`/sub/` без токена должен вернуть 404. `/sub/<token>` должен вернуть 200 и тело с `vless://`.

Проверьте сервисы:

```bash
systemctl status xrayebator-sub --no-pager -l
systemctl status nginx --no-pager -l
```

### URL показывает 127.0.0.1

Вы включили local-only режим. Он нужен только для debug. Для телефона включите `Подписка HAPP` -> `public TLS по IP` или `public TLS по домену`.

### URL показывает IP, хотя домен уже добавлен

Нужно заново включить доменный режим в меню `Подписка HAPP` -> `Установить public TLS по домену`. DNS запись сама по себе не меняет `.subscription_domain`.

### XHTTP в HAPP не работает

Для HAPP должен использоваться `xhttp-legacy`, а не `xhttp-pq`. После обновления до актуальной ветки запустите `sudo xrayebator`, дождитесь миграций и обновите подписку в HAPP.

Проверьте, что в профиле появился route `xhttp-legacy`, а в live config есть его порт:

```bash
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' /usr/local/etc/xray/profiles/<profile>.json
```

### v2rayNG то подключается, то нет

v2rayNG не является основным клиентом HAPP flow. Он получает v2ray-compatible body, но маршруты все равно зависят от поддержки конкретного транспорта и версии Xray core внутри клиента. Начинайте с TCP routes, затем проверяйте gRPC/XHTTP отдельно.

### После смены SNI, port или fingerprint старое подключение умерло

Это нормально. После таких изменений обновите подписку в клиенте или заново получите raw route.

### На сервере есть старые профили test3/test4, но они не работают

Если profile JSON указывает на порты, которых уже нет в `config.json`, это stale profile. Новая подписка такие routes не выдает; старый token вернет `410 Gone`.

## Полезные Команды

Запуск меню:

```bash
sudo xrayebator
```

Обновление этой ветки:

```bash
sudo xrayebator-update feature/happ-subscription-server
```

Проверка Xray:

```bash
sudo /usr/local/bin/xray test -config /usr/local/etc/xray/config.json
sudo systemctl status xray --no-pager -l
```

Проверка подписочного backend:

```bash
sudo systemctl status xrayebator-sub --no-pager -l
curl -sS -i http://127.0.0.1:8080/sub/
```

Удаление:

```bash
sudo xrayebator-uninstall
```

## Лицензия

MIT License. См. [LICENSE](LICENSE).

## Благодарности

- [XTLS/Xray-core](https://github.com/XTLS/Xray-core)
- [HAPP](https://www.happ.su/)
- [2dust/v2rayNG](https://github.com/2dust/v2rayNG)
- [2dust/v2rayN](https://github.com/2dust/v2rayN)

## Поддержка Проекта

Если проект пригодился, поставьте звезду на GitHub.

EVM: `0x7acE4442b92f2769c24484c78A13024B139E1A5b`
Solana: `FS9RBrG5yXJty3WNWgkBkfai6BfNoYxGMFeH1LQEpRZr`
TON: `UQA56zsOv3zvU5x-p7iNNDL8jHh9dt7Q7WlY_gfbaj4ZhcyT`
BTC: `34EznmkBGpBu4dUnzoHL5GBnpg2Rq86v4H`
