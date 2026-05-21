import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "dark";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-[0_16px_30px_rgba(204,120,92,0.28)] hover:bg-primary-active",
  ghost: "border border-ink/10 bg-white/35 text-ink hover:bg-white/60",
  dark: "bg-surface-dark text-canvas hover:bg-ink"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-full px-5 py-3 text-sm font-semibold transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
