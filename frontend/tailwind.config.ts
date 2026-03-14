import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Trust Green - Primary Color
        primary: {
          DEFAULT: '#00b67a',
          50: '#e6f9f2',
          100: '#ccf3e5',
          200: '#99e7cb',
          300: '#66dbb1',
          400: '#33cf97',
          500: '#00b67a',
          600: '#009562',
          700: '#007049',
          800: '#004a31',
          900: '#002518',
        },
        // Secondary Dark
        secondary: {
          DEFAULT: '#191919',
          50: '#f5f5f5',
          100: '#e0e0e0',
          200: '#c2c2c2',
          300: '#a3a3a3',
          400: '#858585',
          500: '#666666',
          600: '#4d4d4d',
          700: '#333333',
          800: '#1a1a1a',
          900: '#191919',
        },
        // Background
        background: '#f7f7f7',
      },
    },
  },
  plugins: [],
};

export default config;
