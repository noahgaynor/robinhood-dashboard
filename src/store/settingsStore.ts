import { create } from 'zustand'

const API_KEY_KEY = 'rhd:finnhubKey'
const RF_RATE_KEY = 'rhd:rfRate'

interface SettingsStore {
  finnhubKey: string
  rfRate: number   // decimal, e.g. 0.045
  showSettings: boolean

  loadSettings: () => void
  setFinnhubKey: (key: string) => void
  setRfRate: (rate: number) => void
  clearFinnhubKey: () => void
  toggleSettings: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  finnhubKey: '',
  rfRate: 0.045,
  showSettings: false,

  loadSettings: () => {
    const key = localStorage.getItem(API_KEY_KEY) ?? ''
    const rf = parseFloat(localStorage.getItem(RF_RATE_KEY) ?? '0.045')
    set({ finnhubKey: key, rfRate: isNaN(rf) ? 0.045 : rf })
  },

  setFinnhubKey: (key) => {
    try { localStorage.setItem(API_KEY_KEY, key) } catch {}
    set({ finnhubKey: key })
  },

  setRfRate: (rate) => {
    try { localStorage.setItem(RF_RATE_KEY, String(rate)) } catch {}
    set({ rfRate: rate })
  },

  clearFinnhubKey: () => {
    localStorage.removeItem(API_KEY_KEY)
    set({ finnhubKey: '' })
  },

  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
}))
