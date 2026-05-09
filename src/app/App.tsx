import { useEffect, useCallback, useRef } from 'react'
import { Header } from './Header'
import { DropZone } from './DropZone'
import { Hero } from '../sections/Hero'
import { PerformanceSection } from '../sections/PerformanceSection'
import { AllocationSection } from '../sections/AllocationSection'
import { RiskSection } from '../sections/RiskSection'
import { HoldingsSection } from '../sections/HoldingsSection'
import { ClosedTradesSection } from '../sections/ClosedTradesSection'
import { SettingsPanel } from '../components/Settings'
import { ToastContainer, showToast } from '../components/Toast'
import { usePortfolioStore } from '../store/portfolioStore'
import { useSettingsStore } from '../store/settingsStore'
import { parseCSV } from '../data/csvParser'
import { buildPortfolioSnapshot, applyQuotes } from '../data/lotEngine'
import { fetchQuotes, fetchSectorProfiles, getCachedQuotes, getCachedSectors } from '../data/quotes'
import { fetchBenchmarks } from '../data/benchmarks'
import { fmtDate } from '../utils/dates'

export default function App() {
  const {
    snapshot, loadFromLocalStorage, setCSV, setSnapshot,
    setBenchmarks, setQuotesLoading, setQuotesFetched, setQuotesStale,
  } = usePortfolioStore()
  const { showSettings, finnhubKey, loadSettings } = useSettingsStore()
  const hasInitialized = useRef(false)

  // On mount: load settings + restore from localStorage
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    loadSettings()
    loadFromLocalStorage()
  }, [])

  // Fetch benchmarks whenever we have a snapshot or the API key changes
  // (Finnhub key unlocks fallback benchmark source if Stooq is unavailable)
  useEffect(() => {
    fetchBenchmarks(finnhubKey || undefined).then(setBenchmarks).catch(console.warn)
  }, [snapshot?.positions?.length, finnhubKey])

  // Fetch live quotes after snapshot loads or API key changes
  const symbolsKey = snapshot?.positions.map(p => p.symbol).sort().join(',') ?? ''
  useEffect(() => {
    if (!snapshot || symbolsKey === '') return
    const symbols = snapshot.positions.map((p) => p.symbol)
    if (symbols.length === 0) return

    const key = useSettingsStore.getState().finnhubKey
    if (!key) {
      setQuotesStale(true)
      return
    }

    setQuotesStale(false)
    setQuotesLoading(true)

    fetchQuotes(symbols, key, (done, total) => {
      usePortfolioStore.getState().setQuotesLoading(true, { done, total })
    }).then((quotes) => {
      fetchSectorProfiles(symbols, key).then((sectors) => {
        const mergedQuotes: Record<string, { price: number; prevClose: number; sector?: string; industry?: string }> = {}
        for (const sym of symbols) {
          if (quotes[sym]) {
            mergedQuotes[sym] = {
              ...quotes[sym],
              sector: sectors[sym]?.sector,
              industry: sectors[sym]?.industry,
            }
          }
        }
        const updatedSnapshot = applyQuotes(snapshot, mergedQuotes)
        setSnapshot(updatedSnapshot)
        setQuotesFetched()
        showToast(`Quotes updated for ${Object.keys(mergedQuotes).length} symbols`, 'success')
      }).catch(() => {
        const updatedSnapshot = applyQuotes(snapshot, quotes)
        setSnapshot(updatedSnapshot)
        setQuotesFetched()
      })
    }).catch((err) => {
      console.error('Quote fetch failed:', err)
      setQuotesLoading(false)
      showToast('Could not fetch live quotes. Check your API key in Settings.', 'warn')
    })
  }, [symbolsKey, finnhubKey])

  const handleCSVFile = useCallback(async (file: File) => {
    const text = await file.text()
    try {
      const parseResult = parseCSV(text)
      const snap = buildPortfolioSnapshot(parseResult.transactions)

      setCSV(text, parseResult, snap)

      const { transactions, symbols, firstDate, lastDate, skipped } = parseResult
      const fromStr = firstDate ? fmtDate(firstDate) : '?'
      const toStr = lastDate ? fmtDate(lastDate) : '?'
      const msg = `${transactions.length.toLocaleString()} transactions · ${symbols.length} symbols · ${fromStr} – ${toStr}`

      if (skipped.length > 0) {
        showToast(msg, 'warn', {
          label: 'Show log',
          onClick: () => {
            const logText = skipped.map((s) => `Row ${s.row}: ${s.reason}`).join('\n')
            alert(`Parser log:\n\n${logText}`)
          },
        })
      } else {
        showToast(msg, 'success')
      }

      // Warn about MERGER/SPINOFF
      if (snap.warningSymbols.length > 0) {
        showToast(`⚠ Merger/spinoff activity found for: ${snap.warningSymbols.join(', ')}`, 'warn')
      }

      // Apply cached quotes if available
      const key = useSettingsStore.getState().finnhubKey
      const cachedQuotes = getCachedQuotes()
      const cachedSectors = getCachedSectors()
      if (Object.keys(cachedQuotes).length > 0) {
        const merged: Record<string, any> = {}
        snap.positions.forEach((p) => {
          if (cachedQuotes[p.symbol]) {
            merged[p.symbol] = {
              ...cachedQuotes[p.symbol],
              sector: cachedSectors[p.symbol]?.sector,
            }
          }
        })
        if (Object.keys(merged).length > 0) {
          const updatedSnap = applyQuotes(snap, merged)
          setSnapshot(updatedSnap)
        }
      }

      // Refresh benchmarks
      fetchBenchmarks().then(setBenchmarks).catch(console.warn)

    } catch (err) {
      showToast(`Parse error: ${String(err)}`, 'error')
    }
  }, [])

  const hasData = !!snapshot

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header onCSVLoad={handleCSVFile} />

      {showSettings && <SettingsPanel />}

      <DropZone onFile={handleCSVFile} active={hasData} />

      {hasData && (
        <main style={{ maxWidth: 1440, margin: '0 auto' }}>
          <Hero />
          <hr className="section-divider" style={{ margin: '0 32px 0', borderColor: 'var(--border)' }} />
          <div className="perf-alloc-grid">
            <PerformanceSection />
            <AllocationSection />
          </div>
          <hr className="section-divider" style={{ margin: '0 32px 0', borderColor: 'var(--border)' }} />
          <RiskSection />
          <hr className="section-divider" style={{ margin: '0 32px 0', borderColor: 'var(--border)' }} />
          <HoldingsSection />
          <hr className="section-divider" style={{ margin: '0 32px 0', borderColor: 'var(--border)' }} />
          <ClosedTradesSection />
          <div style={{ height: 64 }} />
        </main>
      )}

      <ToastContainer />
    </div>
  )
}
