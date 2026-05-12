/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'red-bingo': '#e02020',
        'red-bg': '#ffeaea',
        'green-bingo': '#1aab5a',
        'green-bg': '#e6fff2',
        'blue-glow': '#2979ff',
        'gold': '#FFCC00',
        'dark': '#1a1a2e',
        'dark-mid': '#16213e',
        'dark-deep': '#0f3460',
      },
      fontFamily: {
        title: ['"Black Han Sans"', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      animation: {
        'bingo-pulse': 'bingo-pulse 1s infinite',
        'full-bingo': 'full-bingo 1.2s infinite',
      },
      keyframes: {
        'bingo-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px #2979ff' },
          '50%': { boxShadow: '0 0 20px #2979ff, 0 0 40px #2979ff' },
        },
        'full-bingo': {
          '0%, 100%': { boxShadow: '0 0 8px #2979ff' },
          '50%': { boxShadow: '0 0 20px #FFCC00, 0 0 40px #FFCC00' },
        },
      },
    },
  },
  plugins: [],
}
