/**
 * Утилиты разбора клиентского конфига AmneziaWG для GUI.
 * GUI показывает конфиг как структурированный «ключ» (Endpoint/Адрес),
 * а не простыню текста; полный текст нужен для QR и копирования.
 */

/** Убирает комментарии-шапку и нормализует CRLF — часть приложений спотыкается о строки до [Interface]. */
export function stripAwgComments(conf: string): string {
  return conf
    .replace(/\r\n/g, '\n')
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

/**
 * Карта key=value из клиентского .conf (заголовки секций пропускаются,
 * значения тримятся) — зеркало парсера importController в AmneziaVPN.
 */
export function parseAwgConfMap(conf: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const raw of conf.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[') && line.endsWith(']')) continue
    const idx = line.indexOf('=')
    if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return map
}

/** AWG-ключи, которые импортёр AmneziaVPN переносит в last_config (awgProtocolKeys). */
const AWG_PROTOCOL_KEYS = [
  'Jc',
  'Jmin',
  'Jmax',
  'S1',
  'S2',
  'S3',
  'S4',
  'H1',
  'H2',
  'H3',
  'H4',
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'HeaderProtectionKey',
  'ContentPaddingAddition',
  'RandomTrailers',
  'DisableCookies',
] as const

/**
 * Версия протокола AWG по содержимому конфига (значения из protocolConstants
 * AmneziaVPN: awgV1_5/awgV2/awgV3). Приложение без явной версии считает конфиг
 * legacy («старая версия») и запускает туннель не тем поколением параметров.
 */
export function detectAwgVersion(map: Record<string, string>): string {
  if (map['HeaderProtectionKey'] || map['RandomTrailers']) return '3.1'
  if (['I1', 'I2', 'I3', 'I4', 'I5', 'ContentPaddingAddition'].some((k) => map[k])) return '2'
  return '1.5'
}

/**
 * Строит JSON-объект в родном для AmneziaVPN формате (контейнер amnezia-awg
 * с last_config) — структура повторяет extractWireGuardConfig из importController:
 * только в этом виде приложение гарантированно переносит junk-параметры в туннель.
 */
export function buildAwgVpnConfig(
  conf: string,
  description?: string
): Record<string, unknown> {
  const map = parseAwgConfMap(stripAwgComments(conf))
  const endpoint = map['Endpoint'] ?? ''
  const [host = '', port = ''] = endpoint.split(':')

  const lastConfig: Record<string, unknown> = {
    config: stripAwgComments(conf),
    hostName: host,
    port: Number(port) || 51820,
  }
  if (map['PrivateKey']) lastConfig['client_priv_key'] = map['PrivateKey']
  if (map['Address']) lastConfig['client_ip'] = map['Address']
  const psk = map['PresharedKey'] ?? map['PreSharedKey']
  if (psk) lastConfig['psk_key'] = psk
  if (map['PublicKey']) lastConfig['server_pub_key'] = map['PublicKey']
  if (map['MTU']) lastConfig['mtu'] = map['MTU']
  if (map['PersistentKeepalive']) lastConfig['persistent_keep_alive'] = map['PersistentKeepalive']
  if (map['AllowedIPs']) {
    lastConfig['allowed_ips'] = map['AllowedIPs']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  for (const key of AWG_PROTOCOL_KEYS) {
    if (map[key]) lastConfig[key] = map[key]
  }
  const version = detectAwgVersion(map)
  lastConfig['protocol_version'] = version

  // Серверные поля — НА УРОВНЕ объекта "awg" (как AwgServerConfig::toJson в
  // amnezia-client): модель сервера читает их отсюда, а не из last_config.
  // I1..I5 их toJson пишет безусловно (пустые строки — валидно).
  const serverLevel: Record<string, unknown> = {
    port,
    transport_proto: 'udp',
    protocol_version: version,
    Jc: map['Jc'] ?? '',
    Jmin: map['Jmin'] ?? '',
    Jmax: map['Jmax'] ?? '',
    S1: map['S1'] ?? '',
    S2: map['S2'] ?? '',
  }
  for (const key of ['S3', 'S4', 'H1', 'H2', 'H3', 'H4'] as const) {
    if (map[key]) serverLevel[key] = map[key]
  }
  for (const key of ['I1', 'I2', 'I3', 'I4', 'I5'] as const) {
    serverLevel[key] = map[key] ?? ''
  }
  if (map['HeaderProtectionKey']) serverLevel['HeaderProtectionKey'] = map['HeaderProtectionKey']
  if (map['RandomTrailers']) serverLevel['RandomTrailers'] = map['RandomTrailers']
  if (map['DisableCookies']) serverLevel['DisableCookies'] = map['DisableCookies']

  const container: Record<string, unknown> = {
    container: 'amnezia-awg2',
    awg: {
      ...serverLevel,
      isThirdPartyConfig: true,
      last_config: JSON.stringify(lastConfig),
    },
  }

  const root: Record<string, unknown> = {
    containers: [container],
    defaultContainer: 'amnezia-awg2',
    description: description ?? 'AmneziaWG',
    hostName: host,
  }
  const dns = (map['DNS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (dns[0]) root['dns1'] = dns[0]
  if (dns[1]) root['dns2'] = dns[1]
  return root
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Родная ссылка-импорт для AmneziaVPN: vpn:// + base64url(JSON).
 * Без qCompress — импортёр деликатно принимает и несжатое тело
 * (qUncompress возвращает пусто → используется сырой base64).
 */
export function buildAwgVpnUrl(conf: string, description?: string): string {
  return 'vpn://' + toBase64Url(JSON.stringify(buildAwgVpnConfig(conf, description)))
}
