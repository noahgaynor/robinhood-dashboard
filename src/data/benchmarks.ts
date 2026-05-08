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
    return d
  } catch { return null }
}

function saveCache(d: BenchmarkData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch {}
}

async function fetchStooqCSV(ticker: string): Promise<{ dates: string[]; closes: number[] }> {
  const url = `https://stooq.com/q/d/l/?s=${ticker}.us&i=d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Stooq fetch failed for ${ticker}`)
  const text = await res.text()
  const lines = text.trim().split('\n')
  // Header: Date,Open,High,Low,Close,Volume
  const dates: string[] = []
  const closes: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 5) continue
    const d = parts[0].trim()
    const c = parseFloat(parts[4])
    if (!isNaN(c) && d) {
      dates.push(d)
      closes.push(c)
    }
  }
  return { dates, closes }
}

export async function fetchBenchmarks(): Promise<BenchmarkData> {
  const cached = loadCache()
  if (cached) return cached

  try {
    const [spyData, qqqData] = await Promise.all([
      fetchStooqCSV('spy'),
      fetchStooqCSV('qqq'),
    ])

    // Align on common dates
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

    const result: BenchmarkData = { dates, spy, qqq, fetchedAt: Date.now() }
    saveCache(result)
    return result
  } catch (e) {
    console.warn('Benchmark fetch failed:', e)
    // Return empty — UI degrades gracefully
    return { dates: [], spy: [], qqq: [], fetchedAt: Date.now() }
  }
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

// Returns daily return series aligned to a given date array
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
