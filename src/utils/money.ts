import Decimal from 'decimal.js'

// Non-breaking minus for display
const MINUS = '−'

export function parseAmount(raw: string | undefined | null): number {
  if (!raw || raw.trim() === '') return 0
  // Remove $, commas, spaces; convert (X) → negative
  let s = raw.trim().replace(/,/g, '')
  const negative = s.startsWith('(') || s.startsWith('-')
  s = s.replace(/[$()+-]/g, '')
  const val = parseFloat(s) || 0
  return negative ? -val : val
}

export function fmt(value: number, opts?: { decimals?: number; sign?: boolean }): string {
  const { decimals, sign = false } = opts ?? {}
  const abs = Math.abs(value)
  const isNeg = value < 0

  let dec: number
  if (decimals !== undefined) {
    dec = decimals
  } else {
    dec = abs >= 10000 ? 0 : 2
  }

  const str = abs.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })

  const prefix = isNeg ? `${MINUS}$` : sign ? '+$' : '$'
  return `${prefix}${str}`
}

export function fmtPct(value: number, opts?: { decimals?: number; sign?: boolean }): string {
  const { decimals = 1, sign = true } = opts ?? {}
  const isNeg = value < 0
  const abs = Math.abs(value)
  const str = abs.toFixed(decimals)
  const prefix = isNeg ? `${MINUS}` : sign ? '+' : ''
  return `${prefix}${str}%`
}

export function fmtShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? MINUS : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

// Decimal-safe weighted average
export function weightedAvgCost(lots: Array<{ shares: number; costPerShare: number }>): number {
  if (lots.length === 0) return 0
  const totalCost = lots.reduce((acc, l) => acc.plus(new Decimal(l.shares).times(l.costPerShare)), new Decimal(0))
  const totalShares = lots.reduce((acc, l) => acc.plus(l.shares), new Decimal(0))
  if (totalShares.isZero()) return 0
  return totalCost.div(totalShares).toNumber()
}

export const MINUS_CHAR = MINUS
