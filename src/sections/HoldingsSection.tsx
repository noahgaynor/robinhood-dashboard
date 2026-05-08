import { useState, useMemo } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'
import { fmt, fmtPct } from '../utils/money'
import { Position } from '../data/types'

type SortField = 'symbol' | 'shares' | 'avgCost' | 'marketPrice' | 'marketValue' | 'unrealizedPnl' | 'pct'
type SortDir = 'asc' | 'desc'

export function HoldingsSection() {
  const { snapshot } = usePortfolioStore()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('marketValue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const positions = useMemo(() => {
    if (!snapshot) return []
    let list = [...snapshot.positions]
    if (search) {
      list = list.filter((p) => p.symbol.toLowerCase().includes(search.toLowerCase()))
    }
    list.sort((a, b) => {
      let av: number, bv: number
      switch (sortField) {
        case 'symbol': return sortDir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol)
        case 'shares': av = a.shares; bv = b.shares; break
        case 'avgCost': av = a.avgCost; bv = b.avgCost; break
        case 'marketPrice': av = a.marketPrice; bv = b.marketPrice; break
        case 'marketValue': av = a.marketValue; bv = b.marketValue; break
        case 'unrealizedPnl': av = a.unrealizedPnl; bv = b.unrealizedPnl; break
        case 'pct': av = a.pctOfPortfolio; bv = b.pctOfPortfolio; break
        default: av = a.marketValue; bv = b.marketValue
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [snapshot, search, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <span style={{ marginLeft: 4, color: sortField === field ? 'var(--accent)' : 'var(--text-3)', fontSize: 10 }}>
      {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  const downloadCSV = () => {
    if (!positions.length) return
    const header = 'Symbol,Shares,Avg Cost,Market Price,Market Value,Unrealized P&L,Unrealized %,Weight %,Sector'
    const rows = positions.map((p) =>
      [p.symbol, p.shares.toFixed(6), p.avgCost.toFixed(4), p.marketPrice.toFixed(4),
       p.marketValue.toFixed(2), p.unrealizedPnl.toFixed(2), p.unrealizedPnlPct.toFixed(2),
       p.pctOfPortfolio.toFixed(2), p.sector ?? ''].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'holdings.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!snapshot) return null

  return (
    <section style={{ padding: '0 32px 32px' }} id="holdings">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <span className="section-title">Holdings ({snapshot.positions.length})</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol…"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '6px 12px', color: 'var(--text)', fontSize: 12, outline: 'none', width: 160,
            }}
          />
          <button
            onClick={downloadCSV}
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {([
                  ['symbol', 'Symbol'],
                  ['shares', 'Shares'],
                  ['avgCost', 'Avg Cost'],
                  ['marketPrice', 'Price'],
                  ['marketValue', 'Mkt Value'],
                  ['unrealizedPnl', 'Unrealized P&L'],
                  ['pct', 'Wt %'],
                ] as [SortField, string][]).map(([field, label]) => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    style={{
                      padding: '10px 12px', fontSize: 11, color: 'var(--text-2)', fontWeight: 500,
                      textAlign: field === 'symbol' ? 'left' : 'right', cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.04em', userSelect: 'none',
                    }}
                  >
                    {label}<SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow key={p.symbol} position={p} />
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    No positions match your search
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function PositionRow({ position: p }: { position: Position }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border)', transition: 'background 0.1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.symbol}</span>
          {p.isDelisted && (
            <span style={{ fontSize: 10, color: 'var(--warn)', fontStyle: 'italic', fontWeight: 400 }}>delisted</span>
          )}
          {p.sector && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.sector}</span>
          )}
        </div>
        {p.lots.length > 1 && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{p.lots.length} lots</div>
        )}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontFeatureSettings: '"tnum"' }}>
        {p.shares < 1 ? p.shares.toFixed(6) : p.shares.toFixed(4)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontFeatureSettings: '"tnum"' }}>
        {fmt(p.avgCost)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text)', fontFeatureSettings: '"tnum"' }}>
        <span style={{ fontStyle: p.isDelisted ? 'italic' : 'normal' }}>{fmt(p.marketPrice)}</span>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text)', fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
        {fmt(p.marketValue)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontFeatureSettings: '"tnum"' }}>
        <div style={{ color: p.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {fmt(p.unrealizedPnl, { sign: true })}
        </div>
        <div style={{ fontSize: 11, color: p.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)', opacity: 0.8 }}>
          {fmtPct(p.unrealizedPnlPct)}
        </div>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>
        {p.pctOfPortfolio.toFixed(1)}%
      </td>
    </tr>
  )
}
