/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',
  content: ['./packages/frontend/index.html', './packages/frontend/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {},
  },
  plugins: [],
};
