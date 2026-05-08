import React from 'react'

interface MetricTileProps {
  title: string
  value: React.ReactNode
  context: string
  badge?: 'good' | 'ok' | 'bad' | 'warn' | null
  size?: 'sm' | 'md'
  className?: string
}

export function MetricTile({ title, value, context, badge, size = 'md', className = '' }: MetricTileProps) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-4 flex flex-col gap-1 ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--surface)', borderRadius: 12 }}
    >
      <div className="section-title" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-2)', fontWeight: 500 }}>
        {title}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontSize: size === 'sm' ? '1.25rem' : '1.5rem',
          fontWeight: 600,
          color: 'var(--text)',
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {badge && (
        <BadgePill badge={badge} />
      )}
      <div className="context-line" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>
        {context}
      </div>
    </div>
  )
}

function BadgePill({ badge }: { badge: 'good' | 'ok' | 'bad' | 'warn' }) {
  const colors = {
    good: { bg: 'rgba(127,231,182,0.1)', color: 'var(--accent)' },
    ok: { bg: 'rgba(236,236,238,0.1)', color: 'var(--text-2)' },
    bad: { bg: 'rgba(248,113,113,0.1)', color: 'var(--neg)' },
    warn: { bg: 'rgba(245,194,107,0.1)', color: 'var(--warn)' },
  }
  const labels = { good: '● good', ok: '● ok', bad: '● below', warn: '● watch' }
  const c = colors[badge]
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 500,
      background: c.bg,
      color: c.color,
      alignSelf: 'flex-start',
      marginTop: 2,
    }}>
      {labels[badge]}
    </span>
  )
}
