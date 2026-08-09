# Xrayebator Electron — Админ-панель развёртки VPN-скрипта

## Контекст

Десктопное приложение для развёртки VPN-сервера на VPS и получения ключей для HAPP.

**Это НЕ VPN-клиент.** Приложение:
1. Подключается к VPS по SSH
2. Заливает и запускает `install.sh` + `xrayebator quickstart`
3. Получает VLESS-ключи / subscription URL
4. Пользователь копирует ключи в HAPP (или другой VPN-клиент)

### Принцип разделения нагрузки

```
┌──────────────────────────────┐     SSH      ┌─────────────────────────┐
│     Компьютер пользователя   │ ──────────── │         VPS             │
│                              │              │                         │
│  • Весь визуал (Chromium)    │              │  • Только bash-скрипты  │
│  • Анимации, glassmorphism   │              │  • install.sh           │
│  • QR-коды, темы             │              │  • xrayebator quickstart│
│  • Хранение серверов         │              │  • Xray core daemon     │
│  • 0 нагрузки на сервер     │              │  • HTTP subscription    │
└──────────────────────────────┘              └─────────────────────────┘
```

VPS не знает про GUI и не обслуживает его. Весь тяжёлый визуал — на машине пользователя.

---

## Решения (зафиксированы)

| Вопрос | Решение |
|--------|---------|
| Расположение проекта | Отдельная папка `Xrayebator-Electron/`, отдельная dev-ветка |
| Backend стратегия | Полностью Node.js/TypeScript (Вариант B) |
| Code signing | Не нужен |
| Мультиязык | RU, EN, ZH — через `i18next` + `react-i18next` |
| Автообновление | Да — `electron-updater` через GitHub Releases |
| Первая платформа | Windows .exe, остальные через GitHub Actions |

---

