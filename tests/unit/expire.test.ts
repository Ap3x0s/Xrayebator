import { describe, expect, it } from 'vitest'
import { describeExpire, isFutureDate, presetDate } from '../../src/shared/expire'

const NOW = new Date('2026-09-28T12:00:00Z').getTime()
const DAY = 86_400_000

describe('describeExpire', () => {
  it('0 → бессрочный без даты', () => {
    expect(describeExpire(0, false, NOW)).toEqual({ status: 'none', date: '' })
  })

  it('будущий срок → active с ISO-датой', () => {
    const info = describeExpire(Math.floor((NOW + 10 * DAY) / 1000), false, NOW)
    expect(info.status).toBe('active')
    expect(info.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('прошедший срок → expired', () => {
    const info = describeExpire(Math.floor((NOW - 1000) / 1000), false, NOW)
    expect(info.status).toBe('expired')
  })

  it('флаг серверного отключения важнее времени (revoke/enable race)', () => {
    const future = Math.floor((NOW + 100 * DAY) / 1000)
    expect(describeExpire(future, true, NOW).status).toBe('expired')
  })

  it('uses the server-local calendar date instead of the client timezone date', () => {
    // Server in UTC-7 encoded Sep 30 23:59:59 as Oct 1 06:59:59Z. On this
    // Moscow client the same epoch is already Oct 1, so client-local formatting
    // must not replace the server's selected calendar date.
    const expire = Math.floor(new Date('2026-10-01T06:59:59Z').getTime() / 1000)
    const info = describeExpire(
      expire,
      false,
      new Date('2026-09-01T00:00:00Z').getTime(),
      '2026-09-30'
    )
    expect(info.date).toBe('2026-09-30')
  })
})

describe('isFutureDate', () => {
  it('сегодняшняя дата ещё валидна: срок действует до конца суток', () => {
    // Сервер трактует дату включительно, поэтому «до сегодня» — рабочий выбор.
    expect(isFutureDate('2026-09-28', new Date('2026-09-28T09:00:00').getTime())).toBe(true)
    expect(isFutureDate('2026-09-28', new Date('2026-09-28T23:59:00').getTime())).toBe(true)
  })

  it('вчерашняя дата уже невалидна', () => {
    expect(isFutureDate('2026-09-27', new Date('2026-09-28T09:00:00').getTime())).toBe(false)
  })

  it('принимает только корректные будущие ISO-даты', () => {
    expect(isFutureDate('2030-01-01', NOW)).toBe(true)
    expect(isFutureDate('2020-05-05', NOW)).toBe(false)
    expect(isFutureDate('2026-13-01', NOW)).toBe(false)
    expect(isFutureDate('2026-02-30', NOW)).toBe(false)
    expect(isFutureDate('', NOW)).toBe(false)
    expect(isFutureDate('01.01.2030', NOW)).toBe(false)
  })
})

describe('presetDate', () => {
  it('прибавляет дни и отдаёт локальную ISO-дату (полуденный якорь — вне DST-переходов)', () => {
    expect(presetDate(30, new Date('2026-06-01T12:00:00').getTime())).toBe('2026-07-01')
  })
})
