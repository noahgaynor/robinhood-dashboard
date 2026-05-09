import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { usePortfolioStore } from '../store/portfolioStore'
import { useSettingsStore } from '../store/settingsStore'
import { MetricTile } from '../components/MetricTile'
import { fmt, fmtPct, fmtShort } from '../utils/money'
import { toISODate } from '../utils/dates'
import { benchmarkDailyReturns } from '../data/benchmarks'
import { computeRiskMetrics, DailyReturn } from '../data/metrics/risk'
import { computeConcentrationMetrics, computeSectorExposure, computeTradingMetrics } from '../data/metrics/portfolio'

export function RiskSection() {
  const { snapshot, benchmarks } = usePortfolioStore()
  const { rfRate } = useSettingsStore()

  const dailyReturns = useMemo((): DailyReturn[] => {
    if (!benchmarks || !snapshot?.firstActivityDate) return []
    const fromDate = toISODate(snapshot.firstActivityDate)
    const toDate = toISODate(new Date())
    const spyRets = benchmarkDailyReturns(benchmarks, 'spy', fromDate, toDate)
    const qqqRets = benchmarkDailyReturns(benchmarks, 'qqq', fromDate, toDate)
    const qqqMap: Record<string, number> = {}
    qqqRets.forEach((r) => { qqqMap[r.date] = r.return })

    // Without per-symbol daily price history we proxy portfolio returns with SPY.
    // This means Beta will always be ~1.0 and Alpha ~0% — those tiles show "—" below.
    // Vol / Sharpe / MaxDD will reflect SPY, which is a rough market approximation.
    return spyRets.map((r) => ({
      date: r.date,
      portfolioReturn: r.return,
      spyReturn: r.return,
      qqqReturn: qqqMap[r.date],
    }))
  }, [benchmarks, snapshot])

  // Detect when we're using a pure SPY proxy (no real portfolio daily series)
  // In that case, Beta/Alpha/R²/TE are trivially 1/0/100%/0 — don't show them
  const usingSpyProxy = dailyReturns.length > 0 &&
    dailyReturns.every((d) => d.portfolioReturn === d.spyReturn)

  const risk = useMemo(() => computeRiskMetrics(dailyReturns, snapshot?.totalValue ?? 0, rfRate), [dailyReturns, snapshot, rfRate])

  const concentration = useMemo(() => {
    if (!snapshot) return null
    return computeConcentrationMetrics(snapshot.positions, snapshot.cash, snapshot.totalValue)
  }, [snapshot])

  const sectors = useMemo(() => {
    if (!snapshot) return []
    return computeSectorExposure(snapshot.positions)
  }, [snapshot])

  const trading = useMemo(() => {
    if (!snapshot) return null
    return computeTradingMetrics(snapshot.closedTrades, snapshot.positions)
  }, [snapshot])

  if (!snapshot) return null

  // Tile badge logic
  const sharpeBadge = risk.sharpe === null ? null : risk.sharpe >= 2 ? 'good' : risk.sharpe >= 1 ? 'ok' : 'bad'
  const sortinoBadge = risk.sortino === null ? null : risk.sortino >= 2 ? 'good' : risk.sortino >= 1 ? 'ok' : 'bad'
  const volBadge = risk.annualizedVol === null ? null : risk.annualizedVol < 0.20 ? 'good' : risk.annualizedVol < 0.30 ? 'ok' : 'bad'

  const naDisplay = <span style={{ color: 'var(--text-3)', fontSize: '1rem' }}>—</span>

  return (
    <section style={{ padding: '0 32px 32px' }}>
      <span className="section-title" style={{ display: 'block', marginBottom: 16 }}>Risk</span>

      {/* SPY proxy disclaimer */}
      {usingSpyProxy && (
        <div style={{
          background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.25)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-1)' }}>Portfolio return series estimated from SPY.</strong>{' '}
            Without per-symbol daily price history, Vol, Sharpe, Sortino and Max Drawdown reflect market-level returns rather than your actual portfolio.
            Beta, Alpha, R², and Tracking Error are hidden because they would be trivially identical to the benchmark.
            Connect a Finnhub API key in Settings to enable live quotes.
          </span>
        </div>
      )}

      {/* 6 risk metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricTile
          title="Sharpe Ratio"
          value={risk.sharpe !== null ? risk.sharpe.toFixed(2) : naDisplay}
          context={risk.sharpe !== null
            ? risk.sharpe >= 2 ? 'excellent risk-adjusted return'
            : risk.sharpe >= 1 ? 'good — beats cash after adjusting for vol'
            : risk.sharpe >= 0 ? 'suboptimal — below benchmark threshold'
            : 'losing to cash on risk-adjusted basis'
            : risk.dataNote}
          badge={sharpeBadge}
        />
        <MetricTile
          title="Sortino Ratio"
          value={risk.sortino !== null ? risk.sortino.toFixed(2) : naDisplay}
          context={risk.sortino !== null
            ? risk.sortino >= 2 ? 'strong — penalizes losses only'
            : risk.sortino >= 1 ? 'decent downside-adjusted return'
            : 'significant downside drag'
            : risk.dataNote}
          badge={sortinoBadge}
        />
        <MetricTile
          title="Annualized Vol"
          value={risk.annualizedVol !== null ? fmtPct(risk.annualizedVol * 100, { sign: false }) : naDisplay}
          context="SPY ~15–20% · QQQ ~22–28% · >30% = high volatility portfolio"
          badge={volBadge}
        />
        <MetricTile
          title="Beta vs SPY"
          value={usingSpyProxy || risk.beta === null ? naDisplay : risk.beta.toFixed(2)}
          context={usingSpyProxy ? 'Needs per-symbol daily returns — unavailable with SPY proxy' : '1.0 = moves with market · <1 defensive · >1 amplified exposure'}
        />
        <MetricTile
          title="Max Drawdown"
          value={risk.maxDrawdown !== null ? fmtPct(risk.maxDrawdown * 100) : naDisplay}
          context="SPY hit −34% in 2020, −25% in 2022 — for reference"
          badge={risk.maxDrawdown !== null ? (risk.maxDrawdown > -0.3 ? 'ok' : 'bad') : null}
        />
        <MetricTile
          title="1-Day VaR 95%"
          value={risk.varOneDay95 !== null ? fmtShort(risk.varOneDay95) : naDisplay}
          context="Expected max 1-day loss ~1 day in 20 (parametric, normal distribution assumed)"
        />
      </div>

      {/* Row 2: Alpha, R², Tracking Error, Concentration */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricTile
          title="Alpha vs SPY"
          value={usingSpyProxy || risk.alpha === null ? naDisplay : fmtPct(risk.alpha * 100, { sign: true })}
          context={usingSpyProxy ? 'Needs per-symbol daily returns — unavailable with SPY proxy' : 'Annualized excess return after adjusting for market exposure'}
          badge={!usingSpyProxy && risk.alpha !== null ? (risk.alpha > 0 ? 'good' : 'bad') : null}
        />
        <MetricTile
          title="R² vs SPY"
          value={usingSpyProxy || risk.rSquared === null ? naDisplay : (risk.rSquared * 100).toFixed(0) + '%'}
          context={usingSpyProxy ? 'Needs per-symbol daily returns — unavailable with SPY proxy' : 'Share of variance explained by the market — high R² ≈ you own the index'}
        />
        <MetricTile
          title="Tracking Error"
          value={usingSpyProxy || risk.trackingError === null ? naDisplay : fmtPct(risk.trackingError * 100, { sign: false })}
          context={usingSpyProxy ? 'Needs per-symbol daily returns — unavailable with SPY proxy' : '<1% index-like · 4–8% active · >10% high active risk'}
        />
        {concentration && (
          <MetricTile
            title="Top Pos. Weight"
            value={`${concentration.topPositionWeight.toFixed(1)}%`}
            context={`${concentration.topPositionSymbol} · >10% concentrated · >25% single-name risk`}
            badge={concentration.topPositionWeight > 25 ? 'warn' : concentration.topPositionWeight > 10 ? 'ok' : 'good'}
          />
        )}
      </div>

      {/* Concentration + Trading summary row */}
      {concentration && trading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <MetricTile
            title="Positions"
            value={concentration.positionCount}
            context="5–15 focused · 15–30 diversified · 30+ approaches index fund"
          />
          <MetricTile
            title="HHI"
            value={concentration.hhi.toFixed(3)}
            context="<0.10 diversified · 0.10–0.25 moderate · >0.25 concentrated"
            badge={concentration.hhi < 0.10 ? 'good' : concentration.hhi < 0.25 ? 'ok' : 'bad'}
          />
          <MetricTile
            title="Cash %"
            value={`${concentration.cashPct.toFixed(1)}%`}
            context="<5% fully invested · 5–20% normal · >20% market-timing exposure"
          />
          <MetricTile
            title="Win Rate"
            value={trading.winRate !== null ? fmtPct(trading.winRate * 100, { sign: false }) : naDisplay}
            context={`${trading.totalClosed} closed trades · >50% is good with positive profit factor`}
            badge={trading.winRate !== null ? (trading.winRate >= 0.5 ? 'good' : 'ok') : null}
          />
          <MetricTile
            title="Profit Factor"
            value={trading.profitFactor !== null ? trading.profitFactor.toFixed(2) : naDisplay}
            context=">1 profitable · >1.5 strong · >2 excellent"
            badge={trading.profitFactor !== null ? (trading.profitFactor >= 1.5 ? 'good' : trading.profitFactor >= 1 ? 'ok' : 'bad') : null}
          />
        </div>
      )}

      {/* Sector bars */}
      {sectors.length > 0 && <SectorBars sectors={sectors} />}
    </section>
  )
}

function SectorBars({ sectors }: { sectors: Array<{ sector: string; weight: number; spyWeight?: number }> }) {
  const maxW = Math.max(...sectors.map((s) => s.weight), ...sectors.map((s) => s.spyWeight ?? 0))

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Sector Exposure
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sectors.slice(0, 12).map((s) => (
          <div key={s.sector}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.sector}</span>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>
                <span style={{ color: 'var(--accent)' }}>{s.weight.toFixed(1)}%</span>
                {s.spyWeight !== undefined && <span>SPY: {s.spyWeight.toFixed(1)}%</span>}
              </div>
            </div>
            <div style={{ position: 'relative', height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
              {/* SPY ghost */}
              {s.spyWeight !== undefined && (
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: `${(s.spyWeight / maxW) * 100}%`,
                  height: '100%', background: 'rgba(92,92,102,0.3)', borderRadius: 3,
                }} />
              )}
              {/* Portfolio bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: `${(s.weight / maxW) * 100}%`,
                height: '100%', background: 'var(--accent)', borderRadius: 3,
                opacity: 0.85,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
