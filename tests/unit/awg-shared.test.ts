import { describe, expect, it } from 'vitest'
import {
  parseAwgClientConf,
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
