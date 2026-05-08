import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { usePortfolioStore } from '../store/portfolioStore'
import { fmt, fmtPct } from '../utils/money'

// Monochrome shades for donut slices
const SLICE_COLORS = [
  '#7FE7B6', '#ECECEE', '#9A9AA2', '#6B6B75', '#4A4A52',
  '#3A3A42', '#2E2E35', '#252529', '#1E1E22', '#18181C',
]

export function AllocationSection() {
  const { snapshot } = usePortfolioStore()

  const positions = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.positions]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 15)
  }, [snapshot])

  if (!snapshot || positions.length === 0) return null

  const cashPct = snapshot.totalValue > 0 ? (snapshot.cash / snapshot.totalValue) * 100 : 0
  const topPositions = positions.slice(0, 10)
  const otherWeight = positions.slice(10).reduce((s, p) => s + p.pctOfPortfolio, 0)

  const donutData = [
    ...topPositions.map((p, i) => ({
      name: p.symbol,
      value: Math.round(p.pctOfPortfolio * 10) / 10,
      itemStyle: { color: SLICE_COLORS[i] },
    })),
    ...(otherWeight > 0.1 ? [{ name: 'Other', value: Math.round(otherWeight * 10) / 10, itemStyle: { color: '#141416' } }] : []),
    ...(cashPct > 0.1 ? [{ name: 'Cash', value: Math.round(cashPct * 10) / 10, itemStyle: { color: '#1A1A1E' } }] : []),
  ]

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#17171A',
      borderColor: '#1F1F23',
      textStyle: { color: '#ECECEE', fontSize: 12 },
      formatter: (params: any) => {
        const pos = snapshot.positions.find((p) => p.symbol === params.name)
        const val = pos ? fmt(pos.marketValue) : ''
        return `<strong>${params.name}</strong><br/>${params.value}%${val ? ` · ${val}` : ''}`
      },
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['60%', '85%'],
        center: ['50%', '50%'],
        data: donutData,
        label: { show: false },
        emphasis: {
          itemStyle: { color: '#7FE7B6' },
          label: { show: false },
        },
        padAngle: 2,
      },
    ],
  }

  return (
    <section style={{ padding: '0 32px 32px 8px' }}>
      <span className="section-title" style={{ display: 'block', marginBottom: 16 }}>Allocation</span>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0,
        overflow: 'hidden',
      }}>
        {/* Donut */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ReactECharts option={option} style={{ height: 200, width: 200 }} />
        </div>

        {/* Legend list */}
        <div style={{ padding: 20, overflowY: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Symbol', 'Value', 'Unreal P&L', 'Wt'].map((h) => (
                  <th key={h} style={{ fontSize: 11, color: 'var(--text-3)', textAlign: h === 'Symbol' ? 'left' : 'right', padding: '0 8px 8px', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPositions.map((p, i) => (
                <tr key={p.symbol} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: SLICE_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{p.symbol}</span>
                    {p.isDelisted && <span style={{ fontSize: 10, color: 'var(--warn)', fontStyle: 'italic' }}>delisted</span>}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontFeatureSettings: '"tnum"' }}>
                    {fmt(p.marketValue)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, fontFeatureSettings: '"tnum"', color: p.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {fmtPct(p.unrealizedPnlPct)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>
                    {p.pctOfPortfolio.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {cashPct > 0.1 && (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', fontSize: 13, color: 'var(--text-2)' }}>Cash</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontFeatureSettings: '"tnum"' }}>{fmt(snapshot.cash)}</td>
                  <td />
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)', fontFeatureSettings: '"tnum"' }}>{cashPct.toFixed(1)}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
