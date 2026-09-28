import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  canGoBack,
  isBefore,
  monthCells,
  monthLabel,
  parseIso,
  shiftMonth,
  todayIso,
  weekdayLabels
} from '@shared/calendar'
import styles from './CalendarPicker.module.css'

interface CalendarPickerProps {
  /** Выбранная дата в ISO-виде 'ГГГГ-ММ-ДД' ('' = не выбрана). */
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  /** Нижняя граница (ISO). По умолчанию — сегодня: прошлое выбирать нельзя. */
  min?: string
}

/**
 * Календарь в теме приложения вместо системного date-input.
 * Прошлые даты недоступны: срок в прошлом сервер всё равно отклонит.
 */
export function CalendarPicker({
  value,
  onChange,
  disabled = false,
  min
}: CalendarPickerProps): React.JSX.Element {
  const { i18n } = useTranslation()
  const locale = i18n.language || 'ru'
  const minIso = min ?? todayIso()

  const selected = parseIso(value)
  const [cursor, setCursor] = useState<{ year: number; month0: number }>(() => {
    const base = selected ?? new Date()
    return { year: base.getFullYear(), month0: base.getMonth() }
  })

  const cells = useMemo(() => monthCells(cursor.year, cursor.month0), [cursor])
  const label = useMemo(() => monthLabel(cursor.year, cursor.month0, locale), [cursor, locale])
  const weekdays = useMemo(() => weekdayLabels(locale), [locale])
  const today = todayIso()

  const move = (delta: number): void => {
    const [year, month0] = shiftMonth(cursor.year, cursor.month0, delta)
    setCursor({ year, month0 })
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          disabled={disabled || !canGoBack(cursor.year, cursor.month0, minIso)}
          onClick={() => move(-1)}
          aria-label="previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className={styles.monthLabel}>{label}</span>
        <button
          type="button"
          className={styles.navBtn}
          disabled={disabled}
          onClick={() => move(1)}
          aria-label="next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className={styles.weekdays}>
        {weekdays.map((wd, i) => (
          <span key={`${wd}-${i}`} className={styles.weekday}>
            {wd}
          </span>
        ))}
      </div>

      <div className={styles.grid}>
        {cells.map((iso, idx) => {
          if (!iso) return <span key={`empty-${idx}`} className={styles.emptyCell} />
          const past = isBefore(iso, minIso)
          const isSelected = iso === value
          const isToday = iso === today
          return (
            <button
              key={iso}
              type="button"
              className={`${styles.day} ${isSelected ? styles.daySelected : ''} ${
                isToday && !isSelected ? styles.dayToday : ''
              }`}
              disabled={disabled || past}
              onClick={() => onChange(iso)}
            >
              {Number(iso.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}