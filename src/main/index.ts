import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { createTray } from './tray'
import { initAutoUpdater } from './updater'
import { createServerStore } from './core/servers'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'Xrayebator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const shotDir = process.env['XRAYEBATOR_SHOT_DIR']
  if (shotDir) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const collect = async (): Promise<unknown> => {
            return mainWindow.webContents.executeJavaScript(`
            (() => {
              const out = { body: {}, buttons: [], inputs: [], steps: [], cards: [], headers: [] };
              const b = document.body.getBoundingClientRect();
              out.body = { w: Math.round(b.width), h: Math.round(b.height) };
              document.querySelectorAll('button').forEach((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                out.buttons.push({
                  text: (el.textContent || '').trim().slice(0, 30),
                  x: Math.round(r.x), y: Math.round(r.y),
                  w: Math.round(r.width), h: Math.round(r.height),
                  bg: cs.backgroundColor, color: cs.color,
                  radius: cs.borderRadius, border: cs.borderColor,
                  gap: cs.gap, align: cs.alignItems,
                  overflow: cs.overflow
                });
              });
              document.querySelectorAll('input').forEach((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                out.inputs.push({
                  x: Math.round(r.x), y: Math.round(r.y),
                  w: Math.round(r.width), h: Math.round(r.height),
                  bg: cs.backgroundColor, color: cs.color,
                  radius: cs.borderRadius, border: cs.borderColor, borderWidth: cs.borderWidth
                });
              });
              document.querySelectorAll('li').forEach((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                out.steps.push({
                  text: (el.textContent || '').trim().slice(0, 30),
                  x: Math.round(r.x), y: Math.round(r.y),
                  w: Math.round(r.width), h: Math.round(r.height),
                  bg: cs.backgroundColor, color: cs.color,
                  border: cs.borderColor, gap: cs.gap
                });
              });
              document.querySelectorAll('[class*="card"], [class*="Card"]').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width < 50) return;
                const cs = getComputedStyle(el);
                out.cards.push({
                  cls: (el.className || '').toString().slice(0, 60),
                  x: Math.round(r.x), y: Math.round(r.y),
                  w: Math.round(r.width), h: Math.round(r.height),
                  bg: cs.backgroundColor, border: cs.borderColor, radius: cs.borderRadius
                });
              });
              document.querySelectorAll('h1').forEach((el) => {
                const r = el.getBoundingClientRect();
                out.headers.push({ text: el.textContent, x: Math.round(r.x), y: Math.round(r.y), fs: getComputedStyle(el).fontSize });
              });
              return out;
            })()
          `)
          }

          const fs = require('node:fs')
          const dump1 = await collect()
          fs.writeFileSync(join(shotDir, `metrics-dashboard.json`), JSON.stringify(dump1, null, 2))

          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const btns = [...document.querySelectorAll('button')];
              const add = btns.find((b) => (b.textContent || '').includes('первый сервер'));
              if (add) add.click();
              return true;
            })()
          `)
          await new Promise((r) => setTimeout(r, 1500))
          const dump2 = await collect()
          fs.writeFileSync(join(shotDir, `metrics-deploy.json`), JSON.stringify(dump2, null, 2))

          console.log('[shot] metrics saved')
        } catch (e) {
          console.error('[shot] error', e)
        }
      }, 2500)
    })
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xrayebator.gui')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const store = createServerStore()
  registerIpcHandlers({ store })
  createTray()
  initAutoUpdater()

  ipcMain.on('app:quit', () => app.quit())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
