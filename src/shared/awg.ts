/**
 * Утилиты разбора клиентского конфига AmneziaWG для GUI.
 * GUI показывает конфиг как структурированный «ключ» (Endpoint/Адрес),
 * а не простыню текста; полный текст нужен для QR и копирования.
 */

/** Убирает комментарии-шапку — часть приложений спотыкается о строки до [Interface]. */
export function stripAwgComments(conf: string): string {
  return conf
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .trim()
}

export interface AwgClientKeyFields {
  /** Endpoint = host:port из секции [Peer]. */
  endpoint: string
  /** Address = 10.8.1.x/32 клиента. */
  address: string
}

export function parseAwgClientConf(conf: string): AwgClientKeyFields {
  const endpoint = conf.match(/^Endpoint\s*=\s*(.+)$/m)?.[1]?.trim() ?? ''
  const address = conf.match(/^Address\s*=\s*(.+)$/m)?.[1]?.trim() ?? ''
  return { endpoint, address }
}
