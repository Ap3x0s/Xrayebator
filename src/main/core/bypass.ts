import { SshClient, SshCredentials } from './ssh-client'
import { shellCommand } from './shell-command'
import { extractJson } from './profiles'
import type { BypassActionResult, BypassGroupsResult, BypassStateResult } from '@shared/types'

/**
 * Обёртка над `xrayebator bypass …` (list|groups|add|remove|reset|bundle).
 * CLI печатает только JSON на stdout; статусы helpers уходят в stderr на сервере,
 * extractJson дополнительно вычищает ANSI на случай старых версий менеджера.
 */
export class BypassManager {
  constructor(private readonly creds: SshCredentials) {}

  private async run(args: readonly string[]): Promise<string> {
    const client = new SshClient(this.creds)
    try {
      await client.connect()
      const res = await client.exec(shellCommand('xrayebator', args), { elevated: true })
      if (res.code !== 0) {
        throw new Error(`xrayebator bypass ${args[1] ?? ''} → код ${res.code}: ${res.stderr.trim()}`)
      }
      return res.stdout
    } finally {
      client.close()
    }
  }

  private async action(args: readonly string[]): Promise<BypassActionResult> {
    try {
      const payload = extractJson(await this.run(args)) as {
        ok?: boolean
        domain?: string
        duplicate?: boolean
        groups?: string[]
        domains?: number
        error?: string
      }
      return {
        ok: payload.ok === true,
        domain: payload.domain,
        duplicate: payload.duplicate,
        groups: payload.groups,
        domains: payload.domains,
        error: payload.error
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async list(): Promise<BypassStateResult> {
    try {
      const payload = extractJson(await this.run(['bypass', 'list'])) as {
        ok?: boolean
        domains?: string[]
        error?: string
      }
      // CLI отдаёт домены с префиксом "domain:" — для UI он шум.
      const domains = (payload.domains ?? []).map((d) => d.replace(/^domain:/, ''))
      return { ok: payload.ok === true, domains, error: payload.error }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async groups(): Promise<BypassGroupsResult> {
    try {
      const payload = extractJson(await this.run(['bypass', 'groups'])) as {
        ok?: boolean
        groups?: { id: string; title: string; domains?: string[] }[]
        error?: string
      }
      const groups = (payload.groups ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        domains: (g.domains ?? []).map((d) => d.replace(/^domain:/, ''))
      }))
      return { ok: payload.ok === true, groups, error: payload.error }
    } catch (err) {
      return { ok: false, groups: [], error: err instanceof Error ? err.message : String(err) }
    }
  }

  add(domain: string): Promise<BypassActionResult> {
    return this.action(['bypass', 'add', '--domain', domain])
  }

  remove(domain: string): Promise<BypassActionResult> {
    return this.action(['bypass', 'remove', '--domain', domain])
  }

  reset(): Promise<BypassActionResult> {
    return this.action(['bypass', 'reset'])
  }

  bundle(groups: readonly string[]): Promise<BypassActionResult> {
    return this.action(['bypass', 'bundle', '--group', groups.join(',')])
  }

  unbundle(groups: readonly string[]): Promise<BypassActionResult> {
    return this.action(['bypass', 'unbundle', '--group', groups.join(',')])
  }
}
