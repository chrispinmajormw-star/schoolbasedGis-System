export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { DEFAULT: '#0f0f10', soft: '#1c1c1f', line: '#2a2a2e' },
        accent: { DEFAULT: '#FFD02B', soft: '#FFF6D1', dark: '#C99A00' },
        canvas: '#EEF0F3',
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
};
