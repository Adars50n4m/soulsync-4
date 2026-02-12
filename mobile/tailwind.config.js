/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "primary": "#f43f5e",
        "accent": "#a855f7",
        "background-dark": "#050505",
        "danger": "#ef4444"
      },
      fontFamily: {
        "sans": ["System"]
      },
    },
    letterSpacing: {
      tighter: -0.5,
      tight: -0.25,
      normal: 0,
      wide: 0.25,
      wider: 0.5,
      widest: 1,
    }
  },
  plugins: [],
}
