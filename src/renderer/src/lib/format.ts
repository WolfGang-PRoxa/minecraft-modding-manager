import { formatBytes } from '../../../shared/format'

export { formatBytes }

export function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : ''
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const relativeFormatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

export function formatRelative(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60]
  ]
  for (const [unit, span] of steps) {
    if (Math.abs(seconds) >= span) return relativeFormatter.format(Math.round(seconds / span), unit)
  }
  return 'à l’instant'
}

export { formatLoader } from '../../../shared/format'
