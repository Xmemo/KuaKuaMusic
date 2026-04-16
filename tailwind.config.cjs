/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx,css}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
