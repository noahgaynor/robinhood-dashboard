import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0B',
        surface: '#111113',
        'surface-2': '#17171A',
        border: '#1F1F23',
        text: '#ECECEE',
        'text-2': '#9A9AA2',
        'text-3': '#5C5C66',
        accent: '#7FE7B6',
        pos: '#4ADE80',
        neg: '#F87171',
        warn: '#F5C26B',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['3rem', { lineHeight: '3.5rem', fontWeight: '600' }],
        h1: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '500' }],
        h2: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '500' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        small: ['0.75rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      spacing: {
        page: '2rem',
        section: '3rem',
      },
    },
  },
  plugins: [],
} satisfies Config
