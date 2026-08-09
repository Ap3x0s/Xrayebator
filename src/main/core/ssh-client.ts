import { Client, SFTPWrapper, ConnectConfig } from 'ssh2'
import { randomBytes } from 'node:crypto'

export interface SshCredentials {
  host: string
  port: number
  username: string
  password: string
}

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export class SshClient {
  private client: Client | null = null
  private sftp: SFTPWrapper | null = null

  constructor(private readonly creds: SshCredentials) {}

  async connect(): Promise<void> {
    const config: ConnectConfig = {
      host: this.creds.host,
      port: this.creds.port,
      username: this.creds.username,
      password: this.creds.password,
      readyTimeout: 20000,
      keepaliveInterval: 10000
    }

    await new Promise<void>((resolve, reject) => {
      const client = new Client()
      client.on('ready', () => {
        this.client = client
        resolve()
      })
      client.on('error', reject)
      client.connect(config)
    })
  }

  async exec(command: string): Promise<ExecResult> {
    if (!this.client) throw new Error('SSH client not connected')

    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err, stream) => {
        if (err) return reject(err)
        let stdout = ''
        let stderr = ''
        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf8')
        })
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf8')
        })
        stream.on('close', (code: number) => {
          resolve({ code, stdout, stderr })
        })
        stream.on('error', reject)
      })
    })
  }

  async getSftp(): Promise<SFTPWrapper> {
    if (!this.client) throw new Error('SSH client not connected')
    if (this.sftp) return this.sftp

    this.sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      this.client!.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    })
    return this.sftp
  }

  /** Передача файла из локального буфера в удалённый путь. */
  async upload(buffer: Buffer, remotePath: string): Promise<void> {
    const sftp = await this.getSftp()
    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath, { mode: 0o755 })
      stream.on('close', () => resolve())
      stream.on('error', reject)
      stream.end(buffer)
    })
  }

  /** Случайный токен для имени временной папки на сервере. */
  static randomToken(): string {
    return randomBytes(6).toString('hex')
  }

  close(): void {
    if (this.client) this.client.end()
    this.client = null
    this.sftp = null
  }
}
