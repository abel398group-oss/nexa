/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sidebar — carvão midnight (alinhado ao HiperTMS design system v2)
        sidebar: {
          DEFAULT:      '#16181d',
          subtle:       '#0e0f13',
          hover:        'rgba(255,255,255,0.07)',
          active:       'rgba(255,255,255,0.13)',
          border:       'rgba(255,255,255,0.09)',
          text:         'rgba(255,255,255,0.56)',
          'text-hover': 'rgba(255,255,255,0.93)',
          'text-active':'#f4f4f8',
          accent:       '#ff7a47',   // laranja ativo (igual ao TMS)
        },
        // Brand — Laranja Ignição (HiperTMS design system v2 — referência TMS)
        brand: {
          50:  '#fff3ed',
          100: '#ffe2d1',
          200: '#ffd0b3',
          300: '#ffb089',
          400: '#ff8a5c',
          500: '#ff5a1f',   // primário — igual ao TMS
          600: '#ed4708',
          700: '#c23a0a',
          800: '#9a2e08',
          900: '#7a2406',
        },
        // Base — superfícies e conteúdo (light)
        base: {
          100: '#fafaf9',
          200: '#f2f2f0',
          300: '#e6e6e3',
          content: '#16181d',
        },
        // zinc — aliases (compatibilidade)
        zinc: {
          50:  '#f4f4f5',
          100: '#e4e4e7',
          200: '#d4d4d8',
          300: '#a1a1aa',
          400: '#71717a',
          500: '#52525b',
          600: '#3f3f46',
          700: '#27272a',
          800: '#18181b',
          900: '#09090b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        // Tokens de sombra alinhados ao TMS design system
        'card':         '0 2px 8px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'card-hover':   '0 10px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
        'elevated':     '0 10px 40px -10px rgb(0 0 0 / 0.15), 0 4px 12px -4px rgb(0 0 0 / 0.08)',
        'inner-soft':   'inset 0 2px 4px 0 rgb(0 0 0 / 0.04)',
        'up':           '0 -2px 10px rgb(0 0 0 / 0.06)',
        'glow-brand':   '0 0 26px -4px rgb(255 90 31 / 0.30)',
      },
    },
  },
  plugins: [],
};
