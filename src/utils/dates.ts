import { formatDistanceToNow, format, differenceInDays, parseISO } from 'date-fns'

export function parseDate(raw: string | undefined | null): Date | null {
  if (!raw || raw.trim() === '') return null
  // Try M/D/YYYY format (Robinhood's format)
  const mdY = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdY) {
    return new Date(parseInt(mdY[3]), parseInt(mdY[1]) - 1, parseInt(mdY[2]))
  }
  // Try ISO
  try { return parseISO(raw.trim()) } catch { return null }
}

export function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return format(d, 'yyyy-MM-dd')
}

export function fmtDateShort(d: Date | null): string {
  if (!d) return '—'
  return format(d, 'MMM yyyy')
}

export function fmtRelative(d: Date | null): string {
  if (!d) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function holdDays(openedAt: Date, closedAt: Date): number {
  return Math.max(0, differenceInDays(closedAt, openedAt))
}

export function isLongTerm(days: number): boolean {
  return days >= 365
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
