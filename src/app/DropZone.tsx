import { useState, useCallback, useRef } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  active: boolean  // whether there's already data loaded
}

export function DropZone({ onFile, active }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      onFile(file)
    }
  }, [onFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  // When data is loaded, wrap the whole page — just shows the subtle ring
  if (active) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: dragOver ? 200 : -1,
          border: dragOver ? '2px solid var(--accent)' : '2px solid transparent',
          borderRadius: 0, pointerEvents: dragOver ? 'auto' : 'none',
          transition: 'border-color 0.15s',
          background: dragOver ? 'rgba(127,231,182,0.03)' : 'transparent',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      />
    )
  }

  // Empty state — centered card
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div style={{
        textAlign: 'center',
        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 16,
        padding: '64px 80px',
        maxWidth: 480,
        transition: 'border-color 0.2s, background 0.2s',
        background: dragOver ? 'rgba(127,231,182,0.03)' : 'transparent',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.6 }}>↓</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          Drop your Robinhood CSV here
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.6 }}>
          Export from Robinhood → Account → Reports &amp; Statements → Account Activity (CSV)
        </div>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
              textDecorationColor: 'rgba(127,231,182,0.4)',
              padding: 0,
            }}
          >
            or choose file
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
          Your data never leaves your browser.
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
