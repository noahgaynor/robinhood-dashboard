import { useState, useMemo } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'
import { fmt, fmtPct } from '../utils/money'
import { fmtDate } from '../utils/dates'
import { ClosedTrade } from '../data/types'
import { computeTradingMetrics } from '../data/metrics/portfolio'

type Filter = 'all' | 'winners' | 'losers'
type SortField = 'symbol' | 'openedAt' | 'closedAt' | 'holdDays' | 'realizedPnl' | 'realizedPnlPct'

export function ClosedTradesSection() {
  const { snapshot } = usePortfolioStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [sortField, setSortField] = useState<SortField>('closedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const trading = useMemo(() => {
    if (!snapshot) return null
    return computeTradingMetrics(snapshot.closedTrades, snapshot.positions)
  }, [snapshot])

  const trades = useMemo(() => {
    if (!snapshot) return []
    let list = [...snapshot.closedTrades]
    if (filter === 'winners') list = list.filter((t) => t.realizedPnl > 0)
    else if (filter === 'losers') list = list.filter((t) => t.realizedPnl <= 0)
    list.sort((a, b) => {
      let av: number, bv: number
      switch (sortField) {
        case 'symbol': return sortDir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol)
        case 'openedAt': av = a.openedAt.getTime(); bv = b.openedAt.getTime(); break
        case 'closedAt': av = a.closedAt.getTime(); bv = b.closedAt.getTime(); break
        case 'holdDays': av = a.holdDays; bv = b.holdDays; break
        case 'realizedPnl': av = a.realizedPnl; bv = b.realizedPnl; break
        case 'realizedPnlPct': av = a.realizedPnlPct; bv = b.realizedPnlPct; break
        default: av = a.closedAt.getTime(); bv = b.closedAt.getTime()
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [snapshot, filter, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  if (!snapshot || snapshot.closedTrades.length === 0) {
    return (
      <section style={{ padding: '0 32px 32px' }}>
        <span className="section-title" style={{ display: 'block', marginBottom: 16 }}>Closed Trades</span>
        <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
          No closed trades in this CSV.
        </div>
      </section>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <span style={{ marginLeft: 4, color: sortField === field ? 'var(--accent)' : 'var(--text-3)', fontSize: 10 }}>
      {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <section style={{ padding: '0 32px 32px' }} id="trades">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span className="section-title">Closed Trades ({snapshot.closedTrades.length})</span>
          {trading && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Win rate{' '}
              <span style={{ color: 'var(--text-2)' }}>
                {trading.winRate !== null ? fmtPct(trading.winRate * 100, { sign: false }) : '—'}
              </span>
              {' · '}Profit factor{' '}
              <span style={{ color: 'var(--text-2)' }}>
                {trading.profitFactor !== null ? trading.profitFactor.toFixed(2) : '—'}
              </span>
              {' · '}Expectancy{' '}
              <span style={{ color: trading.expectancy !== null && trading.expectancy >= 0 ? 'var(--pos)' : 'var(--neg)', fontFeatureSettings: '"tnum"' }}>
                {trading.expectancy !== null ? fmt(trading.expectancy, { sign: true }) : '—'}
              </span>
              {' per trade'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'winners', 'losers'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--surface-2)' : 'none',
                border: `1px solid ${filter === f ? 'var(--border)' : 'transparent'}`,
                color: filter === f ? 'var(--text)' : 'var(--text-3)',
                borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {([
                  ['symbol', 'Symbol'],
                  ['openedAt', 'Opened'],
                  ['closedAt', 'Closed'],
                  ['holdDays', 'Hold'],
                  ['realizedPnl', 'P&L $'],
                  ['realizedPnlPct', 'P&L %'],
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
                <th style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Term
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => <TradeRow key={`${t.symbol}-${t.closedAt.toISOString()}-${i}`} trade={t} />)}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    No trades match this filter
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

function TradeRow({ trade: t }: { trade: ClosedTrade }) {
  const isWin = t.realizedPnl > 0
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.symbol}</td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>
        {fmtDate(t.openedAt)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontFeatureSettings: '"tnum"' }}>
        {fmtDate(t.closedAt)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>
        {t.holdDays}d
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: isWin ? 'var(--pos)' : 'var(--neg)', fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
        {fmt(t.realizedPnl, { sign: true })}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: isWin ? 'var(--pos)' : 'var(--neg)', fontFeatureSettings: '"tnum"' }}>
        {fmtPct(t.realizedPnlPct)}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
          background: t.term === 'long' ? 'rgba(127,231,182,0.1)' : 'rgba(92,92,102,0.15)',
          color: t.term === 'long' ? 'var(--accent)' : 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {t.term}
        </span>
      </td>
    </tr>
  )
}
