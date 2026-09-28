export type SshAuthMethod = 'password' | 'privateKey'

export type SshPrivilegeMode = 'root' | 'sudo'

export type EmailMode = 'provided' | 'without'

export type ServerSetupStatus = 'ready' | 'partial' | 'unknown'

export type DiagnosticState = 'detected' | 'missing' | 'invalid' | 'unknown'

export type XrayState = 'running' | 'stopped' | 'missing' | 'unknown'

export type ProfilesState = 'available' | 'empty' | 'missing' | 'unknown'

export type SubscriptionState = 'public' | 'localOnly' | 'missing' | 'unreachable' | 'unknown'

export interface PrivateKeyReference {
  credentialId: string
  name: string
  persisted?: boolean
}

export interface ServerDiagnostics {
  manager: DiagnosticState
  xray: XrayState
  profiles: ProfilesState
  subscription: SubscriptionState
  inspectedAt: string
}

export interface InspectionSnapshot {
  ok: boolean
  recognized: boolean
  os: string | null
  manager: DiagnosticState
  xray: XrayState
  profiles: ProfilesState
  profile_count: number
  route_count: number
  subscription_installed: boolean
  subscription_mode: string | null
  subscription_domain: string | null
  subscription_port: number | null
  subscription_service?: string | null
  subscription_url: string | null
  country: string | null
  city: string | null
  flag: string | null
  error?: string
}

export interface ImportServerPayload {
  host: string
  port: number
  access: SshAccessInput
}

export interface ImportResult {
  serverId: string
  diagnostics: ServerDiagnostics
  keys: VlessLink[]
}

export interface SshAccessInput {
  username: string
  authMethod: SshAuthMethod
  password?: string
  passwordCredentialId?: string
  passwordPersisted?: boolean
  privateKeyPath?: string
  privateKeyCredentialId?: string
  privateKeyName?: string
  /** true — ключ в системном keychain; false — только выбранный файл в текущей сессии. */
  privateKeyPersisted?: boolean
  passphrase?: string
  privilegeMode: SshPrivilegeMode
  sudoPassword?: string
}

export interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  os: string | null
  country: string | null
  city: string | null
  flag: string | null
  createdAt: string
  routesCount: number | null
  subscriptionUrl: string
  keys: VlessLink[]
  authMethod?: SshAuthMethod
  privilegeMode?: SshPrivilegeMode
  privateKeyPath?: string | null
  privateKeyName?: string | null
  privateKeyCredentialId?: string | null
  privateKeyPersisted?: boolean | null
  passwordCredentialId?: string | null
  passwordPersisted?: boolean | null
  setupStatus?: ServerSetupStatus
  diagnostics?: ServerDiagnostics | null
  hostKeyFingerprint?: string | null
}

export interface VlessLink {
  name: string
  url: string
  transport: 'tcp' | 'grpc' | 'xhttp'
}

export interface SubscriptionResult {
  serverId: string
  subscriptionUrl: string
  keys: VlessLink[]
}

export interface ServerProfile {
  name: string
  uuid: string
  transport: string
  port: number
  fingerprint: string
  sni: string
  created: string
  sub_token: string
  multi_route: boolean
  routes: number
  pq_enabled: boolean
  subscription_url: string
  /** epoch-секунды истечения; 0 = бессрочный. Принуждается серверным таймером. */
  expire: number
  /** true — профиль сейчас отключён по сроку (клиент снят с inbound'ов). */
  expire_disabled: boolean
}

export interface ProfileCreateInput {
  name: string
  transport: string
  port?: number
  count?: number
  /** ISO-дата 'ГГГГ-ММ-ДД' или epoch-секунды; undefined = бессрочный. */
  expire?: string
}

export interface ProfileCreateResult {
  ok: boolean
  names: string[]
  errors: string[]
}

export interface ProfileDeleteResult {
  ok: boolean
  name?: string
  error?: string
}

export interface ProfileFingerprintInput {
  name: string
  route?: number
  fingerprint: string
}

export interface ProfileFingerprintResult {
  ok: boolean
  name?: string
  fingerprint?: string
  route?: string
  error?: string
}

export interface ProfileSniInput {
  name: string
  route?: number
  sni: string
}

export interface ProfileSniResult {
  ok: boolean
  name?: string
  sni?: string
  port?: number
  transport?: string
  route?: string
  affected?: string[]
  unchanged?: boolean
  reconnect?: boolean
  error?: string
}

export interface ProfilePortInput {
  name: string
  route?: number
  port: number | 'random'
}

export interface ProfilePortResult {
  ok: boolean
  name?: string
  port?: number
  old_port?: number
  transport?: string
  route?: string
  unchanged?: boolean
  reconnect?: boolean
  warning?: string
  firewall_warning?: boolean
  error?: string
}

export interface ProfileRevokeInput {
  name: string
  /** true — новый uuid тоже (старые клиенты отваливаются немедленно). */
  full: boolean
}

export interface ProfileRevokeResult {
  ok: boolean
  name?: string
  full?: boolean
  sub_token?: string
  uuid?: string
  subscription_url?: string
  error?: string
}

