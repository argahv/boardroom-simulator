import { useRef, useCallback } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import gsap from "gsap";

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
  const ref = useRef<HTMLButtonElement>(null);

  const handlePointerDown = useCallback(() => {
    gsap.to(ref.current, { scale: 0.96, duration: 0.1, ease: "power2.out" });
  }, []);

  const handlePointerUp = useCallback(() => {
    gsap.to(ref.current, { scale: 1, duration: 0.2, ease: "back.out(1.7)" });
  }, []);

  const handlePointerLeave = useCallback(() => {
    gsap.to(ref.current, { scale: 1, duration: 0.15, ease: "power2.out" });
  }, []);

  return (
    <button
      ref={ref}
      className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors ${variants[variant]} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      {...props}
    >
      {children}
    </button>
  );
}
