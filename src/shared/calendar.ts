/**
 * Чистая логика месячной сетки для календаря срока действия.
 * Вынесена из компонента, чтобы покрываться юнит-тестами без DOM.
 */

/** ISO-дата ('ГГГГ-ММ-ДД') из локальной даты. */
export function isoOf(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Сегодняшняя локальная дата в ISO. */
export function todayIso(now: Date = new Date()): string {
  return isoOf(now)
}

/** Разбор ISO-даты в локальную полночь; null — если строка не дата. */
export function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

/**
 * Ячейки месяца: ведущие null'ы до первого дня, затем ISO-даты.
 * Неделя начинается с понедельника (раскладка Пн…Вс).
 * Всегда ровно 42 ячейки (6 недель): фиксированная высота сетки, иначе месяцы
 * с 5 неделями «сжимали» бы календарь и кнопки под ним прыгали.
 */
export function monthCells(year: number, month0: number): (string | null)[] {
  const first = new Date(year, month0, 1)
  const offset = (first.getDay() + 6) % 7 // 0=Пн … 6=Вс
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoOf(new Date(year, month0, d)))
  while (cells.length < 42) cells.push(null)
  return cells
}

/** Является ли дата раньше нижней границы (сравнение по календарным дням). */
export function isBefore(iso: string, minIso: string): boolean {
  const a = parseIso(iso)
  const b = parseIso(minIso)
  if (!a || !b) return false
  return a.getTime() < b.getTime()
}

/** Сдвиг месяца курсора: возвращает [year, month0]. */
export function shiftMonth(
  year: number,
  month0: number,
  delta: number
): [number, number] {
  const d = new Date(year, month0 + delta, 1)
  return [d.getFullYear(), d.getMonth()]
}

/** Можно ли листать назад: не выходим за месяц, содержащий нижнюю границу. */
export function canGoBack(year: number, month0: number, minIso: string): boolean {
  const min = parseIso(minIso)
  if (!min) return true
  return new Date(year, month0, 1).getTime() > new Date(min.getFullYear(), min.getMonth(), 1).getTime()
}

/** Подпись месяца с заглавной буквы в текущей локали. */
export function monthLabel(year: number, month0: number, locale: string): string {
  const raw = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month0, 1)
  )
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** Короткие названия дней недели, начиная с понедельника. */
export function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  // 2024-01-01 — понедельник.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
}