export interface ProfileExpireInput {
  name: string
  /** ISO 'ГГГГ-ММ-ДД' или epoch-секунды; null/undefined → 'none' (снять срок). */
  expire: string | number | null
}

export interface ProfileExpireResult {
  ok: boolean
  name?: string
  expire?: number
  expired?: boolean
  error?: string
}

export interface BypassStateResult {
  ok: boolean
  domains?: string[]
  error?: string
}

export interface BypassGroupInfo {
  id: string
  title: string
  /** Домены группы без префикса domain: — GUI рисует чекбоксы и считает покрытие. */
  domains: string[]
}

export interface BypassGroupsResult {
  ok: boolean
  groups?: BypassGroupInfo[]
  error?: string
}

export interface BypassActionResult {
  ok: boolean
  domain?: string
  duplicate?: boolean
  groups?: string[]
  /** bundle: число добавленных доменов */
  domains?: number
  /** unbundle: число удалённых доменов */
  removed?: number
  error?: string
}

export interface SniEntry {
  sni: string
  category: string
  priority: string
}

export interface SniListResult {
  ok: boolean
  snis?: SniEntry[]
  error?: string
}

export interface ServerMaintenanceResult {
  ok: boolean
  output?: string
  error?: string
}

export type DeployStep =
  | 'ssh'
  | 'os_check'
  | 'upload'
  | 'install'
  | 'binary'
  | 'quickstart'
  | 'save'

export type DeployStatus = 'pending' | 'running' | 'done' | 'error'

/** Фазы read-only импорта: main process шлёт шаг только при реальном входе в фазу. */
export type ImportStep = 'ssh' | 'inspect' | 'subscription' | 'save'

/** Событие импорта: переход фазы либо строка консоли (секреты уже замаскированы в main). */
export type ImportProgressEvent = { step: ImportStep } | { log: string }

export interface DeployStartPayload {
  host: string
  port: number
  emailMode: EmailMode
  email?: string
  access: SshAccessInput
}

export interface DeployDonePayload {
  serverId: string
  subscriptionUrl: string
  keys: VlessLink[]
}

export type DeployEvent =
  | { type: 'step'; step: DeployStep; status: DeployStatus; label: string }
  | { type: 'log'; text: string }
  | { type: 'done'; payload: DeployDonePayload }
  | { type: 'error'; message: string }

export interface ElectronAPI {
  ssh: {
    selectPrivateKey: () => Promise<PrivateKeyReference | null>
  }
  servers: {
    list: () => Promise<Server[]>
    import: (payload: ImportServerPayload) => Promise<ImportResult>
    onImportEvent: (callback: (event: ImportProgressEvent) => void) => () => void
    remove: (id: string) => Promise<void>
    get: (id: string) => Promise<Server | null>
    check: (id: string) => Promise<boolean>
    forgetHostKey: (id: string) => Promise<void>
  }
  deploy: {
    start: (payload: DeployStartPayload) => void
    onEvent: (callback: (event: DeployEvent) => void) => () => void
  }
  subscription: {
    fetch: (serverId: string) => Promise<SubscriptionResult>
  }
  profiles: {
    list: (
      serverId: string,
      access: SshAccessInput
    ) => Promise<{ ok: boolean; profiles: ServerProfile[]; error?: string }>
    create: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileCreateInput
    ) => Promise<ProfileCreateResult>
    remove: (
      serverId: string,
      access: SshAccessInput,
      name: string
    ) => Promise<ProfileDeleteResult>
    changeFingerprint: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileFingerprintInput
    ) => Promise<ProfileFingerprintResult>
    changeSni: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileSniInput
    ) => Promise<ProfileSniResult>
    sniList: (serverId: string, access: SshAccessInput) => Promise<SniListResult>
    changePort: (
      serverId: string,
      access: SshAccessInput,
      input: ProfilePortInput
    ) => Promise<ProfilePortResult>
    revoke: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileRevokeInput
    ) => Promise<ProfileRevokeResult>
    setExpire: (
      serverId: string,
      access: SshAccessInput,
      input: ProfileExpireInput
    ) => Promise<ProfileExpireResult>
  }
  bypass: {
    list: (serverId: string, access: SshAccessInput) => Promise<BypassStateResult>
    groups: (serverId: string, access: SshAccessInput) => Promise<BypassGroupsResult>
    add: (serverId: string, access: SshAccessInput, domain: string) => Promise<BypassActionResult>
    remove: (
      serverId: string,
      access: SshAccessInput,
      domain: string
    ) => Promise<BypassActionResult>
    reset: (serverId: string, access: SshAccessInput) => Promise<BypassActionResult>
    bundle: (
      serverId: string,
      access: SshAccessInput,
      groups: string[]
    ) => Promise<BypassActionResult>
    unbundle: (
      serverId: string,
      access: SshAccessInput,
      groups: string[]
    ) => Promise<BypassActionResult>
  }
  server: {
    update: (
      serverId: string,
      access: SshAccessInput
    ) => Promise<ServerMaintenanceResult>
    uninstall: (
      serverId: string,
      access: SshAccessInput
    ) => Promise<ServerMaintenanceResult>
  }
}
