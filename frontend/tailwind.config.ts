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
        "primary-soft": "var(--color-primary-soft)",
        "surface-card": "var(--color-surface-card)",
        "surface-card-elevated": "var(--color-surface-card-elevated)",
        "surface-dark": "var(--color-surface-dark)",
        "surface-dark-elevated": "var(--color-surface-dark-elevated)",
        "surface-dark-soft": "var(--color-surface-dark-soft)",
        "surface-container-low": "var(--color-surface-container-low)",
        "surface-container-high": "var(--color-surface-container-high)",
        muted: "var(--color-muted)",
        hairline: "var(--color-hairline)",
        "on-dark": "var(--color-on-dark)",
        "on-dark-soft": "var(--color-on-dark-soft)",
        "body-strong": "var(--color-body-strong)",
        secondary: "var(--color-secondary)",
        error: "var(--color-error)",
        "error-soft": "var(--color-error-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
        "accent-amber": "var(--color-accent-amber)",
        "accent-teal": "var(--color-accent-teal)",
        "accent-blue": "var(--color-accent-blue)",
        "chart-1": "var(--color-chart-1)",
        "chart-2": "var(--color-chart-2)",
        "chart-3": "var(--color-chart-3)",
        "chart-4": "var(--color-chart-4)",
        "chart-5": "var(--color-chart-5)",
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
