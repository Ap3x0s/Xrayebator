import { contextBridge, ipcRenderer } from 'electron'
import type {
  DeployEvent,
  DeployStartPayload,
  ElectronAPI,
  Server,
  SubscriptionResult
} from '@shared/types'

const api: ElectronAPI = {
  servers: {
    list: (): Promise<Server[]> => ipcRenderer.invoke('servers:list'),
    add: (input: Omit<Server, 'id' | 'createdAt'>): Promise<Server> =>
      ipcRenderer.invoke('servers:add', input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('servers:remove', id),
    get: (id: string): Promise<Server | null> => ipcRenderer.invoke('servers:get', id)
  },

  deploy: {
    start: (payload: DeployStartPayload): void => {
      ipcRenderer.send('deploy:start', payload)
    },
    onEvent: (callback: (event: DeployEvent) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, event: DeployEvent): void =>
        callback(event)
      ipcRenderer.on('deploy:event', listener)
      return () => ipcRenderer.removeListener('deploy:event', listener)
    }
  },

  subscription: {
    fetch: (serverId: string): Promise<SubscriptionResult> =>
      ipcRenderer.invoke('subscription:fetch', serverId)
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, version: string): void =>
        callback(version)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    }
  },

  theme: {
    set: (theme: 'light' | 'dark'): Promise<void> =>
      ipcRenderer.invoke('theme:set', theme),
    get: (): Promise<'light' | 'dark'> => ipcRenderer.invoke('theme:get')
  },

  language: {
    set: (lang: 'ru' | 'en' | 'zh'): Promise<void> =>
      ipcRenderer.invoke('language:set', lang),
    get: (): Promise<'ru' | 'en' | 'zh'> => ipcRenderer.invoke('language:get')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
