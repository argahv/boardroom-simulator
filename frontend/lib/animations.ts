"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useCallback } from "react";

gsap.registerPlugin(useGSAP);

// ── Staggered fade-up entrance ──
export function useStaggerFade(scopeRef: React.RefObject<HTMLDivElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      gsap.from("[data-anim='fade-up']", {
        y: 16,
        opacity: 0,
        duration: 0.45,
        ease: "power2.out",
        stagger: { amount: 0.35, from: "start" },
        clearProps: "transform",
      });
    },
    { scope: scopeRef, dependencies: deps as any[], revertOnUpdate: true },
  );
}

// ── Single fade-up for a ref ──
export function useFadeUp(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      gsap.from(ref.current, {
        y: 20,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        clearProps: "transform",
      });
    },
    { scope: ref, dependencies: deps as any[], revertOnUpdate: true },
  );
}

// ── Bar fill animation (for Voltage, TrustMeter, IncentiveHeatmap, etc.) ──
export function useBarFill(
  barRef: React.RefObject<HTMLDivElement | null>,
  value: number,
  deps: unknown[] = [],
) {
  useGSAP(
    () => {
      if (!barRef.current) return;
      gsap.fromTo(
        barRef.current,
        { width: "0%" },
        {
          width: `${Math.min(100, Math.max(0, value))}%`,
          duration: 0.6,
          ease: "power3.out",
        },
      );
    },
    { scope: barRef, dependencies: [value, ...deps] as any[], revertOnUpdate: true },
  );
}

// ── Scale-tap feedback (Button, cards) ──
export function useTapScale(
  elRef: React.RefObject<HTMLElement | null>,
  scaleTo = 0.96,
) {
  const handlePointerDown = useCallback(() => {
    gsap.to(elRef.current, { scale: scaleTo, duration: 0.1, ease: "power2.out" });
  }, [elRef, scaleTo]);

  const handlePointerUp = useCallback(() => {
    gsap.to(elRef.current, { scale: 1, duration: 0.15, ease: "back.out(1.7)" });
  }, [elRef]);

  return { handlePointerDown, handlePointerUp };
}

// ── Slide-in from below (for new turns / events) ──
export function useSlideIn(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      if (!ref.current) return;
      gsap.from(ref.current, {
        y: 24,
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        clearProps: "transform",
      });
    },
    { scope: ref, dependencies: deps as any[], revertOnUpdate: true },
  );
}

// ── Number count-up ──
export function useCountUp(
  elRef: React.RefObject<HTMLElement | null>,
  target: number,
  duration = 0.8,
  deps: unknown[] = [],
) {
  useGSAP(
    () => {
      if (!elRef.current) return;
      const obj = { val: 0 };
      gsap.to(obj, {
        val: target,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          if (elRef.current) elRef.current.textContent = String(Math.round(obj.val));
        },
      });
    },
    { scope: elRef, dependencies: [target, ...deps] as any[], revertOnUpdate: true },
  );
}
