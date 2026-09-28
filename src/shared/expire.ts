/**
 * Чистые хелперы отображения/валидации срока действия профиля.
 * Сервер (xrayebator CLI) нормализует и принудит expire — здесь только
 * предвычисление подписи для UI и разбор date-input в ISO-строку.
 */

export type ExpireStatus = 'none' | 'active' | 'expired'

export interface ExpireInfo {
  status: ExpireStatus
  /** '2026-11-15' для дата-виджетов; '' если срок снят. */
  date: string
}

const DAY_MS = 86_400_000

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(dt.getTime()) && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * epoch-секунды из profile JSON → статус + дата (локальная).
 * disabled (флаг серверного принуждения) всегда важнее сравнения с now.
 */
export function describeExpire(expire: number, disabled: boolean, nowMs: number): ExpireInfo {
  if (!expire || expire <= 0) {
    return { status: 'none', date: '' }
  }
  const date = new Date(expire * 1000).toISOString().slice(0, 10)
  if (disabled || expire * 1000 <= nowMs) {
    return { status: 'expired', date }
  }
  return { status: 'active', date }
}

/** ISO-дата валидна и строго в будущем (день считается от полуночи локального ТЗ). */
export function isFutureDate(value: string, nowMs: number): boolean {
  if (!isValidIsoDate(value)) return false
  const dayStart = new Date(`${value}T00:00:00`).getTime()
  return dayStart > nowMs
}

/** Пресеты «через N дней» для диалога срока (локальная дата, как в виджете). */
export function presetDate(daysFromNow: number, nowMs: number): string {
  const d = new Date(nowMs + daysFromNow * DAY_MS)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
