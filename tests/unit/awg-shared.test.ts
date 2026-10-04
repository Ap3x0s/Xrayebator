import { describe, expect, it } from 'vitest'
import {
  buildAwgVpnConfig,
  buildAwgVpnUrl,
  parseAwgClientConf,
  parseAwgConfMap,
  stripAwgComments
} from '../../src/shared/awg'

const CONF = [
  '# Xrayebator: транспорт AmneziaWG (AWG 3.1) — НЕ через V2Ray/HAPP.',
  '# Профиль: happ.',
  '[Interface]',
  'PrivateKey = PRIV=',
  'Address = 10.8.1.2/32',
  'HeaderProtectionKey = HPK=',
  '',
  '[Peer]',
  'PublicKey = SERVERPUB=',
  'Endpoint = 2.26.125.147:45467',
  'AllowedIPs = 0.0.0.0/0, ::/0'
].join('\n')

describe('stripAwgComments', () => {
  it('убирает комментарии-шапку и сохраняет секции', () => {
    const clean = stripAwgComments(CONF)
    expect(clean.startsWith('[Interface]')).toBe(true)
    expect(clean).not.toContain('# Xrayebator')
    expect(clean).toContain('[Peer]')
    expect(clean).toContain('Endpoint = 2.26.125.147:45467')
  })
})

describe('parseAwgClientConf', () => {
  it('извлекает Endpoint и Address как поля ключа', () => {
    const fields = parseAwgClientConf(CONF)
    expect(fields.endpoint).toBe('2.26.125.147:45467')
    expect(fields.address).toBe('10.8.1.2/32')
  })

  it('возвращает пустые поля для мусорного конфига', () => {
    const fields = parseAwgClientConf('мусор')
    expect(fields.endpoint).toBe('')
    expect(fields.address).toBe('')
  })
})

const FULL_CONF = [
  '[Interface]',
  'PrivateKey = PRIVKEYBASE64=',
  'Address = 10.8.1.2/32',
  'DNS = 1.1.1.1, 1.0.0.1',
  'MTU = 1280',
  'Jc = 10',
  'Jmin = 130',
  'Jmax = 452',
  'S1 = 103',
  'S2 = 72',
  'H1 = 464563321',
  'H2 = 722945769',
  'H3 = 789953666',
  'H4 = 191492462',
  '',
  '[Peer]',
  'PublicKey = SERVERPUB=',
  'PresharedKey = PSKBASE64=',
  'AllowedIPs = 0.0.0.0/0, ::/0',
  'Endpoint = 2.26.125.147:45467',
  'PersistentKeepalive = 25'
].join('\n')

describe('parseAwgConfMap', () => {
  it('разбирает key=value и пропускает секции', () => {
    const map = parseAwgConfMap(FULL_CONF)
    expect(map['Jc']).toBe('10')
    expect(map['Endpoint']).toBe('2.26.125.147:45467')
    expect(map['PresharedKey']).toBe('PSKBASE64=')
    expect(Object.keys(map).some((k) => k.startsWith('['))).toBe(false)
  })
})

describe('buildAwgVpnUrl', () => {
  it('строит vpn:// с контейнером amnezia-awg и полным last_config', () => {
    const url = buildAwgVpnUrl(FULL_CONF, 'happ')
    expect(url.startsWith('vpn://')).toBe(true)
    const payload64 = url.slice('vpn://'.length)
    expect(payload64).not.toContain('+')
    expect(payload64).not.toContain('/')
    expect(payload64.endsWith('=')).toBe(false)

    const payload = JSON.parse(
      Buffer.from(payload64, 'base64').toString('utf8')
    ) as Record<string, unknown>
    expect(payload['defaultContainer']).toBe('amnezia-awg')
    expect(payload['hostName']).toBe('2.26.125.147')
    expect(payload['dns1']).toBe('1.1.1.1')

    const containers = payload['containers'] as Array<Record<string, unknown>>
    expect(containers[0]['container']).toBe('amnezia-awg')
    const awg = containers[0]['awg'] as Record<string, unknown>
    expect(awg['isThirdPartyConfig']).toBe(true)
    expect(awg['transport_proto']).toBe('udp')

    const last = JSON.parse(awg['last_config'] as string) as Record<string, unknown>
    expect(last['Jc']).toBe('10')
    expect(last['client_priv_key']).toBe('PRIVKEYBASE64=')
    expect(last['psk_key']).toBe('PSKBASE64=')
    expect(last['server_pub_key']).toBe('SERVERPUB=')
    expect(last['port']).toBe(45467)
    expect(last['allowed_ips']).toEqual(['0.0.0.0/0', '::/0'])
    expect(last['config']).not.toContain('#')
  })

  it('выживает кириллицу в имени профиля (UTF-8 → base64url)', () => {
    const url = buildAwgVpnUrl(FULL_CONF, 'Тест-профиля')
    const payload = JSON.parse(
      Buffer.from(url.slice(6), 'base64').toString('utf8')
    ) as Record<string, unknown>
    expect(payload['description']).toBe('Тест-профиля')
  })

  it('возводит структуру без AWG-ключей (чистый conf)', () => {
    const minimal = [
      '[Interface]',
      'PrivateKey = P=',
      'Address = 10.8.1.2/32',
      '[Peer]',
      'PublicKey = S=',
      'Endpoint = 1.2.3.4:51820'
    ].join('\n')
    const cfg = buildAwgVpnConfig(minimal)
    expect(cfg['defaultContainer']).toBe('amnezia-awg')
    expect('HeaderProtectionKey' in JSON.parse(((cfg['containers'] as Array<Record<string, unknown>>)[0]['awg'] as Record<string, unknown>)['last_config'] as string)).toBe(false)
  })
})
