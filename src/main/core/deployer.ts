import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { SshClient, SshCredentials } from './ssh-client'
import { fetchSubscription } from './subscription'
import type { DeployStep, VlessLink } from '@shared/types'

export type DeployListener = (step: DeployStep, message: string) => void

export interface DeployInput {
  host: string
  port: number
  username: string
  password: string
  email: string
}

export interface DeployResult {
  subscriptionUrl: string
  keys: VlessLink[]
}

/** Путь к ресурсам сценариев внутри собранного приложения. */
function scriptsDir(): string {
  return join(app.getAppPath(), 'resources', 'scripts')
}

export class Deployer {
  constructor(private readonly onStep: DeployListener) {}

  async deploy(input: DeployInput): Promise<DeployResult> {
    const creds: SshCredentials = {
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password
    }
    const client = new SshClient(creds)

    try {
      this.onStep('ssh', 'Устанавливаю SSH-подключение...')
      await client.connect()

      this.onStep('os_check', 'Проверяю ОС...')
      const os = await client.exec('cat /etc/os-release 2>/dev/null || true')
      if (os.code !== 0 || !os.stdout.includes('ID=')) {
        throw new Error('Не удалось определить ОС сервера')
      }

      this.onStep('upload', 'Загружаю скрипты на сервер...')
      const token = SshClient.randomToken()
      const remoteDir = `/tmp/xrayebator-${token}`
      await client.exec(`mkdir -p ${remoteDir}`)
      await client.upload(readFileSync(join(scriptsDir(), 'install.sh')), `${remoteDir}/install.sh`)
      await client.upload(readFileSync(join(scriptsDir(), 'xrayebator')), `${remoteDir}/xrayebator`)

      this.onStep('install', 'Устанавливаю Xray...')
      const install = await client.exec(`cd ${remoteDir} && bash install.sh`)
      if (install.code !== 0) {
        throw new Error(`install.sh завершился с кодом ${install.code}: ${install.stderr}`)
      }

      this.onStep('binary', 'Устанавливаю xrayebator...')
      const copy = await client.exec(`install -m 0755 ${remoteDir}/xrayebator /usr/local/bin/xrayebator`)
      if (copy.code !== 0) {
        throw new Error(`Не удалось установить xrayebator: ${copy.stderr}`)
      }

      this.onStep('quickstart', 'Запускаю quickstart...')
      const quick = await client.exec(`xrayebator quickstart --email ${input.email}`)
      if (quick.code !== 0) {
        throw new Error(`quickstart завершился с кодом ${quick.code}: ${quick.stderr}`)
      }
      const payload = parseQuickstartJson(quick.stdout)

      this.onStep('save', 'Сохраняю результат...')
      const keys = payload.config_url
        ? await fetchSubscription(payload.config_url)
        : []
      if (!keys.length && payload.config_url) {
        throw new Error('Subscription вернул пустой список ключей')
      }

      return {
        subscriptionUrl: payload.config_url ?? '',
        keys
      }
    } finally {
      client.close()
    }
  }
}

interface QuickstartJson {
  ok?: boolean
  config_url?: string
  subscription_url?: string
}

function parseQuickstartJson(raw: string): QuickstartJson {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('quickstart не вернул JSON')
  try {
    return JSON.parse(match[0]) as QuickstartJson
  } catch {
    throw new Error('Не удалось разобрать ответ quickstart')
  }
}
