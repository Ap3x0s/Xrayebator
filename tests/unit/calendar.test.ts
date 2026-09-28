import { describe, expect, it } from 'vitest'
import {
  canGoBack,
  isBefore,
  isoOf,
  monthCells,
  monthLabel,
  parseIso,
  shiftMonth,
  todayIso,
  weekdayLabels
} from '../../src/shared/calendar'

describe('isoOf / todayIso / parseIso', () => {
  it('форматирует локальную дату без UTC-сдвига', () => {
    // 1 января 2026, 00:30 локального времени — не должно стать 31 декабря.
    expect(isoOf(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(isoOf(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('todayIso принимает инъекцию даты', () => {
    expect(todayIso(new Date(2026, 8, 28, 15, 0))).toBe('2026-09-28')
  })

  it('parseIso отбрасывает мусор и несуществующие даты', () => {
    expect(parseIso('2026-09-28')?.getDate()).toBe(28)
    expect(parseIso('')).toBeNull()
    expect(parseIso('28.09.2026')).toBeNull()
    expect(parseIso('2026-13-01')).toBeNull()
    expect(parseIso('2026-02-30')).toBeNull()
  })
})

describe('monthCells', () => {
  it('сентябрь 2026 начинается со вторника → один ведущий null', () => {
    const cells = monthCells(2026, 8)
    expect(cells.filter((c) => c !== null)).toHaveLength(30)
    // 1 сентября 2026 — вторник, значит Пн пустой.
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBe('2026-09-01')
    expect(cells[cells.indexOf('2026-09-30')]).toBe('2026-09-30')
  })

  it('месяц, начинающийся с понедельника, не имеет ведущих пустых ячеек', () => {
    // 1 июня 2026 — понедельник.
    const cells = monthCells(2026, 5)
    expect(cells[0]).toBe('2026-06-01')
    expect(cells.filter((c) => c === null)).toHaveLength(42 - 30)
  })

  it('февраль високосного года содержит 29 дней', () => {
    const cells = monthCells(2028, 1)
    expect(cells.filter((c) => c !== null)).toHaveLength(29)
    expect(cells).toContain('2028-02-29')
  })

  it('всегда ровно 42 ячейки — высота календаря не зависит от месяца', () => {
    // Иначе месяцы с 5 неделями «сжимали» плашку и кнопки под ней прыгали.
    for (let m = 0; m < 12; m++) {
      expect(monthCells(2026, m)).toHaveLength(42)
      expect(monthCells(2027, m)).toHaveLength(42)
    }
    // Самый «длинный» случай: 31 день и старт в воскресенье (6 ведущих).
    expect(monthCells(2026, 10)).toHaveLength(42) // ноябрь 2026: 1-е — воскресенье
  })

  it('даты в ячейках идут по возрастанию без пропусков', () => {
    const days = monthCells(2026, 8).filter((c): c is string => c !== null)
    expect(days[0]).toBe('2026-09-01')
    expect(days[days.length - 1]).toBe('2026-09-30')
    expect(new Set(days).size).toBe(30)
  })
})

describe('isBefore / canGoBack / shiftMonth', () => {
  it('сравнивает календарные дни, а не время', () => {
    expect(isBefore('2026-09-27', '2026-09-28')).toBe(true)
    expect(isBefore('2026-09-28', '2026-09-28')).toBe(false)
    expect(isBefore('2026-09-29', '2026-09-28')).toBe(false)
  })

  it('не даёт листать в месяц раньше нижней границы', () => {
    // Граница — 28 сентября 2026: в август и ранее нельзя, в сентябрь можно стоять.
    expect(canGoBack(2026, 8, '2026-09-28')).toBe(false)
    expect(canGoBack(2026, 7, '2026-09-28')).toBe(false)
    expect(canGoBack(2026, 9, '2026-09-28')).toBe(true)
  })

  it('сдвиг месяца переносит год на границах', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0])
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11])
    expect(shiftMonth(2026, 0, 12)).toEqual([2027, 0])
  })
})

describe('локальные подписи', () => {
  it('месяц с заглавной буквы, дни недели с понедельника', () => {
    expect(monthLabel(2026, 8, 'ru')).toMatch(/^Сентябрь/)
    const days = weekdayLabels('ru')
    expect(days).toHaveLength(7)
    expect(days[0].toLowerCase()).toContain('пн')
  })
})