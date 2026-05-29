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
        serif: ["var(--font-playfair)", "ui-serif", "Georgia", "serif"]
      },
      colors: {
        brand: {
          night:       "#0f1a14",
          forest:      "#1e3a2f",
          sage:        "#4a7c59",
          "sage-light":"#6aaa7e",
          gold:        "#c8960a",
          "gold-mid":  "#e8b012",
          "gold-pale": "#f5d88a",
          cream:       "#fdf6ed",
          "cream-dark":"#f0e6d6",
          ivory:       "#fffbf5",
          terra:       "#b85c38",
          "terra-dark":"#8f4226",
          ink:         "#2c2420",
          muted:       "#8a7060",
          "muted-lt":  "#b8a898",
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
        card:       "0 2px 10px rgba(44,36,32,0.07), 0 1px 2px rgba(44,36,32,0.04)",
        "card-hover":"0 10px 32px rgba(44,36,32,0.13), 0 2px 8px rgba(44,36,32,0.06)",
        gold:       "0 4px 18px rgba(200,150,10,0.30)",
        "gold-lg":  "0 8px 28px rgba(200,150,10,0.38)",
        terra:      "0 4px 14px rgba(184,92,56,0.28)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg,#c8960a 0%,#f5d88a 50%,#c8960a 100%)",
        "forest-gradient":"linear-gradient(160deg,#0f1a14 0%,#1e3a2f 100%)",
        "cream-gradient": "linear-gradient(180deg,#fdf6ed 0%,#f0e6d6 100%)",
      }
    }
  },
  plugins: []
};

export default config;
