import { create } from 'zustand'
import { Transaction, PortfolioSnapshot, ParseResult, BenchmarkData } from '../data/types'
import { parseCSV } from '../data/csvParser'

const RAW_CSV_KEY = 'rhd:csv'
const SNAPSHOT_KEY = 'rhd:snapshot'
const PARSER_VERSION = 'v1.0'

interface PortfolioStore {
  // Raw data
  rawCSV: string | null
  parseResult: ParseResult | null
  transactions: Transaction[]
  snapshot: PortfolioSnapshot | null
  benchmarks: BenchmarkData | null

  // Quote state
  quotesLoading: boolean
  quotesProgress: { done: number; total: number } | null
  quotesLastFetched: Date | null
  quotesStale: boolean  // true when no API key

  // Equity curve (built from benchmarks + transactions)
  equityCurve: Array<{ date: string; portfolio: number; spy: number; qqq: number }> | null

  // Actions
  loadFromLocalStorage: () => void
  setCSV: (csv: string, result: ParseResult, snapshot: PortfolioSnapshot) => void
  setSnapshot: (snapshot: PortfolioSnapshot) => void
  setBenchmarks: (data: BenchmarkData) => void
  setQuotesLoading: (loading: boolean, progress?: { done: number; total: number }) => void
  setQuotesStale: (stale: boolean) => void
  setQuotesFetched: () => void
  setEquityCurve: (curve: Array<{ date: string; portfolio: number; spy: number; qqq: number }>) => void
  clearAll: () => void
}

function serializeSnapshot(snapshot: PortfolioSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    asOf: snapshot.asOf.toISOString(),
    firstActivityDate: snapshot.firstActivityDate?.toISOString() ?? null,
    positions: snapshot.positions.map((p) => ({
      ...p,
      lots: p.lots.map((l) => ({ ...l, acquiredAt: l.acquiredAt.toISOString() })),
    })),
    closedTrades: snapshot.closedTrades.map((t) => ({
      ...t,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt.toISOString(),
    })),
    _parserVersion: PARSER_VERSION,
  })
}

function deserializeSnapshot(raw: string): PortfolioSnapshot | null {
  try {
    const data = JSON.parse(raw)
    if (data._parserVersion !== PARSER_VERSION) return null
    return {
      ...data,
      asOf: new Date(data.asOf),
      firstActivityDate: data.firstActivityDate ? new Date(data.firstActivityDate) : null,
      positions: data.positions.map((p: any) => ({
        ...p,
        lots: p.lots.map((l: any) => ({ ...l, acquiredAt: new Date(l.acquiredAt) })),
      })),
      closedTrades: data.closedTrades.map((t: any) => ({
        ...t,
        openedAt: new Date(t.openedAt),
        closedAt: new Date(t.closedAt),
      })),
    }
  } catch { return null }
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  rawCSV: null,
  parseResult: null,
  transactions: [],
  snapshot: null,
  benchmarks: null,
  quotesLoading: false,
  quotesProgress: null,
  quotesLastFetched: null,
  quotesStale: false,
  equityCurve: null,

  loadFromLocalStorage: () => {
    const csv = localStorage.getItem(RAW_CSV_KEY)
    const snapshotRaw = localStorage.getItem(SNAPSHOT_KEY)
    if (csv && snapshotRaw) {
      const snapshot = deserializeSnapshot(snapshotRaw)
      if (snapshot) {
        // Re-parse the CSV so transactions are available for XIRR and other metrics
        try {
          const parseResult = parseCSV(csv)
          set({ rawCSV: csv, snapshot, transactions: parseResult.transactions, parseResult })
        } catch {
          // Parsing failed (shouldn't happen if CSV was valid before), restore without transactions
          set({ rawCSV: csv, snapshot })
        }
      }
    }
  },

  setCSV: (csv, result, snapshot) => {
    try { localStorage.setItem(RAW_CSV_KEY, csv) } catch {}
    try { localStorage.setItem(SNAPSHOT_KEY, serializeSnapshot(snapshot)) } catch {}
    set({ rawCSV: csv, parseResult: result, transactions: result.transactions, snapshot })
  },

  setSnapshot: (snapshot) => {
    try { localStorage.setItem(SNAPSHOT_KEY, serializeSnapshot(snapshot)) } catch {}
    set({ snapshot })
  },

  setBenchmarks: (benchmarks) => set({ benchmarks }),

  setQuotesLoading: (loading, progress) =>
    set({ quotesLoading: loading, quotesProgress: progress ?? null }),

  setQuotesStale: (stale) => set({ quotesStale: stale }),

  setQuotesFetched: () => set({ quotesLastFetched: new Date(), quotesLoading: false }),

  setEquityCurve: (equityCurve) => set({ equityCurve }),

  clearAll: () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rhd:'))
      .forEach((k) => localStorage.removeItem(k))
    set({
      rawCSV: null, parseResult: null, transactions: [],
      snapshot: null, benchmarks: null, quotesLoading: false,
      quotesProgress: null, quotesLastFetched: null, quotesStale: false,
      equityCurve: null,
    })
  },
}))
