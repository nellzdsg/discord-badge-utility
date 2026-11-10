import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#1a1b1e",
          900: "#232428",
          850: "#2b2d31",
          800: "#313338",
          750: "#383a40",
          700: "#43454b",
        },
        brand: {
          DEFAULT: "#5865f2",
          hover: "#4752c4",
        },
        ok: "#3ba55d",
        warn: "#faa61a",
        danger: "#ed4245",
      },
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
