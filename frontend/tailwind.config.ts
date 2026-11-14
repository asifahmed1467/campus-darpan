import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F1B3D", paper: "#EEF2F8", brand: "#0B2A6F", go: "#0F9D58", busy: "#D9480F",
        needle: "#F2B01E", violet: "#7B5EA7", line: "#D5DDEA", mute: "#5B6784", sheet: "#FFFFFF",
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
