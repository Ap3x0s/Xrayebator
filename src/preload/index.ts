import { contextBridge, ipcRenderer } from 'electron'
import type {
  DeployEvent,
  DeployStartPayload,
  ElectronAPI,
  ProfileCreateInput,
  ProfileCreateResult,
  ProfileDeleteResult,
  ProfileFingerprintInput,
  ProfileFingerprintResult,
  Server,
  ServerMaintenanceResult,
  ServerProfile,
  SubscriptionResult
} from '@shared/types'

const api: ElectronAPI = {
  servers: {
    list: (): Promise<Server[]> => ipcRenderer.invoke('servers:list'),
    add: (input: Omit<Server, 'id' | 'createdAt'>): Promise<Server> =>
      ipcRenderer.invoke('servers:add', input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('servers:remove', id),
    get: (id: string): Promise<Server | null> => ipcRenderer.invoke('servers:get', id),
    check: (id: string): Promise<boolean> => ipcRenderer.invoke('servers:check', id)
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

  profiles: {
    list: (
      serverId: string,
      password: string
    ): Promise<{ ok: boolean; profiles: ServerProfile[]; error?: string }> =>
      ipcRenderer.invoke('profiles:list', serverId, password),
    create: (
      serverId: string,
      password: string,
      input: ProfileCreateInput
    ): Promise<ProfileCreateResult> =>
      ipcRenderer.invoke('profiles:create', serverId, password, input),
    remove: (
      serverId: string,
      password: string,
      name: string
    ): Promise<ProfileDeleteResult> =>
      ipcRenderer.invoke('profiles:remove', serverId, password, name),
    changeFingerprint: (
      serverId: string,
      password: string,
      input: ProfileFingerprintInput
    ): Promise<ProfileFingerprintResult> =>
      ipcRenderer.invoke('profiles:changeFingerprint', serverId, password, input)
  },

  server: {
    update: (
      serverId: string,
      password: string,
      branch: string
    ): Promise<ServerMaintenanceResult> =>
      ipcRenderer.invoke('server:update', serverId, password, branch),
    uninstall: (serverId: string, password: string): Promise<ServerMaintenanceResult> =>
      ipcRenderer.invoke('server:uninstall', serverId, password)
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, version: string): void =>
        callback(version)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    }
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
