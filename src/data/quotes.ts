import { QuoteData } from './types'

const CACHE_KEY = 'rhd:quotes'
const SECTOR_CACHE_KEY = 'rhd:sectors'
const STALE_MS = 15 * 60 * 1000 // 15 minutes

interface QuoteCache {
  [symbol: string]: QuoteData
}

interface SectorCache {
  [symbol: string]: { sector: string; industry: string; fetchedAt: number }
}

function loadQuoteCache(): QuoteCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch { return {} }
}

function saveQuoteCache(cache: QuoteCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function loadSectorCache(): SectorCache {
  try {
    return JSON.parse(localStorage.getItem(SECTOR_CACHE_KEY) || '{}')
  } catch { return {} }
}

function saveSectorCache(cache: SectorCache) {
  try { localStorage.setItem(SECTOR_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function isFresh(ts: number): boolean {
  return Date.now() - ts < STALE_MS
}

function isMarketHours(): boolean {
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const h = est.getHours()
  const day = est.getDay()
  return day >= 1 && day <= 5 && h >= 9 && h < 16
}

export async function fetchQuotes(
  symbols: string[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void
): Promise<QuoteCache> {
  const cache = loadQuoteCache()
  const toFetch = symbols.filter((s) => {
    const q = cache[s]
    return !q || (isMarketHours() && !isFresh(q.fetchedAt))
  })

  if (toFetch.length === 0) return cache

  // Chunk to stay under 60/min rate limit
  const CHUNK = 10
  const DELAY = 1100 // ms between chunks

  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK)
    await Promise.allSettled(
      chunk.map(async (sym) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`
          )
          if (!res.ok) return
          const data = await res.json()
          if (data && data.c > 0) {
            cache[sym] = {
              symbol: sym,
              price: data.c,
              prevClose: data.pc,
              change: data.d ?? data.c - data.pc,
              changePct: data.dp ?? ((data.c - data.pc) / data.pc) * 100,
              fetchedAt: Date.now(),
            }
          }
        } catch {}
      })
    )
    onProgress?.(Math.min(i + CHUNK, toFetch.length), toFetch.length)
    if (i + CHUNK < toFetch.length) {
      await new Promise((r) => setTimeout(r, DELAY))
    }
  }

  saveQuoteCache(cache)
  return cache
}

export async function fetchSectorProfiles(
  symbols: string[],
  apiKey: string
): Promise<SectorCache> {
  const cache = loadSectorCache()
  // Only fetch once per session (sector doesn't change)
  const toFetch = symbols.filter((s) => !cache[s])

  for (let i = 0; i < toFetch.length; i += 5) {
    const chunk = toFetch.slice(i, i + 5)
    await Promise.allSettled(
      chunk.map(async (sym) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${apiKey}`
          )
          if (!res.ok) return
          const data = await res.json()
          if (data?.finnhubIndustry) {
            cache[sym] = {
              sector: data.finnhubIndustry,
              industry: data.finnhubIndustry,
              fetchedAt: Date.now(),
            }
          }
        } catch {}
      })
    )
    if (i + 5 < toFetch.length) {
      await new Promise((r) => setTimeout(r, 1100))
    }
  }

  saveSectorCache(cache)
  return cache
}

export function getCachedQuotes(): QuoteCache {
  return loadQuoteCache()
}

export function getCachedSectors(): SectorCache {
  return loadSectorCache()
}
