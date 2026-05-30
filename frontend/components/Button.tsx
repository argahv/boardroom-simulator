import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "dark";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-active active:scale-[0.97] transition-all duration-150",
  ghost: "border border-hairline bg-surface-card/50 text-ink hover:bg-surface-card active:scale-[0.97] transition-all duration-150",
  dark: "bg-surface-dark text-canvas hover:bg-ink active:scale-[0.97] transition-all duration-150"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-full px-5 py-3 text-sm font-semibold cursor-pointer ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
