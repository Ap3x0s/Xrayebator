import { contextBridge, ipcRenderer } from 'electron'
import type {
  DeployEvent,
  DeployStartPayload,
  ElectronAPI,
  ImportProgressEvent,
  PrivateKeyReference,
  ImportResult,
  ImportServerPayload,
  ProfileCreateInput,
  ProfileCreateResult,
  ProfileDeleteResult,
  ProfileExpireInput,
  ProfileExpireResult,
  ProfileFingerprintInput,
  ProfileFingerprintResult,
  ProfilePortInput,
  ProfilePortResult,
  ProfileRevokeInput,
  ProfileRevokeResult,
  ProfileSniInput,
  ProfileSniResult,
  SniListResult,
  BypassActionResult,
  BypassGroupsResult,
  BypassStateResult,
  Server,
  ServerMaintenanceResult,
  ServerProfile,
  SshAccessInput,
  SubscriptionResult
} from '@shared/types'

const api: ElectronAPI = {
  ssh: {
    selectPrivateKey: (): Promise<PrivateKeyReference | null> =>
      ipcRenderer.invoke('ssh:selectPrivateKey')
  },

  servers: {
    list: (): Promise<Server[]> => ipcRenderer.invoke('servers:list'),
    import: (payload: ImportServerPayload): Promise<ImportResult> =>
      ipcRenderer.invoke('servers:import', payload),
    onImportEvent: (callback: (event: ImportProgressEvent) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, event: ImportProgressEvent): void =>
        callback(event)
      ipcRenderer.on('servers:importEvent', listener)
      return () => ipcRenderer.removeListener('servers:importEvent', listener)
    },
    remove: (id: string): Promise<void> => ipcRenderer.invoke('servers:remove', id),
    get: (id: string): Promise<Server | null> => ipcRenderer.invoke('servers:get', id),
    check: (id: string): Promise<boolean> => ipcRenderer.invoke('servers:check', id),
    forgetHostKey: (id: string): Promise<void> =>
      ipcRenderer.invoke('servers:forgetHostKey', id)
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
      access: SshAccessInput
    ): Promise<{ ok: boolean; profiles: ServerProfile[]; error?: string }> =>
      ipcRenderer.invoke('profiles:list', serverId, access),
    create: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileCreateInput
    ): Promise<ProfileCreateResult> =>
      ipcRenderer.invoke('profiles:create', serverId, access, input),
    remove: (
      serverId: string,
      access: SshAccessInput,
      name: string
    ): Promise<ProfileDeleteResult> =>
      ipcRenderer.invoke('profiles:remove', serverId, access, name),
    changeFingerprint: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileFingerprintInput
    ): Promise<ProfileFingerprintResult> =>
      ipcRenderer.invoke('profiles:changeFingerprint', serverId, access, input),
    changeSni: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileSniInput
    ): Promise<ProfileSniResult> =>
      ipcRenderer.invoke('profiles:changeSni', serverId, access, input),
    sniList: (serverId: string, access: SshAccessInput): Promise<SniListResult> =>
      ipcRenderer.invoke('profiles:sniList', serverId, access),
    changePort: (
      serverId: string,
      access: SshAccessInput,
      input: ProfilePortInput
    ): Promise<ProfilePortResult> =>
      ipcRenderer.invoke('profiles:changePort', serverId, access, input),
    revoke: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileRevokeInput
    ): Promise<ProfileRevokeResult> =>
      ipcRenderer.invoke('profiles:revoke', serverId, access, input),
    setExpire: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileExpireInput
    ): Promise<ProfileExpireResult> =>
      ipcRenderer.invoke('profiles:setExpire', serverId, access, input)
  },

  bypass: {
    list: (serverId: string, access: SshAccessInput): Promise<BypassStateResult> =>
      ipcRenderer.invoke('bypass:list', serverId, access),
    groups: (serverId: string, access: SshAccessInput): Promise<BypassGroupsResult> =>
      ipcRenderer.invoke('bypass:groups', serverId, access),
    add: (
      serverId: string,
      access: SshAccessInput,
      domain: string
    ): Promise<BypassActionResult> =>
      ipcRenderer.invoke('bypass:add', serverId, access, domain),
    remove: (
      serverId: string,
      access: SshAccessInput,
      domain: string
    ): Promise<BypassActionResult> =>
      ipcRenderer.invoke('bypass:remove', serverId, access, domain),
    reset: (serverId: string, access: SshAccessInput): Promise<BypassActionResult> =>
      ipcRenderer.invoke('bypass:reset', serverId, access),
    bundle: (
      serverId: string,
      access: SshAccessInput,
      groups: string[]
    ): Promise<BypassActionResult> =>
      ipcRenderer.invoke('bypass:bundle', serverId, access, groups),
    unbundle: (
      serverId: string,
      access: SshAccessInput,
      groups: string[]
    ): Promise<BypassActionResult> =>
      ipcRenderer.invoke('bypass:unbundle', serverId, access, groups)
  },

  server: {
    update: (
      serverId: string,
      access: SshAccessInput
    ): Promise<ServerMaintenanceResult> =>
      ipcRenderer.invoke('server:update', serverId, access),
    uninstall: (serverId: string, access: SshAccessInput): Promise<ServerMaintenanceResult> =>
      ipcRenderer.invoke('server:uninstall', serverId, access)
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