## Архитектура

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         КОМПЬЮТЕР ПОЛЬЗОВАТЕЛЯ                             ║
║                                                                            ║
║  ┌─ Renderer Process (Chromium) ─────────────────────────────────────────┐  ║
║  │                                                                       │  ║
║  │  🖥️ Premium UI (React + TypeScript + Framer Motion)                   │  ║
║  │  🌐 i18n (RU / EN / ZH)                                              │  ║
║  │                                                                       │  ║
║  └───────────────────────────┬───────────────────────────────────────────┘  ║
║                              │ ipcRenderer                                 ║
║                              ▼                                             ║
║  ┌─ Main Process (Node.js) ──────────────────────────────────────────────┐  ║
║  │                                                                       │  ║
║  │  📨 IPC Bridge (contextBridge)                                        │  ║
║  │       │                                                               │  ║
║  │       ├──► 🔐 SSH Client (ssh2 + TOFU) ──────────────┐                │  ║
║  │       ├──► 🚀 Deployer (7-step workflow)              │ SFTP + exec   │  ║
║  │       ├──► 📋 Subscription Parser (vless:// decoder)  │ HTTP GET      │  ║
║  │       └──► 💾 Server Store (electron-store + keytar)  │               │  ║
║  │                                                       │               │  ║
║  │  🔄 Auto Updater (electron-updater) ──► 📦 GitHub     │               │  ║
║  │                                       Releases        │               │  ║
║  └───────────────────────────────────────────────────────┼───────────────┘  ║
╚══════════════════════════════════════════════════════════╪══════════════════╝
                                                          │
                                                          ▼
                           ┌─ VPS (только скрипты) ───────────────────────┐
                           │                                              │
                           │  📜 install.sh / xrayebator quickstart       │
                           │  ⚡ Xray Core (работает как демон)           │
                           │  📡 /sub/<token> — HTTP subscription endpoint│
                           │                                              │
                           └──────────────────────────────────────────────┘
```

### Потоки данных

```
  👤 Пользователь       🖥️ Renderer (React)     ⚙️ Main (Node.js)       ☁️ VPS
  ─────────────         ───────────────────     ─────────────────       ──────
        │                       │                       │                  │
        │  ═══ РАЗВЁРТКА НОВОГО СЕРВЕРА ═══════════════════════════════    │
        │                       │                       │                  │
        │── IP, порт,          │                       │                  │
        │   пароль, email ────►│                       │                  │
        │                       │── ipc: deploy:start ─►│                  │
        │                       │                       │── SSH connect ──►│
        │                       │◄─ deploy:step(1,     │                  │
        │                       │      "SSH ✅") ───────│                  │
        │                       │                       │── SFTP upload ──►│
        │                       │                       │   install.sh +   │
        │                       │                       │   xrayebator     │
        │                       │◄─ deploy:step(3,     │                  │
        │                       │      "Загрузка ✅") ──│                  │
        │                       │                       │── bash install.sh│
        │                       │                       │   (streaming) ──►│
        │                       │◄─ deploy:log(         │                  │
        │                       │   "Installing...") ───│                  │
        │                       │◄─ deploy:log(         │                  │
        │                       │   "Configuring...") ──│                  │
        │                       │                       │── xrayebator    │
        │                       │                       │   quickstart ───►│
        │                       │                       │◄── JSON {ok,     │
        │                       │                       │  subscription_url}│
        │                       │◄─ deploy:done(       │                  │
        │                       │   {subscription_url})─│                  │
        │                       │── subscription:       │                  │
        │                       │   fetch(url) ────────►│                  │
        │                       │                       │── HTTP GET ─────►│
        │                       │                       │   /sub/token     │
        │                       │                       │◄── vless://...   │
        │                       │◄─ subscription:       │                  │
        │                       │   result([keys]) ─────│                  │
        │◄── Ключи + QR +     │                       │                  │
        │    "Скопировать" ─────│                       │                  │
        │                       │                       │                  │
        │  ═══ ОБНОВЛЕНИЕ КЛЮЧЕЙ (ПОЗЖЕ) ═════════════════════════════    │
        │                       │                       │                  │
        │── Кнопка             │                       │                  │
        │   "🔄 Обновить" ────►│                       │                  │
        │                       │── subscription:       │                  │
        │                       │   refresh(server_id)─►│                  │
        │                       │                       │── HTTP GET ─────►│
        │                       │                       │   /sub/token     │
        │                       │                       │◄── vless://...   │
        │                       │◄─ subscription:       │                  │
        │                       │   result([keys]) ─────│                  │
        │◄── Обновлённые       │                       │                  │
        │    ключи ─────────────│                       │                  │
        │                       │                       │                  │
```

---

## UI Экраны

### 1. Dashboard — Список серверов

```
┌──────────────────────────────────────────────────┐
│  ☰  Xrayebator                  🌙    ─ □ ✕    │
├──────────────────────────────────────────────────┤
│                                                  │
│  Мои серверы                     [+ Добавить]    │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 🟢  Frankfurt (185.23.x.x)                │  │
│  │     Debian 12 · 2 дня назад · 3 маршрута  │  │
│  │                                            │  │
│  │  [📋 Ключи]  [🔄 Обновить]  [🗑️ Удалить]  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 🟢  Amsterdam (94.17.x.x)                 │  │
│  │     Ubuntu 24.04 · 5 дней · 2 маршрута    │  │
│  │                                            │  │
│  │  [📋 Ключи]  [🔄 Обновить]  [🗑️ Удалить]  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │        + Добавить первый сервер            │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 2. Deploy — Прогресс развёртки

```
┌──────────────────────────────────────────────────┐
│  ←  Развернуть сервер                            │
├──────────────────────────────────────────────────┤
│   IP / Hostname     [185.23.xx.xx          ]     │
│   SSH Порт          [22                    ]     │
│   Пользователь      [root                  ]     │
│   Пароль            [••••••••              ]     │
│   Email             [user@example.com      ]     │
│                                                  │
│   ╭──────────────────────────────╮                │
│   │     🚀 Развернуть сервер     │                │
│   ╰──────────────────────────────╯                │
│                                                  │
│  ✅ SSH подключение                               │
│  ✅ Проверка ОС (Debian 12)                       │
│  ✅ Загрузка скриптов                             │
│  🔄 Установка Xrayebator...                      │
│  ████████████████░░░░░░░░  67%                   │
│  ○  Установка xrayebator binary                  │
│  ○  Quickstart                                   │
│  ○  Сохранение                                   │
│                                                  │
│  📋 Лог:                                        │
│  ┌────────────────────────────────────────────┐  │
│  │ > Running: bash install.sh                 │  │
│  │ > Installing Xray core v26.7.28...         │  │
│  │ > Generating TLS certificates...           │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 3. Ключи — Результат для HAPP

```
┌──────────────────────────────────────────────────┐
│  ←  Frankfurt (185.23.x.x)                       │
├──────────────────────────────────────────────────┤
│                                                  │
│   ✅ Сервер развёрнут!                           │
│                                                  │
│   Ключи для HAPP:                               │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ TCP+Vision :443                            │  │
│  │ vless://abc123...@185.23.x.x:443?...      │  │
│  │                 [📋 Копировать] [📱 QR]     │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ gRPC :443                                  │  │
│  │ vless://abc123...@185.23.x.x:443?...      │  │
│  │                 [📋 Копировать] [📱 QR]     │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ XHTTP :443                                 │  │
│  │ vless://abc123...@185.23.x.x:443?...      │  │
│  │                 [📋 Копировать] [📱 QR]     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 📎 Subscription URL:                       │  │
│  │ https://185.23.x.x/sub/token...            │  │
│  │                        [📋 Копировать]      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│   ╭──────────────────────────────╮                │
│   │     📋 Скопировать всё        │                │
│   ╰──────────────────────────────╯                │
└──────────────────────────────────────────────────┘
```

### Визуальный стиль

| Элемент | Эффект |
|---------|--------|
| Карточки | Glassmorphism: `backdrop-filter: blur(20px)`, полупрозрачный фон, hover-подъём |
| Кнопка «Развернуть» | Градиент с пульсирующим glow, ripple при клике |
| Степпер деплоя | ✅ появляется с scale-bounce, shimmer на текущем шаге |
| Лог-консоль | Строки fade-in снизу, auto-scroll, моноширинный шрифт |
| Копирование | Toast «Скопировано!» с slide-up + fade-out |
| QR-код | Модальное окно с backdrop blur |
| Тема | Тёмная по умолчанию, toggle sun↔moon с rotate-анимацией |
| Пустой список | Dashed-border карточка, пульсирующая иконка + |
| Переходы страниц | Framer Motion: slide + fade между экранами |

---

## Структура проекта

```
Xrayebator-Electron/               # Отдельная папка, отдельная ветка
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
│
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # Window creation, app lifecycle
│   │   ├── ipc-handlers.ts         # IPC channels registration
│   │   ├── tray.ts                 # System tray (minimize to tray)
│   │   ├── updater.ts              # electron-updater (GitHub Releases)
│   │   │
│   │   └── core/                   # Backend (~800 строк TypeScript)
│   │       ├── ssh-client.ts       # ssh2 wrapper + TOFU host key
│   │       ├── deployer.ts         # 7-step deploy over SSH
│   │       ├── subscription.ts     # vless:// parser + HTTP fetch
│   │       └── servers.ts          # electron-store + keytar
│   │
│   ├── renderer/                   # React UI (весь визуал — локально)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Список серверов
│   │   │   ├── AddServer.tsx       # Форма + deploy progress
│   │   │   ├── ServerKeys.tsx      # Ключи + QR
│   │   │   └── Settings.tsx        # Тема, язык
│   │   │
│   │   ├── components/
│   │   │   ├── ServerCard/
│   │   │   │   ├── ServerCard.tsx
│   │   │   │   └── ServerCard.module.css
│   │   │   ├── DeployStepper/
│   │   │   ├── VlessKeyCard/
│   │   │   ├── LogPanel/
│   │   │   ├── GlassCard/
│   │   │   ├── QRModal/
│   │   │   ├── Toast/
│   │   │   ├── ThemeToggle/
│   │   │   └── LanguageSwitcher/
│   │   │
│   │   ├── hooks/
│   │   │   ├── useServers.ts
│   │   │   ├── useDeploy.ts       # IPC stream для deploy progress
│   │   │   └── useIpc.ts
│   │   │
│   │   ├── i18n/
│   │   │   ├── index.ts           # i18next init
│   │   │   ├── ru.json            # Русский
│   │   │   ├── en.json            # English
│   │   │   └── zh.json            # 中文
│   │   │
│   │   └── styles/
│   │       ├── tokens.css         # Design tokens (OKLCH colors)
│   │       ├── global.css         # Base, typography (Inter)
│   │       └── animations.css     # @keyframes
│   │
│   ├── preload/
│   │   └── index.ts               # contextBridge API
│   │
│   └── shared/
│       └── types.ts               # Общие типы (Server, VlessLink, DeployStep)
│
├── resources/
│   ├── icons/
│   │   ├── icon.ico               # Windows
│   │   ├── icon.icns              # macOS
│   │   └── icon.png               # Linux
│   └── scripts/
│       ├── install.sh             # Копия из корня репо
│       └── xrayebator             # Копия из корня репо
│
├── .github/workflows/
│   └── release.yml
│
└── tests/
    └── unit/
        ├── deployer.test.ts
        ├── ssh-client.test.ts
        ├── subscription.test.ts
        └── servers.test.ts
```

---

## i18n — Мультиязык

Структура переводов (`i18next` + `react-i18next`):

```jsonc
// src/renderer/i18n/ru.json
{
  "dashboard": {
    "title": "Мои серверы",
    "add": "Добавить",
    "empty": "Добавьте первый сервер",
    "routes": "{{count}} маршрут",
    "routes_plural": "{{count}} маршрутов"
  },
  "deploy": {
    "title": "Развернуть сервер",
    "button": "🚀 Развернуть",
    "steps": {
      "ssh": "SSH подключение",
      "os_check": "Проверка ОС",
      "upload": "Загрузка скриптов",
      "install": "Установка Xrayebator",
      "binary": "Установка xrayebator",
      "quickstart": "Quickstart",
      "save": "Сохранение"
    },
    "success": "Сервер развёрнут!"
  },
  "keys": {
    "title": "Ключи для HAPP",
    "copy": "Копировать",
    "copy_all": "Скопировать всё",
    "copied": "Скопировано!",
    "qr": "QR-код",
    "subscription": "Subscription URL"
  },
  "settings": {
    "theme": "Тема",
    "language": "Язык",
    "updates": "Автообновление"
  }
}
```

Переключатель языка — в Settings и в header (dropdown: 🇷🇺 / 🇬🇧 / 🇨🇳).

---

## Auto-Updater

```typescript
// src/main/updater.ts (концепция)
import { autoUpdater } from 'electron-updater';

export function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Проверяем обновления при старте и каждые 4 часа
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);

  // IPC: уведомить renderer о доступном обновлении
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', info.version);
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:ready');
  });
}
```

В UI: ненавязчивый badge в Settings «Доступно обновление v0.4.0 — установится при перезапуске».

Работает через **GitHub Releases**: electron-builder публикует `.exe` + `latest.yml`, updater проверяет `latest.yml` по URL репозитория.

---

## CI/CD — GitHub Actions

```yaml
# .github/workflows/release.yml
name: Build & Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            platform: win
          - os: macos-latest
            platform: mac
          - os: ubuntu-latest
            platform: linux

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      # electron-builder + publish для auto-updater
      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}-build
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/latest*.yml
```

### electron-builder.yml

```yaml
appId: com.xrayebator.gui
productName: Xrayebator
directories:
  output: dist
