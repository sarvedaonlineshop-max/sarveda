import type { Config } from "tailwindcss";

import { shadows, tailwindColors } from "./lib/design-tokens";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-nunito)", "sans-serif"],
        serif: ["var(--font-cormorant)", "serif"]
      },
      colors: tailwindColors,
      animation: {
        "fade-up": "fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fadeIn 0.4s ease-out both",
        "slide-in": "slideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 2.5s linear infinite",
        pulse_slow: "pulse 3s ease-in-out infinite",
        marquee: "marquee 28s linear infinite"
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" }
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" }
        }
      },
      boxShadow: {
        card: shadows.card,
        "card-hover": shadows.cardHover,
        gold: shadows.gold,
        "gold-lg": shadows.gold,
        violet: shadows.violet,
        "violet-sm": "0 2px 8px rgba(91,62,155,0.20)",
        "violet-lg": shadows.violetLg,
        header: shadows.header
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, #C8A460 0%, #E8C870 50%, #C8A460 100%)",
        "violet-gradient":
          "linear-gradient(160deg, #22134A 0%, #3A2070 60%, #5B3E9B 100%)",
        "violet-pale-gradient":
          "linear-gradient(180deg, #F7F4FF 0%, #EDE8FB 100%)"
      }
    }
  },
  plugins: []
};

export default config;
