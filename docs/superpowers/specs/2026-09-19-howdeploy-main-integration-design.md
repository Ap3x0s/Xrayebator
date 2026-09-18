# Xrayebator: интеграция HowDeploy и синхронизация документации

## Цель

Подготовить текущую `Ap3x0s/main` к принятому в два этапа переносу в основной репозиторий `howdeploy/Xrayebator`:

```text
Ap3x0s/main
    │ PR #24
    ▼
howdeploy/dev
    │ отдельный promotion PR
    ▼
howdeploy/main
```

В результат входят фактическая сверка кода и документации, описание изменений относительно старого `howdeploy/main`, актуальная пользовательская документация и проверяемая локальная история. Push допускается для обновления PR #24; PR в `howdeploy/main` создаётся, но автоматически не принимается.

## Зафиксированные границы

- Канонический источник пользовательской установки, обновлений и Electron publishing — `howdeploy/Xrayebator`.
- Текущий форк `Ap3x0s/Xrayebator` остаётся источником ветки/PR и истории вклада, но не должен фигурировать как production raw-install URL.
- В текущий поток входит только вклад форка, уже представленный PR #24. Сторонние открытые PR HowDeploy #22 и #23 не включаются автоматически.
- Основные runtime-дефекты, обнаруженные аудитом, не исправляются скрыто в документационном merge: документация не обещает гарантий, которых код не даёт. Отдельные hardening-фиксы могут быть вынесены в самостоятельную работу.

## Документация после merge

Сохраняется принцип организации, уже использованный HowDeploy main:

1. README — продуктовый вход, quick start, карта возможностей, HAPP, Electron GUI, ограничения, обновление/удаление и клиенты.
2. `docs/` — технические тематические страницы: architecture, configuration, security, troubleshooting, testing.
3. `docs/ru/` и `docs/zh-CN/` — синхронные языковые версии с той же логикой и ссылочной структурой.
4. Новая тема, являющаяся самостоятельным крупным компонентом, получает отдельный подфайл: `docs/desktop-gui.md` и соответствующие русскую/китайскую версии.
5. Полная сравнительная история `howdeploy/main → Ap3x0s/main`, список крупных изменений и verification matrix остаются в описаниях PR/release, а не превращаются в пользовательский README.

Документация должна отражать merged runtime, в том числе:

- canonical `howdeploy` URLs и различие upstream/fork;
- hard prerequisites (root/Bash/apt-based/systemd) отдельно от tested OS matrix;
- фактическое fail-safe поведение UFW и root-owned модели состояния;
- различие SNI/port как inbound-level параметров и fingerprint как client-side per-route параметра;
- HAPP profile schema v3 с семью маршрутами, шестью маршрутами в выдаче при `xhttp-legacy`, IPv4-only IP-TLS и фактический `subscription_url`;
- различие `xrayebator update`, `xrayebator update <branch>` и `xrayebator-update [branch]`, включая ограниченность GUI update flow;
- 24 validation-теста, 9 Electron unit-файлов, Linux CI и Windows `/bin/sh` caveat;
- active Electron GUI и archival `gui-legacy`, SSH auth modes, TOFU и несекретное хранилище;
- ограничения GUI: bypass/probe/revoke/HAPP setup/cascade/self-steal/status APIs не exposed;
- lifecycle paths, которые не используют один общий safe-restart helper, без ложного универсального claim;
- новые устойчивые факты, появившиеся в коде, в отдельных тематических разделах, если существующие страницы становятся чрезмерно перегруженными.

## Проверки

Перед коммитами и PR выполняются:

- `bash -n xrayebator install.sh update.sh uninstall.sh`;
- полный Linux/WSL набор всех 24 `validation/test-*.sh`;
- `npm run typecheck`, `npm test`, `npm run build`;
- `git diff --check`;
- поиск устаревших URL, `config_url`, `xray test`, старого количества тестов и неверных fingerprint/permission claims;
- проверка ссылок и clean Git tree;
- после push — проверка PR #24 и GitHub Actions.

Windows Vitest-result документируется честно: на текущем checkout 38/39 тестов из-за POSIX-only `spawnSync('/bin/sh')`; Linux является источником истины для этого теста.

## Коммиты и интеграция

Локальные логические блоки оформляются отдельными коммитами на русском языке:

1. спецификация процесса;
2. новый справочник Electron GUI и legacy boundaries;
3. синхронизация технических документов;
4. обновление README и переводов;
5. только при необходимости — отдельные проверочные/runtime-исправления.

После локальной проверки push обновляет PR #24 (`Ap3x0s/main → howdeploy/dev`). После успешного CI и review PR #24 принимается в `howdeploy/dev`, затем создаётся отдельный promotion PR `howdeploy/dev → howdeploy/main` с полной историей различий и результатами проверок. Promotion PR не мержится автоматически.

## Не входит в этот проект

- автоматический merge в `howdeploy/main`;
- принятие сторонних PR #22/#23;
- притворное исправление runtime hardening только через текст документации;
- переписывание всей Bash-архитектуры или Electron IPC без отдельного дизайна.
