import { usePortfolioStore } from '../store/portfolioStore'
import { useSettingsStore } from '../store/settingsStore'
import { fmt, fmtPct } from '../utils/money'
import { fmtDate } from '../utils/dates'
import { computeXIRR, buildXIRRCashflows } from '../data/metrics/performance'
import { differenceInDays } from 'date-fns'

export function Hero() {
  const { snapshot, transactions, quotesStale } = usePortfolioStore()
  const { finnhubKey } = useSettingsStore()

  if (!snapshot) return null

  const {
    totalValue, totalCostBasis, unrealizedPnl, realizedPnl, dividendsReceived,
    netInvested, positions, firstActivityDate,
  } = snapshot

  const dollarGain = totalValue + realizedPnl + dividendsReceived - netInvested
  const pctGain = netInvested > 0 ? (dollarGain / netInvested) * 100 : 0

  // XIRR
  const xirrFlows = buildXIRRCashflows(transactions, totalValue)
  const xirr = xirrFlows.length >= 2 ? computeXIRR(xirrFlows) : null

  const daysSince = firstActivityDate
    ? differenceInDays(new Date(), firstActivityDate)
    : null

  const gainColor = dollarGain >= 0 ? 'var(--pos)' : 'var(--neg)'
  void quotesStale // used in banner below

  return (
    <section style={{ padding: '32px 32px 24px' }}>
      {/* No API key banner */}
      {!finnhubKey && (
        <div style={{
          background: 'rgba(245,194,107,0.08)', border: '1px solid rgba(245,194,107,0.2)',
          borderRadius: 8, padding: '8px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: 'var(--warn)',
        }}>
          <span>Quotes stale — live prices unavailable</span>
          <button
            onClick={() => useSettingsStore.getState().toggleSettings()}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}
          >
            Add free Finnhub API key →
          </button>
        </div>
      )}

      {/* Warning for MERGER/SPINOFF symbols */}
      {snapshot.warningSymbols.length > 0 && (
        <div style={{
          background: 'rgba(245,194,107,0.06)', border: '1px solid rgba(245,194,107,0.2)',
          borderRadius: 8, padding: '8px 16px', marginBottom: 20,
          fontSize: 12, color: 'var(--warn)',
        }}>
          ⚠ Merger/spinoff activity detected for: {snapshot.warningSymbols.join(', ')} — numbers may be approximate for these symbols.
        </div>
      )}

      {/* Hero strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 40px', alignItems: 'end' }}>
        {/* Total value */}
        <div>
          <div style={{ fontSize: '2.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
            {fmt(totalValue)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Total value</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            vs. cost basis {fmt(totalCostBasis)} ({fmtPct(totalCostBasis > 0 ? ((totalValue - totalCostBasis) / totalCostBasis) * 100 : 0)})
          </div>
        </div>

        {/* Total return */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, color: gainColor, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
            {fmt(dollarGain, { sign: true })}
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 500, color: gainColor }}>
            {fmtPct(pctGain)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Total return</div>
          {daysSince && (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              over {daysSince} days since {fmtDate(firstActivityDate)}
            </div>
          )}
        </div>
      </div>

      {/* TWR / XIRR context line */}
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-2)' }}>
        {xirr !== null ? (
          <span>XIRR <strong style={{ color: 'var(--text)', fontFeatureSettings: '"tnum"' }}>{fmtPct(xirr * 100)}</strong></span>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>XIRR: insufficient cash flow data</span>
        )}
        <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
          · Realized P&L <span style={{ color: realizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)', fontFeatureSettings: '"tnum"' }}>{fmt(realizedPnl, { sign: true })}</span>
          · Dividends <span style={{ fontFeatureSettings: '"tnum"' }}>{fmt(dividendsReceived)}</span>
          · Unrealized <span style={{ color: unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)', fontFeatureSettings: '"tnum"' }}>{fmt(unrealizedPnl, { sign: true })}</span>
        </span>
      </div>
    </section>
  )
}
