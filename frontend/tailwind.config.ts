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
        "surface-dark-elevated": "var(--color-surface-dark-elevated)",
        "surface-dark-soft": "var(--color-surface-dark-soft)",
        "surface-container-low": "var(--color-surface-container-low)",
        muted: "var(--color-muted)",
        hairline: "var(--color-hairline)",
        "on-dark": "var(--color-on-dark)",
        "on-dark-soft": "var(--color-on-dark-soft)",
        "body-strong": "var(--color-body-strong)",
        secondary: "var(--color-secondary)",
        error: "var(--color-error)",
        "accent-amber": "var(--color-accent-amber)",
        "accent-teal": "var(--color-accent-teal)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Playfair Display", "Georgia", "serif"],
        "sans-tight": ["var(--font-sans-tight)", "Inter Tight", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      letterSpacing: {
        display: "-0.04em",
      },
      lineHeight: {
        relaxed: "1.75",
        loose: "2",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
