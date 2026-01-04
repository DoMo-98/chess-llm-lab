/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        chess: {
          bg: '#262421',
          board: '#161512',
          ui: '#2e2b28',
          accent: '#4b4844',
          text: '#c0c0c0',
          white: '#e0e0e0',
          highlight: '#363431'
        }
      }
    },
  },
  plugins: [],
}
