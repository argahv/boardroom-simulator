import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        ink: "var(--color-ink)",
        primary: "var(--color-primary)",
        "primary-active": "var(--color-primary-active)",
        "surface-card": "var(--color-surface-card)",
        "surface-dark": "var(--color-surface-dark)",
        muted: "var(--color-muted)",
        "accent-teal": "var(--color-accent-teal)",
        "accent-amber": "var(--color-accent-amber)"
      },
      fontFamily: {
        display: ["var(--font-display)", "Cormorant Garamond", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"]
      },
      letterSpacing: {
        display: "-0.02em"
      },
      lineHeight: {
        relaxed: "1.75",
        loose: "2"
      },
      minHeight: {
        touch: "44px"
      },
      minWidth: {
        touch: "44px"
      }
    }
  },
  plugins: []
};

export default config;
