import { BenchmarkData } from './types'
export type { BenchmarkData }

const CACHE_KEY = 'rhd:benchmarks'
const TTL_MS = 24 * 60 * 60 * 1000 // 1 day

function loadCache(): BenchmarkData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const d: BenchmarkData = JSON.parse(raw)
    if (Date.now() - d.fetchedAt > TTL_MS) return null
    if (d.dates.length === 0) return null // don't serve empty cache
    return d
  } catch { return null }
}

function saveCache(d: BenchmarkData) {
  if (d.dates.length === 0) return // never cache empty results
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch {}
}

async function fetchStooqCSV(ticker: string): Promise<{ dates: string[]; closes: number[] }> {
  const url = `https://stooq.com/q/d/l/?s=${ticker}.us&i=d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Stooq fetch failed for ${ticker}: ${res.status}`)
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 3) throw new Error(`Stooq returned no data for ${ticker}`)
  // Header: Date,Open,High,Low,Close,Volume
  const dates: string[] = []
  const closes: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 5) continue
    const d = parts[0].trim()
    const c = parseFloat(parts[4])
    if (!isNaN(c) && d && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dates.push(d)
      closes.push(c)
    }
  }
  if (dates.length === 0) throw new Error(`Stooq returned no valid rows for ${ticker}`)
  return { dates, closes }
}

async function fetchFinnhubCandles(
  symbol: string,
  fromUnix: number,
  toUnix: number,
  key: string
): Promise<{ dates: string[]; closes: number[] }> {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromUnix}&to=${toUnix}&token=${key}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub candle fetch failed for ${symbol}: ${res.status}`)
  const data = await res.json()
  if (data.s !== 'ok' || !data.t || data.t.length === 0) {
    throw new Error(`Finnhub returned no data for ${symbol}`)
  }
  const dates = (data.t as number[]).map((t) => {
    const d = new Date(t * 1000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  })
  return { dates, closes: data.c as number[] }
}

function buildAlignedBenchmark(
  spyData: { dates: string[]; closes: number[] },
  qqqData: { dates: string[]; closes: number[] }
): BenchmarkData {
  const spyMap: Record<string, number> = {}
  spyData.dates.forEach((d, i) => { spyMap[d] = spyData.closes[i] })
  const qqqMap: Record<string, number> = {}
  qqqData.dates.forEach((d, i) => { qqqMap[d] = qqqData.closes[i] })

  const allDates = [...new Set([...spyData.dates, ...qqqData.dates])].sort()
  const dates: string[] = []
  const spy: number[] = []
  const qqq: number[] = []

  let lastSpy = 0, lastQqq = 0
  for (const d of allDates) {
    const s = spyMap[d]
    const q = qqqMap[d]
    if (s !== undefined) lastSpy = s
    if (q !== undefined) lastQqq = q
    if (lastSpy > 0 && lastQqq > 0) {
      dates.push(d)
      spy.push(lastSpy)
      qqq.push(lastQqq)
    }
  }
  return { dates, spy, qqq, fetchedAt: Date.now() }
}

export async function fetchBenchmarks(finnhubKey?: string): Promise<BenchmarkData> {
  const cached = loadCache()
  if (cached) return cached

  // Try Stooq first (no key required, longer history)
  try {
    const [spyData, qqqData] = await Promise.all([
      fetchStooqCSV('spy'),
      fetchStooqCSV('qqq'),
    ])
    const result = buildAlignedBenchmark(spyData, qqqData)
    saveCache(result)
    return result
  } catch (stooqErr) {
    console.warn('Stooq benchmark fetch failed:', stooqErr)
  }

  // Fallback: Finnhub candle data (requires API key, ~2 years of daily data)
  if (finnhubKey) {
    try {
      const toUnix = Math.floor(Date.now() / 1000)
      const fromUnix = toUnix - 2 * 365 * 24 * 3600 // 2 years back
      const [spyData, qqqData] = await Promise.all([
        fetchFinnhubCandles('SPY', fromUnix, toUnix, finnhubKey),
        fetchFinnhubCandles('QQQ', fromUnix, toUnix, finnhubKey),
      ])
      const result = buildAlignedBenchmark(spyData, qqqData)
      saveCache(result)
      return result
    } catch (finnhubErr) {
      console.warn('Finnhub benchmark fallback failed:', finnhubErr)
    }
  }

  // Both sources failed — return empty (NOT cached, so we retry next load)
  return { dates: [], spy: [], qqq: [], fetchedAt: 0 }
}

// Get benchmark returns over a date range (returns as decimal, e.g. 0.12 = 12%)
export function benchmarkReturn(
  data: BenchmarkData,
  ticker: 'spy' | 'qqq',
  fromDate: string,
  toDate: string
): number | null {
  const series = data[ticker]
  const { dates } = data
  if (dates.length === 0) return null

  let startIdx = dates.findIndex((d) => d >= fromDate)
  const endIdxRaw = [...dates].reverse().findIndex((d) => d <= toDate)
  let endIdx = endIdxRaw === -1 ? -1 : dates.length - 1 - endIdxRaw

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null

  const startPrice = series[startIdx]
  const endPrice = series[endIdx]
  if (!startPrice) return null
  return (endPrice - startPrice) / startPrice
}

// Returns daily return series aligned to a given date range
export function benchmarkDailyReturns(
  data: BenchmarkData,
  ticker: 'spy' | 'qqq',
  fromDate: string,
  toDate: string
): Array<{ date: string; return: number }> {
  const series = data[ticker]
  const { dates } = data

  const filtered = dates
    .map((d, i) => ({ date: d, price: series[i] }))
    .filter((x) => x.date >= fromDate && x.date <= toDate)

  const result: Array<{ date: string; return: number }> = []
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1].price
    const curr = filtered[i].price
    result.push({ date: filtered[i].date, return: prev > 0 ? (curr - prev) / prev : 0 })
  }
  return result
}
