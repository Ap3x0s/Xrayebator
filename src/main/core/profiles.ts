import { SshClient, SshCredentials } from './ssh-client'
import type { ServerProfile } from '@shared/types'

export interface ProfileListOutput {
  ok: boolean
  profiles: ServerProfile[]
  error?: string
}

export interface ProfileCreateOutput {
  ok: boolean
  names: string[]
  errors: string[]
}

export interface ProfileDeleteOutput {
  ok: boolean
  name?: string
  error?: string
}

export function extractJson(raw: string): unknown {
  // Серверный CLI может печатать ANSI-статусы (backup_config, open_firewall_port,
  // safe_restart_xray) в stdout перед JSON. \033[0;36m содержит '[', из-за чего
  // парсер раньше матчил ANSI-код вместо JSON и падал с «пустым ответом».
  // Вычищаем ESC-последовательности и ищем первый валидный сбалансированный блок.
  const clean = raw.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')

  for (let start = 0; start < clean.length; start++) {
    const open = clean[start]
    if (open !== '[' && open !== '{') continue
    const close = open === '[' ? ']' : '}'
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < clean.length; i++) {
      const ch = clean[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === open) {
        depth++
      } else if (ch === close) {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(clean.slice(start, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }

  throw new Error('Сервер вернул пустой ответ')
}

export class ProfileManager {
  constructor(private readonly creds: SshCredentials) {}

  private async run(command: string): Promise<string> {
    const client = new SshClient(this.creds)
    try {
      await client.connect()
      const res = await client.exec(`xrayebator ${command}`)
      if (res.code !== 0) {
        throw new Error(`xrayebator ${command} → код ${res.code}: ${res.stderr.trim()}`)
      }
      return res.stdout
    } finally {
      client.close()
    }
  }

  async list(): Promise<ProfileListOutput> {
    try {
      const stdout = await this.run('profiles')
      const payload = extractJson(stdout)
      const profiles = Array.isArray(payload) ? (payload as unknown as ServerProfile[]) : []
      return { ok: true, profiles }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, profiles: [], error: message }
    }
  }

  async create(
    input: { name: string; transport: string; port?: number; count?: number }
  ): Promise<ProfileCreateOutput> {
    try {
      const args = [
        `--name "${input.name}"`,
        `--transport ${input.transport}`,
        input.port ? `--port ${input.port}` : '',
        input.count && input.count > 1 ? `--count ${input.count}` : ''
      ]
        .filter(Boolean)
        .join(' ')
      const stdout = await this.run(`profile-create ${args}`)
      const payload = extractJson(stdout) as {
        ok?: boolean
        names?: string[]
        errors?: string[]
        error?: string
      }
      return {
        ok: payload.ok === true,
        names: payload.names ?? [],
        errors: payload.error ? [payload.error] : (payload.errors ?? [])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, names: [], errors: [message] }
    }
  }

  async remove(name: string): Promise<ProfileDeleteOutput> {
    try {
      const stdout = await this.run(`profile-delete --name "${name}"`)
      const payload = extractJson(stdout) as {
        ok?: boolean
        name?: string
        error?: string
      }
      return { ok: payload.ok === true, name: payload.name, error: payload.error }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }
}