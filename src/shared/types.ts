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
  }
  deploy: {
    start: (payload: DeployStartPayload) => void
    onEvent: (callback: (event: DeployEvent) => void) => () => void
  }
  subscription: {
    fetch: (serverId: string) => Promise<SubscriptionResult>
  }
  app: {
    getVersion: () => Promise<string>
    onUpdateAvailable: (callback: (version: string) => void) => () => void
  }
  theme: {
    set: (theme: 'light' | 'dark') => Promise<void>
    get: () => Promise<'light' | 'dark'>
  }
  language: {
    set: (lang: 'ru' | 'en' | 'zh') => Promise<void>
    get: () => Promise<'ru' | 'en' | 'zh'>
  }
}
