import { useRef } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'
import { useSettingsStore } from '../store/settingsStore'
import { fmtRelative, fmtDate } from '../utils/dates'

interface HeaderProps {
  onCSVLoad: (file: File) => void
}

export function Header({ onCSVLoad }: HeaderProps) {
  const { snapshot, quotesLastFetched, quotesLoading, quotesProgress } = usePortfolioStore()
  const { toggleSettings } = useSettingsStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lastCSVDate = snapshot?.asOf ? fmtDate(snapshot.asOf) : null
  const lastRefreshed = quotesLastFetched ? fmtRelative(quotesLastFetched) : null

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(10,10,11,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      padding: '0 32px',
      height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em' }}>
          PORTFOLIO
        </span>
        {snapshot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {quotesLoading ? (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {quotesProgress ? `Fetching quotes ${quotesProgress.done}/${quotesProgress.total}…` : 'Loading quotes…'}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {lastRefreshed ? `Quotes ${lastRefreshed}` : ''}
                {lastCSVDate ? ` · CSV thru ${lastCSVDate}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {snapshot && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)',
                borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              Replace CSV
            </button>
          </>
        )}
        <button
          onClick={toggleSettings}
          style={{
            background: 'none', border: 'none', color: 'var(--text-2)',
            fontSize: 16, cursor: 'pointer', padding: '4px 6px',
            borderRadius: 6, transition: 'color 0.15s',
          }}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onCSVLoad(file)
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}
