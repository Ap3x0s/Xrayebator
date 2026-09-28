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
 * epoch-секунды из profile JSON → статус + дата.
 *
 * Дата считается в ЛОКАЛЬНОЙ зоне клиента, а не через toISOString: сервер
 * записывает expire как начало выбранного дня в СВОЕЙ зоне, и UTC-срез
 * сдвигал отображение на день назад для зон восточнее UTC (Москва/Хельсинки
 * показывали 29 сентября вместо выбранного 30-го).
 */
export function describeExpire(expire: number, disabled: boolean, nowMs: number): ExpireInfo {
  if (!expire || expire <= 0) {
    return { status: 'none', date: '' }
  }
  const d = new Date(expire * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (disabled || expire * 1000 <= nowMs) {
    return { status: 'expired', date }
  }
  return { status: 'active', date }
}

/**
 * ISO-дата валидна и день ещё не закончился.
 *
 * Сравнение по КОНЦУ дня, потому что сервер трактует дату включительно
 * (срок истекает в 23:59:59 выбранного дня). Так сегодняшняя дата — валидный
 * выбор: профиль работает до конца текущих суток.
 */
export function isFutureDate(value: string, nowMs: number): boolean {
  if (!isValidIsoDate(value)) return false
  const dayEnd = new Date(`${value}T23:59:59`).getTime()
  return dayEnd > nowMs
}

/** Пресеты «через N дней» для диалога срока (локальная дата, как в виджете). */
export function presetDate(daysFromNow: number, nowMs: number): string {
  const d = new Date(nowMs + daysFromNow * DAY_MS)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
