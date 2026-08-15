# Тесты

[← Назад к README](../../README.ru.md) · [English](../testing.md) · [简体中文](../zh-CN/testing.md)

---

## Локальная проверка чекаута

```bash
bash -n xrayebator install.sh update.sh uninstall.sh
for test_file in validation/*.sh; do bash "$test_file" || exit; done
shellcheck -S error xrayebator install.sh update.sh uninstall.sh
```

Все три команды должны проходить до коммита.

## Что покрывают тесты

В `validation/` лежат статические и локальные regression-тесты:

| Тест | Что проверяет |
|---|---|
| `test-transaction-safety.sh` | Транзакционную безопасность операций с конфигом |
| `test-project-update-rollback.sh` | Откат неудачного обновления проекта |
| `test-xhttp-route-path-repair.sh` | Починку путей XHTTP-маршрутов при миграции |
| `test-multiroute-argument-preservation.sh` | Сохранение transport-аргументов multiroute-профиля |
| `test-happ-subscription-static.sh` | Обработчик HAPP-подписки |
| `test-subscription-server-name.sh` | Имя сервера подписки в клиенте |
| `test-fingerprint-subscription-sync.sh` | Синхронность маршрутов и подписки при смене fingerprint |
| `test-dead-stealth-route-pruning.sh` | Отсечение мёртвых stealth-маршрутов |
| `test-cascade-routing.sh` | Cascade routing |
| `test-cascade-upstream-import.sh` | Импорт upstream каскада из ссылки |
| `test-update-xray-core-sync.sh` | Синхронность обновления Xray-core |
| `test-vless-url-generation.sh` | Генерацию ссылок `vless://` |
| `test-installer-network-fallbacks.sh` | Сетевые fallback'и установщика |
| `test-bbr-removal-migration.sh` | Безопасное удаление удалённого BBR/TCP tuning на всех путях |
| `test-legacy-udp443-migration.sh` | Одноразовое удаление legacy правила блокировки UDP/443 |
| `test-main-menu-numbering.sh` | Нумерацию пунктов главного меню и их соответствие обработчикам |
| `test-sni-change-cli.sh` | CLI `sni-change`: JSON на stdout, Reality serverNames/dest, XHTTP host, синхронизацию профилей и rollback |
| `test-port-change-cli.sh` | CLI `port-change`: сценарии unit/shared/move, неверный порт, отсутствующий профиль, multi-route `--route` |
| `test-bypass-cli.sh` | CLI `bypass`: JSON на stdout, обновление routing-правил, add с проверкой SNI |
| `test-quickstart-migration-parity.sh` | `quickstart_command` гоняет те же критичные миграции, что и `main_menu` |
| `test-quickstart-subscription-port.sh` | `quickstart` сообщает реальный порт подписки вместо захардкоженного `:8443` |
| `test-audit-functional.sh` | Функциональные regression-проверки аудита HowDeploy (P0/P1): certbot-fix, privilege-fix, happ-fix |
| `test-audit-privilege-regressions.sh` | Regression границ привилегий: certbot-manifest, root-owned state, nginx rollback, happ-setup IPv6 |

> Статические тесты не заменяют проверку на disposable VPS: создание и удаление профиля, валидацию
> конфига, рестарт сервисов, rollback и реальное подключение клиента.

## Ручные проверки на живом сервере

```bash
sudo xrayebator probe-test                                        # доступность SNI с VPS
sudo /usr/local/bin/xray test -config /usr/local/etc/xray/config.json
sudo systemctl status xray --no-pager -l
sudo systemctl status xrayebator-sub --no-pager -l
curl -sS -i http://127.0.0.1:8080/sub/                            # ожидается 404
jq -r '.routes[] | [.label,.transport,.port,(.pq_enabled // false)] | @tsv' \
  /usr/local/etc/xray/profiles/<profile>.json
```

Если UFW уже активен, сравните numbered rules до и после операции: установка не должна включать
firewall заново и менять политику по умолчанию.

## Десктоп-GUI

У GUI (`src/`) свои Vitest unit-тесты в `tests/`, и CI прогоняет их на каждый push, затрагивающий
код GUI.

```bash
npm run typecheck     # проверка TypeScript: main, preload, renderer, shared
npm test              # Vitest unit-тесты
```

| Тест | Что проверяет |
|---|---|
| `tests/unit/subscription.test.ts` | Извлечение ссылки подписки и ключей профиля |
| `tests/unit/probe-ports.test.ts` | Зондажи доступности, которые использует статусная точка на Dashboard |
| `tests/unit/extractJson.test.ts` | Разбор JSON из вывода команд `xrayebator` |
| `tests/unit/countryFlag.test.ts` | Подбор флага страны для карточек серверов |

UI-логика (рендер, взаимодействие, поток шагов деплоя, переключение i18n) покрывается
`npm run build` (сборка релизного бандла) и ручной проверкой на живом сервере.