extraResources:
  - from: resources/scripts
    to: scripts

publish:
  provider: github        # auto-updater читает latest.yml отсюда

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icons/icon.ico

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icons/icon.icns

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/icons/icon.png

nsis:
  oneClick: true
  allowToChangeInstallationDirectory: false
```

---

## Порядок реализации

### Phase 0 — Инициализация (1 день)

1. Создать `Xrayebator-Electron/` в отдельной ветке
2. Инициализировать electron-vite + React + TypeScript
3. Скопировать `install.sh` и `xrayebator` в `resources/scripts/`
4. Настроить electron-builder для Windows
5. Базовый GitHub Actions (lint + build)

**✅ Готово когда:** пустое Electron-окно собирается в .exe

---

### Phase 1 — Core Backend (2-3 дня)

Порт 4 модулей Python → TypeScript:

| # | Модуль | Строк | Библиотека |
|---|--------|-------|-----------|
| 1 | `servers.ts` | ~80 | `electron-store` + `keytar` |
| 2 | `ssh-client.ts` | ~150 | `ssh2` (TOFU, SFTP, streaming exec) |
| 3 | `deployer.ts` | ~250 | использует `ssh-client.ts` |
| 4 | `subscription.ts` | ~100 | нативный `fetch` + `URL` + `Buffer` |

+ IPC handlers + Vitest тесты

**✅ Готово когда:** `deployer.ts` может развернуть скрипт на VPS и вернуть ключи

---

### Phase 2 — Premium UI + i18n (4-5 дней)

1. Дизайн-система: tokens.css, glassmorphism, Inter font
2. Настроить `i18next` с RU/EN/ZH
3. Dashboard (список серверов)
4. AddServer (форма + deploy stepper + streaming log)
5. ServerKeys (VLESS ключи + QR + копирование)
6. Settings (тема, язык, обновления)
7. Framer Motion анимации

**✅ Готово когда:** все экраны работают на 3 языках с анимациями

---

### Phase 3 — Интеграция + автообновление (2-3 дня)

1. Связать UI ↔ Backend через IPC
2. `electron-updater` + GitHub Releases
3. System tray (закрытие в трей)
4. Toast-нотификации, error handling
5. End-to-end тест: IP → deploy → ключи

**✅ Готово когда:** полный flow работает, updater находит новые версии

---

### Phase 4 — CI/CD и релиз (1-2 дня)

1. GitHub Actions: сборка Win/Mac/Linux
2. Автоматический GitHub Release с `latest.yml` для updater
3. README для нового проекта

**✅ Готово когда:** push тега → .exe в Releases → updater подхватывает

---

## Сводка

| Phase | Описание | Срок |
|-------|---------|------|
| Phase 0 | Инициализация | 1 день |
| Phase 1 | Core Backend | 2-3 дня |
| Phase 2 | Premium UI + i18n | 4-5 дней |
| Phase 3 | Интеграция + updater | 2-3 дня |
| Phase 4 | CI/CD | 1-2 дня |
| **Итого** | | **~2 недели** |

> [!TIP]
> Phase 1 и Phase 2 параллельны → реальный срок **~10 дней**.

---

## Технологический стек

| Категория | Технология |
|-----------|-----------|
| Runtime | Electron 33+ |
| Язык | TypeScript 5.x (strict) |
| UI | React 18 + Framer Motion |
| Сборщик | Vite (renderer) + tsc (main) |
| CSS | CSS Modules + Custom Properties |
| SSH | `ssh2` (npm) |
| Хранение | `electron-store` + `keytar` |
| QR | `qrcode` (npm) |
| i18n | `i18next` + `react-i18next` |
| Обновления | `electron-updater` (GitHub Releases) |
| Сборка | `electron-builder` (NSIS / DMG / AppImage) |
| Тесты | Vitest |
| CI/CD | GitHub Actions |
