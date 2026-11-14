import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)", paper: "rgb(var(--c-paper) / <alpha-value>)", brand: "rgb(var(--c-brand) / <alpha-value>)",
        go: "rgb(var(--c-go) / <alpha-value>)", busy: "rgb(var(--c-busy) / <alpha-value>)", needle: "rgb(var(--c-needle) / <alpha-value>)",
        violet: "rgb(var(--c-violet) / <alpha-value>)", line: "rgb(var(--c-line) / <alpha-value>)", mute: "rgb(var(--c-mute) / <alpha-value>)",
        sheet: "rgb(var(--c-sheet) / <alpha-value>)", inverse: "rgb(var(--c-inverse) / <alpha-value>)", edge: "rgb(var(--c-edge) / <alpha-value>)",
        track: "rgb(var(--c-track) / <alpha-value>)", warn: "rgb(var(--c-warn) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Bricolage Grotesque Variable", "Hind Siliguri", "system-ui", "sans-serif"],
        body: ["Hind Siliguri", "system-ui", "sans-serif"],
        bn: ["Hind Siliguri", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
