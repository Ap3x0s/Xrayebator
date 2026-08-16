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
  ProfilePortInput,
  ProfilePortResult,
  ProfileSniInput,
  ProfileSniResult,
  SniListResult,
  Server,
  ServerMaintenanceResult,
  ServerProfile,
  SubscriptionResult
} from '@shared/types'

const api: ElectronAPI = {
  servers: {
    list: (): Promise<Server[]> => ipcRenderer.invoke('servers:list'),
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
      ipcRenderer.invoke('profiles:changeFingerprint', serverId, password, input),
    changeSni: (
      serverId: string,
      password: string,
      input: ProfileSniInput
    ): Promise<ProfileSniResult> =>
      ipcRenderer.invoke('profiles:changeSni', serverId, password, input),
    sniList: (serverId: string, password: string): Promise<SniListResult> =>
      ipcRenderer.invoke('profiles:sniList', serverId, password),
    changePort: (
      serverId: string,
      password: string,
      input: ProfilePortInput
    ): Promise<ProfilePortResult> =>
      ipcRenderer.invoke('profiles:changePort', serverId, password, input)
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
