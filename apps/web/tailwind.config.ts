import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", "[data-theme='dark']"],
  theme: {
    extend: {
      keyframes: {
        "bounce-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        paddle: {
          "0%, 100%": { transform: "translate(0, 0) rotate(-25deg)" },
          "50%": { transform: "translate(-4px, 8px) rotate(15deg)" },
        },
        "paddle-idle": {
          "0%, 100%": { transform: "translate(0, 0) rotate(-8deg)" },
          "50%": { transform: "translate(0, 2px) rotate(-5deg)" },
        },
      },
      animation: {
        "bounce-slow": "bounce-slow 2s ease-in-out infinite",
        paddle: "paddle 0.6s ease-in-out infinite",
        "paddle-idle": "paddle-idle 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
