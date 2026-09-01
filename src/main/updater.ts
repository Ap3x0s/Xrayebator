import { BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'

let initialized = false

export function initAutoUpdater(): void {
  if (initialized || !app.isPackaged) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:available', info.version)
    }
  })

  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000).unref()
}
