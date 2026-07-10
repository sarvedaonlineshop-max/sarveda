import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"]
      },
      colors: {
        brand: {
          night:       "#10201a",
          forest:      "#1c352a",
          sage:        "#48705a",
          "sage-light":"#6f997f",
          gold:        "#b98a3e",
          "gold-mid":  "#cfa45c",
          "gold-pale": "#e9d6ae",
          cream:       "#faf5ec",
          "cream-dark":"#efe6d6",
          ivory:       "#fffdf7",
          terra:       "#b4552d",
          "terra-dark":"#8a3f20",
          ink:         "#26251f",
          muted:       "#7d7263",
          "muted-lt":  "#aca18e",
        }
      },
      animation: {
        "fade-up":   "fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in":   "fadeIn 0.4s ease-out both",
        "slide-in":  "slideIn 0.4s cubic-bezier(0.22,1,0.36,1) both",
        shimmer:     "shimmer 2.5s linear infinite",
        pulse_slow:  "pulse 3s ease-in-out infinite",
        marquee:     "marquee 28s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity:"0", transform:"translateY(20px)" },
          "100%": { opacity:"1", transform:"translateY(0)"    }
        },
        fadeIn: {
          "0%":   { opacity:"0" },
          "100%": { opacity:"1" }
        },
        slideIn: {
          "0%":   { opacity:"0", transform:"translateX(-12px)" },
          "100%": { opacity:"1", transform:"translateX(0)"     }
        },
        shimmer: {
          "0%":   { backgroundPosition:"-200% center" },
          "100%": { backgroundPosition:" 200% center" }
        },
        marquee: {
          "0%":   { transform:"translateX(0%)"    },
          "100%": { transform:"translateX(-50%)"  }
        }
      },
      boxShadow: {
        card:       "0 2px 10px rgba(28,53,42,0.07), 0 1px 2px rgba(28,53,42,0.04)",
        "card-hover":"0 10px 32px rgba(28,53,42,0.13), 0 2px 8px rgba(28,53,42,0.06)",
        gold:       "0 4px 18px rgba(185,138,62,0.30)",
        "gold-lg":  "0 8px 28px rgba(185,138,62,0.38)",
        terra:      "0 4px 14px rgba(180,85,45,0.28)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg,#b98a3e 0%,#e9d6ae 50%,#b98a3e 100%)",
        "forest-gradient":"linear-gradient(160deg,#10201a 0%,#1c352a 100%)",
        "cream-gradient": "linear-gradient(180deg,#faf5ec 0%,#efe6d6 100%)",
      }
    }
  },
  plugins: []
};

export default config;
