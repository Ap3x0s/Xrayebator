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

export interface BypassListResult {
  ok: boolean
  domains?: string[]
  error?: string
}

export interface BypassResult {
  ok: boolean
  domain?: string
  duplicate?: boolean
  groups?: string[]
  domains?: number
  error?: string
}

export interface BypassBundleInput {
  groups?: string[]
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
    bypass: {
      list: (serverId: string, password: string) => Promise<BypassListResult>
      add: (
        serverId: string,
        password: string,
        domain: string
      ) => Promise<BypassResult>
      remove: (
        serverId: string,
        password: string,
        domain: string
      ) => Promise<BypassResult>
      reset: (serverId: string, password: string) => Promise<BypassResult>
      bundle: (
        serverId: string,
        password: string,
        input: BypassBundleInput
      ) => Promise<BypassResult>
    }
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
