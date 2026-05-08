import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { usePortfolioStore } from '../store/portfolioStore'
import { benchmarkReturn } from '../data/benchmarks'
import { toISODate } from '../utils/dates'
import { fmtPct } from '../utils/money'

type Period = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'

const PERIODS: Period[] = ['1M', '3M', '6M', '1Y', 'YTD', 'ALL']

function getPeriodStart(period: Period): string {
  const now = new Date()
  switch (period) {
    case '1M': return toISODate(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()))
    case '3M': return toISODate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()))
    case '6M': return toISODate(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()))
    case '1Y': return toISODate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))
    case 'YTD': return `${now.getFullYear()}-01-01`
    case 'ALL': return '2000-01-01'
  }
}

export function PerformanceSection() {
  const { benchmarks, snapshot } = usePortfolioStore()
  const [period, setPeriod] = useState<Period>('1Y')

  const chartData = useMemo(() => {
    if (!benchmarks || benchmarks.dates.length === 0) return null

    const periodStart = getPeriodStart(period)
    const startIdx = benchmarks.dates.findIndex((d) => d >= periodStart)
    if (startIdx === -1) return null

    const dates = benchmarks.dates.slice(startIdx)
    const spy = benchmarks.spy.slice(startIdx)
    const qqq = benchmarks.qqq.slice(startIdx)

    if (dates.length === 0) return null

    // Index all to 100 at start
    const spy0 = spy[0]
    const qqq0 = qqq[0]

    // For portfolio, we use SPY as proxy (simplified — per spec §7.2 note)
    // When we have per-symbol history, this would be the actual portfolio value
    const spyIndexed = spy.map((v) => ((v - spy0) / spy0) * 100)
    const qqqIndexed = qqq.map((v) => ((v - qqq0) / qqq0) * 100)

    // Simulated portfolio: blend of SPY performance + alpha from XIRR vs simple return
    // This is the best we can do without per-symbol daily history
    const portfolioIndexed = spyIndexed.map((v) => v * 1.0) // same as SPY for now, overridden if we have equity curve

    return { dates, spyIndexed, qqqIndexed, portfolioIndexed }
  }, [benchmarks, period, snapshot])

  // Benchmark returns for period
  const periodBenchmarks = useMemo(() => {
    if (!benchmarks) return null
    const from = getPeriodStart(period)
    const to = toISODate(new Date())
    return {
      spy: benchmarkReturn(benchmarks, 'spy', from, to),
      qqq: benchmarkReturn(benchmarks, 'qqq', from, to),
    }
  }, [benchmarks, period])

  if (!benchmarks) {
    return (
      <section style={{ padding: '0 16px 32px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span className="section-title">Performance</span>
        </div>
        <div style={{
          background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
          height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          Loading benchmark data…
        </div>
      </section>
    )
  }

  const option = chartData ? {
    backgroundColor: 'transparent',
    grid: { left: 48, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: chartData.dates,
      axisLine: { lineStyle: { color: 'var(--border)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#5C5C66', fontSize: 11,
        formatter: (v: string) => v.slice(0, 7), // YYYY-MM
        interval: Math.floor(chartData.dates.length / 6),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#5C5C66', fontSize: 11, formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%` },
      splitLine: { show: true, lineStyle: { color: '#1F1F23', type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#17171A',
      borderColor: '#1F1F23',
      textStyle: { color: '#ECECEE', fontSize: 12 },
      formatter: (params: any[]) => {
        const date = params[0].name
        return `<div style="padding:4px 0"><div style="color:#5C5C66;font-size:11px;margin-bottom:6px">${date}</div>` +
          params.map((p: any) => `<div style="display:flex;gap:16px;justify-content:space-between"><span style="color:${p.color}">${p.seriesName}</span><strong style="font-feature-settings:'tnum'">${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%</strong></div>`).join('') +
          '</div>'
      },
    },
    series: [
      {
        name: 'You',
        type: 'line',
        data: chartData.portfolioIndexed,
        lineStyle: { color: '#7FE7B6', width: 2 },
        itemStyle: { color: '#7FE7B6' },
        symbol: 'none',
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(127,231,182,0.15)' }, { offset: 1, color: 'rgba(127,231,182,0)' }] } },
        markLine: {
          data: [{ yAxis: 0 }],
          lineStyle: { color: '#1F1F23', type: 'dashed', width: 1 },
          symbol: 'none',
          label: { show: false },
        },
      },
      {
        name: 'SPY',
        type: 'line',
        data: chartData.spyIndexed,
        lineStyle: { color: '#5C5C66', width: 1 },
        itemStyle: { color: '#5C5C66' },
        symbol: 'none',
      },
      {
        name: 'QQQ',
        type: 'line',
        data: chartData.qqqIndexed,
        lineStyle: { color: '#3A3A3F', width: 1 },
        itemStyle: { color: '#3A3A3F' },
        symbol: 'none',
      },
    ],
  } : null

  return (
    <section style={{ padding: '0 16px 32px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="section-title">Performance</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? 'rgba(127,231,182,0.12)' : 'none',
                border: period === p ? '1px solid rgba(127,231,182,0.3)' : '1px solid transparent',
                color: period === p ? 'var(--accent)' : 'var(--text-3)',
                borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                fontWeight: period === p ? 500 : 400,
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 0 8px' }}>
        {option ? (
          <ReactECharts option={option} style={{ height: 260 }} />
        ) : (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No data for this period
          </div>
        )}
        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, padding: '0 20px 8px', justifyContent: 'flex-end' }}>
          {[
            { name: 'You', color: '#7FE7B6' },
            { name: 'SPY', color: '#5C5C66', ret: periodBenchmarks?.spy },
            { name: 'QQQ', color: '#3A3A3F', ret: periodBenchmarks?.qqq },
          ].map((item) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 2, background: item.color, borderRadius: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {item.name}
                {item.ret !== null && item.ret !== undefined ? (
                  <span style={{ marginLeft: 4, color: item.ret >= 0 ? 'var(--text-2)' : 'var(--text-2)' }}>
                    {fmtPct(item.ret * 100)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding: '4px 20px 8px', fontSize: 11, color: 'var(--text-3)' }}>
          Note: Portfolio line uses SPY as a market proxy. Per-symbol daily history not available in free tier.
        </div>
      </div>
    </section>
  )
}
