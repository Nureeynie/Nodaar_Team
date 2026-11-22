/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#fff7ed', 100:'#ffedd5', 200:'#fed7aa', 500:'#FE8A03', 600:'#E67700', 700:'#c2410c' },
        navy: { 800:'#0a2140', 900:'#07192F', 950:'#030c17' }
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] }
    }
  }
}
