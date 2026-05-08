import { Position } from '../types'

export interface ConcentrationMetrics {
  positionCount: number
  topPositionWeight: number
  topPositionSymbol: string
  top5Concentration: number
  hhi: number
  effectiveN: number
  cashPct: number
}

export interface SectorExposure {
  sector: string
  weight: number   // percentage 0-100
  spyWeight?: number
}

// Approximate SPY sector weights (2024/2025 typical)
const SPY_SECTOR_WEIGHTS: Record<string, number> = {
  'Technology': 29,
  'Information Technology': 29,
  'Financial Services': 13,
  'Financials': 13,
  'Health Care': 12,
  'Healthcare': 12,
  'Consumer Discretionary': 10,
  'Communication Services': 9,
  'Industrials': 8,
  'Consumer Staples': 6,
  'Energy': 4,
  'Real Estate': 2.5,
  'Materials': 2.5,
  'Utilities': 2.5,
}

function getSPYWeight(sector: string): number | undefined {
  const norm = sector.trim()
  for (const [k, v] of Object.entries(SPY_SECTOR_WEIGHTS)) {
    if (norm.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(norm.toLowerCase())) {
      return v
    }
  }
  return undefined
}

export function computeConcentrationMetrics(
  positions: Position[],
  cash: number,
  totalValue: number
): ConcentrationMetrics {
  const cashPct = totalValue > 0 ? (cash / totalValue) * 100 : 0
  const n = positions.length

  if (n === 0) {
    return { positionCount: 0, topPositionWeight: 0, topPositionSymbol: '', top5Concentration: 0, hhi: 0, effectiveN: 0, cashPct }
  }

  const sorted = [...positions].sort((a, b) => b.pctOfPortfolio - a.pctOfPortfolio)
  const topPositionWeight = sorted[0].pctOfPortfolio
  const topPositionSymbol = sorted[0].symbol
  const top5 = sorted.slice(0, 5)
  const top5Concentration = top5.reduce((s, p) => s + p.pctOfPortfolio, 0)

  // HHI: sum of weight² (weights in decimal 0-1)
  const hhi = positions.reduce((s, p) => {
    const w = p.pctOfPortfolio / 100
    return s + w * w
  }, 0)

  const effectiveN = hhi > 0 ? 1 / hhi : n

  return { positionCount: n, topPositionWeight, topPositionSymbol, top5Concentration, hhi, effectiveN, cashPct }
}

export function computeSectorExposure(positions: Position[]): SectorExposure[] {
  const sectorMap: Record<string, number> = {}

  for (const p of positions) {
    const sector = p.sector || 'Unknown'
    sectorMap[sector] = (sectorMap[sector] ?? 0) + p.pctOfPortfolio
  }

  return Object.entries(sectorMap)
    .map(([sector, weight]) => ({ sector, weight, spyWeight: getSPYWeight(sector) }))
    .sort((a, b) => b.weight - a.weight)
}

export interface TradingMetrics {
  totalClosed: number
  winRate: number | null
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  expectancy: number | null
  avgHoldDaysOpen: number
  avgHoldDaysClosed: number | null
  shortTermRealized: number
  longTermRealized: number
}

import { ClosedTrade, Position as Pos } from '../types'

export function computeTradingMetrics(
  closedTrades: ClosedTrade[],
  openPositions: Pos[]
): TradingMetrics {
  const n = closedTrades.length

  const avgHoldDaysOpen = openPositions.length > 0
    ? openPositions.reduce((s, p) => {
        const totalDays = p.lots.reduce((ls, l) => {
          return ls + (Date.now() - l.acquiredAt.getTime()) / 86400000 * l.shares
        }, 0)
        return s + totalDays / p.shares
      }, 0) / openPositions.length
    : 0

  if (n === 0) {
    return {
      totalClosed: 0, winRate: null, profitFactor: null, avgWin: null,
      avgLoss: null, expectancy: null, avgHoldDaysOpen, avgHoldDaysClosed: null,
      shortTermRealized: 0, longTermRealized: 0,
    }
  }

  const wins = closedTrades.filter((t) => t.realizedPnl > 0)
  const losses = closedTrades.filter((t) => t.realizedPnl <= 0)

  const winRate = wins.length / n
  const totalWins = wins.reduce((s, t) => s + t.realizedPnl, 0)
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.realizedPnl, 0))

  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : null
  const avgWin = wins.length > 0 ? totalWins / wins.length : null
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : null

  const expectancy = avgWin !== null && avgLoss !== null
    ? winRate * avgWin - (1 - winRate) * avgLoss
    : null

  const avgHoldDaysClosed = closedTrades.reduce((s, t) => s + t.holdDays, 0) / n

  const shortTermRealized = closedTrades
    .filter((t) => t.term === 'short')
    .reduce((s, t) => s + t.realizedPnl, 0)
  const longTermRealized = closedTrades
    .filter((t) => t.term === 'long')
    .reduce((s, t) => s + t.realizedPnl, 0)

  return {
    totalClosed: n, winRate, profitFactor, avgWin, avgLoss, expectancy,
    avgHoldDaysOpen, avgHoldDaysClosed, shortTermRealized, longTermRealized,
  }
}
