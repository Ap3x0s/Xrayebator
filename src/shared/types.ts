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
}

export interface ProfileCreateInput {
  name: string
  transport: string
  port?: number
  count?: number
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

export interface DeployStepState {
  step: DeployStep
  status: DeployStatus
  label: string
}

export interface DeployLogLine {
  at: number
  text: string
}

export interface DeployStartPayload {
  host: string
  port: number
  username: string
  password: string
  email: string
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
  servers: {
    list: () => Promise<Server[]>
    add: (input: Omit<Server, 'id' | 'createdAt'>) => Promise<Server>
    remove: (id: string) => Promise<void>
    get: (id: string) => Promise<Server | null>
    check: (id: string) => Promise<boolean>
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
      password: string
    ) => Promise<{ ok: boolean; profiles: ServerProfile[]; error?: string }>
    create: (
      serverId: string,
      password: string,
      input: ProfileCreateInput
    ) => Promise<ProfileCreateResult>
    remove: (
      serverId: string,
      password: string,
      name: string
    ) => Promise<ProfileDeleteResult>
    changeFingerprint: (
      serverId: string,
      password: string,
      input: ProfileFingerprintInput
    ) => Promise<ProfileFingerprintResult>
    changeSni: (
      serverId: string,
      password: string,
      input: ProfileSniInput
    ) => Promise<ProfileSniResult>
    sniList: (serverId: string, password: string) => Promise<SniListResult>
    changePort: (
      serverId: string,
      password: string,
      input: ProfilePortInput
    ) => Promise<ProfilePortResult>
  }
  server: {
    update: (
      serverId: string,
      password: string,
      branch: string
    ) => Promise<ServerMaintenanceResult>
    uninstall: (
      serverId: string,
      password: string
    ) => Promise<ServerMaintenanceResult>
  }
  app: {
    getVersion: () => Promise<string>
    onUpdateAvailable: (callback: (version: string) => void) => () => void
  }
}
