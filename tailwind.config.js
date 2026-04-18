/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tikky: {
          pink:     '#0D9488',
          rose:     '#0F766E',
          purple:   '#0D9488',
          lavender: '#99F6E4',
          soft:     '#F0FDFA',
        }
      },
    },
  },
  plugins: [],
}

