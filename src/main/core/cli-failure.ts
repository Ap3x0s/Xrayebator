/**
 * Диагностика падений серверного CLI.
 *
 * Зачем отдельный модуль: старый сервер (например, релизная ветка без новых
 * команд) на неизвестную команду печатает «✗ Неизвестная команда: …» в stdout
 * и выходит с кодом 1, оставляя stderr пустым. Раньше GUI показывал в этом
 * случае «код 1: » без объяснения — пользователь видел пустую ошибку.
 */

export interface CliFailure {
  code: number
  stdout: string
  stderr: string
}

/** ANSI-мусор менеджера в выводе (цвета статусов) для читаемой ошибки. */
export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * Человекочитаемая причина падения: сначала stderr (там настоящие ошибки),
 * затем значимая строка из stdout (там менеджер печатает «Неизвестная команда»).
 * Возвращает '' если объяснения нет — вызывающий добавит своё.
 */
export function describeFailure(res: CliFailure): string {
  const stderr = stripAnsi(res.stderr).trim()
  if (stderr) return firstMeaningfulLine(stderr)

  const stdout = stripAnsi(res.stdout)
  const known = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      /Неизвестная команда|Использование:|не найден|Некорректн|повреждён|✗|error/i.test(line)
    )
  if (known.length > 0) return known[known.length - 1]

  return firstMeaningfulLine(stdout)
}

/**
 * Подсказка для самого частого случая: GUI новее сервера.
 * Появляется, когда команда есть в приложении, но отсутствует на сервере.
 */
export function isUnknownCommandFailure(res: CliFailure): boolean {
  return /Неизвестная команда/i.test(stripAnsi(res.stdout) + stripAnsi(res.stderr))
}

export function unknownCommandHint(): string {
  return 'Сервер работает на более старой версии Xrayebator: обновите его (кнопка «Обновить Xrayebator» или `sudo xrayebator update <ветка>`) и повторите.'
}

function firstMeaningfulLine(value: string): string {
  const line = value
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return (line ?? '').slice(0, 300)
}