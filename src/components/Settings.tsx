import { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { usePortfolioStore } from '../store/portfolioStore'

export function SettingsPanel() {
  const { finnhubKey, rfRate, setFinnhubKey, setRfRate, clearFinnhubKey, toggleSettings } = useSettingsStore()
  const clearAll = usePortfolioStore((s) => s.clearAll)
  const [keyInput, setKeyInput] = useState(finnhubKey)
  const [rfInput, setRfInput] = useState(String((rfRate * 100).toFixed(2)))
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      padding: '64px 32px 0 0',
    }} onClick={toggleSettings}>
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Settings</span>
          <button onClick={toggleSettings} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
            Finnhub API Key
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter your free API key"
              style={{
                flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => setFinnhubKey(keyInput.trim())}
              style={{
                background: 'var(--accent)', color: '#0A0A0B', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >Save</button>
          </div>
          {finnhubKey && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--pos)' }}>✓ API key set</span>
              <button onClick={clearFinnhubKey} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>
                Forget key
              </button>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>
            Get a free key at <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>finnhub.io</a>. Stored locally in your browser only.
          </p>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
            Risk-Free Rate (%)
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              value={rfInput}
              onChange={(e) => setRfInput(e.target.value)}
              min="0" max="20" step="0.1"
              style={{
                width: 80, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => {
                const r = parseFloat(rfInput)
                if (!isNaN(r)) setRfRate(r / 100)
              }}
              style={{
                background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >Apply</button>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Default: 4.5%</span>
          </div>
        </fieldset>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                background: 'none', border: '1px solid var(--neg)', color: 'var(--neg)',
                borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', width: '100%',
              }}
            >
              Clear all data
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { clearAll(); toggleSettings() }}
                style={{
                  flex: 1, background: 'var(--neg)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                }}
              >Confirm clear</button>
              <button
                onClick={() => setConfirmClear(false)}
                style={{
                  flex: 1, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer',
                }}
              >Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
