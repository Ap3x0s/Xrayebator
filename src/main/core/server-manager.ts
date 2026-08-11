import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { SshClient, SshCredentials } from './ssh-client'
import type { ServerMaintenanceResult } from '@shared/types'

/** Путь к сценариям: в собранном приложении — resources/scripts, в dev — корень проекта. */
function scriptsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scripts')
  }
  return app.getAppPath()
}

/**
 * Операции над установкой на сервере: обновление скрипта/Xray и полное удаление.
 * Требует root-доступа (SSH-пароль вводится в GUI).
 */
export class ServerManager {
  constructor(private readonly creds: SshCredentials) {}

  private async run(command: string, timeoutSec = 600): Promise<ServerMaintenanceResult> {
    const client = new SshClient(this.creds)
    try {
      await client.connect()
      const res = await client.exec(`timeout ${timeoutSec} bash -lc '${command}'`)
      const output = `${res.stdout}\n${res.stderr}`.trim()
      if (res.code !== 0) {
        return { ok: false, error: output || `команда завершилась с кодом ${res.code}` }
      }
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      client.close()
    }
  }

  /**
   * Обновление: self-update скрипта xrayebator с ветки + обновление Xray-core.
   * update_command с аргументом ветки делает self-update и exec'ится в свежий скрипт.
   */
  async update(branch: string): Promise<ServerMaintenanceResult> {
    return this.run(`xrayebator update ${branch} 2>&1`)
  }

  /**
   * Полное удаление: загружает uninstall.sh на сервер и запускает в неинтерактивном
   * режиме (подтверждение "yes" подаётся через stdin).
   */
  async uninstall(): Promise<ServerMaintenanceResult> {
    const client = new SshClient(this.creds)
    try {
      await client.connect()
      const remote = '/tmp/xrayebator-uninstall.sh'
      await client.upload(readFileSync(join(scriptsDir(), 'uninstall.sh')), remote)
      const res = await client.exec(`yes | bash ${remote}`)
      const output = `${res.stdout}\n${res.stderr}`.trim()
      if (res.code !== 0) {
        return { ok: false, error: output || `uninstall завершился с кодом ${res.code}` }
      }
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      client.close()
    }
  }
}
