import { ipcMain, BrowserWindow } from 'electron'
import type { Server, ServerMaintenanceResult } from '@shared/types'
import type { ServerStore } from './core/servers'
import { Deployer } from './core/deployer'
import { fetchSubscription } from './core/subscription'
import { ProfileManager } from './core/profiles'
import { ServerManager } from './core/server-manager'

interface IpcContext {
  store: ServerStore
}

export function registerIpcHandlers({ store }: IpcContext): void {
  ipcMain.handle('servers:list', (): Server[] => store.list())
  ipcMain.handle('servers:get', (_e, id: string): Server | null => store.get(id) ?? null)
  ipcMain.handle('servers:add', (_e, input: Omit<Server, 'id' | 'createdAt'>): Server => {
    return store.add(input)
  })
  ipcMain.handle('servers:updateKeys', (_e, id: string, keys: unknown[]): Server | null => {
    return store.updateKeys(id, keys as never[]) ?? null
  })
  ipcMain.handle('servers:remove', (_e, id: string): void => {
    store.remove(id)
  })

  ipcMain.on('deploy:start', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const emit = (channel: string, data: unknown): void => {
      if (!win.isDestroyed()) win.webContents.send(channel, data)
    }

    const deployer = new Deployer(
      (step, message) => {
        emit('deploy:event', { type: 'step', step, label: message })
      },
      (text) => {
        emit('deploy:event', { type: 'log', text })
      }
    )

    ;(async () => {
      try {
        const result = await deployer.deploy({
          host: payload.host,
          port: payload.port,
          username: payload.username,
          password: payload.password,
          email: payload.email
        })

        const server = store.add({
          name: payload.host,
          host: payload.host,
          port: payload.port,
          username: payload.username,
          os: result.os,
          country: result.country,
          city: result.city,
          flag: result.flag,
          routesCount: result.keys.length,
          subscriptionUrl: result.subscriptionUrl,
          keys: result.keys
        })

        emit('deploy:event', {
          type: 'done',
          payload: {
            serverId: server.id,
            subscriptionUrl: result.subscriptionUrl,
            keys: result.keys
          }
        })
      } catch (err) {
        emit('deploy:event', {
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      }
    })()
  })

  ipcMain.handle('subscription:fetch', async (_e, serverId: string) => {
    const server = store.get(serverId)
    if (!server) throw new Error('Сервер не найден')
    const keys = await fetchSubscription(server.subscriptionUrl)
    store.updateKeys(serverId, keys)
    return { serverId, subscriptionUrl: server.subscriptionUrl, keys }
  })

  const profileManagerFor = (serverId: string, password: string): ProfileManager => {
    const server = store.get(serverId)
    if (!server) throw new Error('Сервер не найден')
    if (!password) throw new Error('Не указан SSH-пароль')
    return new ProfileManager({
      host: server.host,
      port: server.port,
      username: server.username,
      password
    })
  }

  ipcMain.handle('profiles:list', async (_e, serverId: string, password: string) => {
    const manager = profileManagerFor(serverId, password)
    const result = await manager.list()
    if (!result.ok) throw new Error(result.error ?? 'Не удалось получить список профилей')
    return result
  })

  ipcMain.handle(
    'profiles:create',
    async (
      _e,
      serverId: string,
      password: string,
      input: { name: string; transport: string; port?: number; count?: number }
    ) => {
      const manager = profileManagerFor(serverId, password)
      return manager.create(input)
    }
  )

  ipcMain.handle('profiles:remove', async (_e, serverId: string, password: string, name: string) => {
    const manager = profileManagerFor(serverId, password)
    const result = await manager.remove(name)
    if (!result.ok) throw new Error(result.error ?? 'Не удалось удалить профиль')
    return result
  })

  const serverManagerFor = (serverId: string, password: string): ServerManager => {
    const server = store.get(serverId)
    if (!server) throw new Error('Сервер не найден')
    if (!password) throw new Error('Не указан SSH-пароль')
    return new ServerManager({
      host: server.host,
      port: server.port,
      username: server.username,
      password
    })
  }

  ipcMain.handle(
    'server:update',
    async (_e, serverId: string, password: string, branch: string): Promise<ServerMaintenanceResult> => {
      return serverManagerFor(serverId, password).update(branch)
    }
  )

  ipcMain.handle(
    'server:uninstall',
    async (_e, serverId: string, password: string): Promise<ServerMaintenanceResult> => {
      return serverManagerFor(serverId, password).uninstall()
    }
  )

  ipcMain.handle('app:version', () => process.env.npm_package_version ?? '0.1.0')
}
