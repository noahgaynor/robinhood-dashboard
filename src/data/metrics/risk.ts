export interface DailyReturn {
  date: string
  portfolioReturn: number
  spyReturn?: number
  qqqReturn?: number
  portfolioValue?: number
}

export interface RiskMetrics {
  annualizedVol: number | null
  sharpe: number | null
  sortino: number | null
  maxDrawdown: number | null
  currentDrawdown: number | null
  beta: number | null
  alpha: number | null
  rSquared: number | null
  varOneDay95: number | null
  trackingError: number | null
  dataNote: string
}

const SQRT252 = Math.sqrt(252)
const TRADING_DAYS = 252

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdev(arr: number[], usePopulation = false): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - (usePopulation ? 0 : 1))
  return Math.sqrt(variance)
}

function covariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0
  const ma = mean(a), mb = mean(b)
  return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1)
}

export function computeRiskMetrics(
  dailyReturns: DailyReturn[],
  currentValue: number,
  rfRate = 0.045
): RiskMetrics {
  const N = dailyReturns.length

  if (N < 5) {
    return {
      annualizedVol: null, sharpe: null, sortino: null,
      maxDrawdown: null, currentDrawdown: null, beta: null,
      alpha: null, rSquared: null, varOneDay95: null, trackingError: null,
      dataNote: 'Need 30+ days of history',
    }
  }

  const portReturns = dailyReturns.map((d) => d.portfolioReturn)
  const spyReturns = dailyReturns.map((d) => d.spyReturn ?? 0).filter((_, i) => dailyReturns[i].spyReturn !== undefined)
  const hasSpy = spyReturns.length >= 30

  const vol = stdev(portReturns) * SQRT252
  const annMean = mean(portReturns) * TRADING_DAYS
  const rfDaily = rfRate / TRADING_DAYS

  const sharpe = vol > 0 ? (annMean - rfRate) / vol : null

  // Sortino: downside deviation
  const downside = portReturns.filter((r) => r < rfDaily)
  const downsideVol = downside.length > 1
    ? Math.sqrt(downside.reduce((s, r) => s + (r - rfDaily) ** 2, 0) / downside.length) * SQRT252
    : 0
  const sortino = downsideVol > 0 ? (annMean - rfRate) / downsideVol : null

  // Max drawdown (on daily values if available, else approximate)
  let maxDrawdown = 0
  let currentDrawdown = 0
  if (dailyReturns[0].portfolioValue !== undefined) {
    const values = dailyReturns.map((d) => d.portfolioValue!)
    let peak = values[0]
    let maxDD = 0
    for (const v of values) {
      if (v > peak) peak = v
      const dd = peak > 0 ? (v - peak) / peak : 0
      if (dd < maxDD) maxDD = dd
    }
    maxDrawdown = maxDD
    const finalPeak = Math.max(...values)
    currentDrawdown = finalPeak > 0 ? (values[values.length - 1] - finalPeak) / finalPeak : 0
  } else {
    // Estimate from cumulative returns
    let cumVal = 1
    let peak = 1
    let maxDD = 0
    for (const r of portReturns) {
      cumVal *= (1 + r)
      if (cumVal > peak) peak = cumVal
      const dd = (cumVal - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
    maxDrawdown = maxDD
    currentDrawdown = (cumVal - peak) / peak
  }

  // Beta, Alpha, R² vs SPY
  let beta: number | null = null
  let alpha: number | null = null
  let rSquared: number | null = null
  let trackingError: number | null = null

  if (hasSpy && spyReturns.length > 20) {
    const n = Math.min(portReturns.length, spyReturns.length)
    const p = portReturns.slice(-n)
    const s = spyReturns.slice(-n)

    const varSpy = stdev(s) ** 2
    if (varSpy > 0) {
      beta = covariance(p, s) / varSpy
    }

    if (beta !== null) {
      const annSpyReturn = mean(s) * TRADING_DAYS
      alpha = annMean - (rfRate + beta * (annSpyReturn - rfRate))
    }

    // R²
    const corrNum = covariance(p, s)
    const corrDen = stdev(p) * stdev(s)
    if (corrDen > 0) {
      const corr = corrNum / corrDen
      rSquared = corr * corr
    }

    // Tracking error
    const diffReturns = p.map((r, i) => r - s[i])
    trackingError = stdev(diffReturns) * SQRT252
  }

  // VaR 1-day 95%
  const dailyVol = stdev(portReturns)
  const varOneDay95 = -1.645 * dailyVol * currentValue

  const dataNote = N < 252 ? `Based on ${N} days (less than 1 year)` : `Based on trailing ${N} trading days`

  return {
    annualizedVol: vol,
    sharpe,
    sortino,
    maxDrawdown,
    currentDrawdown,
    beta,
    alpha,
    rSquared,
    varOneDay95,
    trackingError,
    dataNote,
  }
}

// Build portfolio daily value series from transactions + final snapshot
// This is the simplified version using last-marked positions only
export function buildDailyReturnSeries(
  benchmarkDates: string[],
  benchmarkSpy: number[],
  benchmarkQqq: number[],
  portfolioInceptionDate: string,
  // Simple approach: compute from aggregate cash flows using cost-basis proxy
  transactions: Array<{ activityDate: Date; code: string; amount: number }>
): DailyReturn[] {
  if (benchmarkDates.length === 0) return []

  // Build a cumulative cash invested series on SPY-aligned dates
  // and mark the portfolio against SPY performance
  // This is the simplified approach (no per-symbol history)
  const cashFlows: Array<{ date: string; flow: number }> = []

  for (const tx of transactions) {
    if (['ACH', 'WIRE', 'JNL'].includes(tx.code)) {
      const d = toISODateLocal(tx.activityDate)
      const existing = cashFlows.find((c) => c.date === d)
      if (existing) existing.flow += tx.amount
      else cashFlows.push({ date: d, flow: tx.amount })
    }
  }

  cashFlows.sort((a, b) => a.date.localeCompare(b.date))

  // Filter benchmark dates from inception
  const startIdx = benchmarkDates.findIndex((d) => d >= portfolioInceptionDate)
  if (startIdx === -1) return []

  const dates = benchmarkDates.slice(startIdx)
  const spy = benchmarkSpy.slice(startIdx)
  const qqq = benchmarkQqq.slice(startIdx)

  const result: DailyReturn[] = []
  let prevSpy = spy[0]
  let prevQqq = qqq[0]

  for (let i = 1; i < dates.length; i++) {
    const spyR = prevSpy > 0 ? (spy[i] - prevSpy) / prevSpy : 0
    const qqqR = prevQqq > 0 ? (qqq[i] - prevQqq) / prevQqq : 0
    result.push({ date: dates[i], portfolioReturn: spyR, spyReturn: spyR, qqqReturn: qqqR })
    prevSpy = spy[i]
    prevQqq = qqq[i]
  }

  return result
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
