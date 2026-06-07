/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // identidade HiperTMS
        sidebar: {
          DEFAULT: '#2a2738', // midnight enterprise (carvão c/ matiz violeta)
          subtle: '#1a1827',
          accent: '#6ec1ff', // acento azul (item ativo/ícones)
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        base: {
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          content: '#18181b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
