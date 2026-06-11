/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        green: {
          50:  '#f2f8ee',
          100: '#eaf3de',
          200: '#d6e8d0',
          400: '#639922',
          600: '#3B6D11',
          800: '#27500A',
          900: '#1a2e1a',
        },
      },
    },
  },
  plugins: [],
}
