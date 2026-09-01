import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { SshClient, SshCredentials } from './ssh-client'
import { fetchSubscription } from './subscription'
import type { DeployStep, VlessLink } from '@shared/types'

export type DeployStepListener = (step: DeployStep, message: string) => void
export type DeployLogListener = (text: string) => void

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
  os: string | null
  country: string | null
  city: string | null
  flag: string | null
}

/** Путь к сценариям: в собранном приложении — resources/scripts, в dev — корень проекта. */
function scriptsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scripts')
  }
  return app.getAppPath()
}

/** Обрезает длинный многострочный вывод до пары строк для консоли. */
function summarize(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  const head = lines.slice(0, 2).join(' | ')
  return head.length > 160 ? `${head.slice(0, 157)}...` : head
}

/** Извлекает human-readable причину из серверного JSON-ошибки, если она есть. */
function extractError(raw: string): string | null {
  const match = raw.match(/\{"ok":false[^\n}]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { error?: string }
    return parsed.error ?? null
  } catch {
    return null
  }
}

export class Deployer {
  constructor(
    private readonly onStep: DeployStepListener,
    private readonly onLog: DeployLogListener = () => {}
  ) {}

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
      this.onLog(`SSH: подключение к ${input.host}:${input.port} установлено`)

      this.onStep('os_check', 'Проверяю ОС...')
      const os = await client.exec('cat /etc/os-release 2>/dev/null || true')
      if (os.code !== 0 || !os.stdout.includes('ID=')) {
        throw new Error('Не удалось определить ОС сервера')
      }
      this.onLog(`ОС сервера: ${summarize(os.stdout)}`)

      this.onStep('upload', 'Загружаю скрипты на сервер...')
      const token = SshClient.randomToken()
      const remoteDir = `/tmp/xrayebator-${token}`
      await client.exec(`mkdir -p ${remoteDir}`)
      await client.upload(readFileSync(join(scriptsDir(), 'install.sh')), `${remoteDir}/install.sh`)
      await client.upload(readFileSync(join(scriptsDir(), 'xrayebator')), `${remoteDir}/xrayebator`)
      this.onLog('Загружены install.sh и xrayebator в /tmp/xrayebator-...')

      this.onStep('install', 'Устанавливаю Xray...')
      const install = await client.exec(`cd ${remoteDir} && bash install.sh`)
      if (install.code !== 0) {
        throw new Error(`install.sh завершился с кодом ${install.code}: ${install.stderr}`)
      }
      this.onLog(`install.sh: код ${install.code}; ${summarize(install.stdout)}`)

      this.onStep('binary', 'Устанавливаю xrayebator...')
      const copy = await client.exec(`install -m 0755 ${remoteDir}/xrayebator /usr/local/bin/xrayebator`)
      if (copy.code !== 0) {
        throw new Error(`Не удалось установить xrayebator: ${copy.stderr}`)
      }
      this.onLog('xrayebator установлен в /usr/local/bin/xrayebator')

      this.onStep('quickstart', 'Запускаю quickstart...')
      const quick = await client.exec(`xrayebator quickstart --email ${input.email}`)
      if (quick.code !== 0) {
        // Серверный quickstart печатает статус в stderr, а JSON с причиной
        // ({ok:false,error:...}) — в stdout. Извлекаем причину из JSON в первую
        // очередь (summarize по stderr её обрезает), иначе показываем оба потока.
        const detail = (quick.stderr + '\n' + quick.stdout).trim()
        const reason = extractError(quick.stdout) ?? extractError(detail)
        throw new Error(
          reason
            ? `quickstart завершился с кодом ${quick.code}: ${reason}`
            : `quickstart завершился с кодом ${quick.code}: ${summarize(detail)}`
        )
      }
      this.onLog(`quickstart: ${summarize(quick.stdout)}`)
      const payload = parseQuickstartJson(quick.stdout)
      if (!payload.ok) {
        throw new Error(payload.error ?? 'quickstart не завершился успешно')
      }

      this.onStep('save', 'Сохраняю результат...')
      const subUrl = payload.subscription_url
      const keys = subUrl ? await fetchSubscription(subUrl) : []
      if (!keys.length && subUrl) {
        throw new Error('Subscription вернул пустой список ключей')
      }
      this.onLog(`Подписка: ${subUrl}; маршрутов получено: ${keys.length}`)

      return {
        subscriptionUrl: subUrl ?? '',
        keys,
        os: payload.os ?? null,
        country: payload.country ?? null,
        city: payload.city ?? null,
        flag: payload.flag ?? null
      }
    } finally {
      client.close()
    }
  }
}

interface QuickstartJson {
  ok?: boolean
  error?: string
  subscription_url?: string
  country?: string
  city?: string
  flag?: string
  os?: string
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
