/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        momentum: {
          red: '#FF2D3D',
          ink: '#080808',
          panel: '#111113',
          white: '#F7F7F7',
        },
      },
    },
  },
  plugins: [],
}

