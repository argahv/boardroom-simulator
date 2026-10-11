"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./ui";

export type SheetProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** "side": a drawer from the right (full width on phones). "center": a small dialog. */
  variant?: "side" | "center";
};

/** A modal drawer: Escape or the backdrop closes it, and focus goes back where it came from. */
export function Sheet({ title, subtitle, onClose, children, footer, variant = "side" }: SheetProps) {
  const ids = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Leave focus alone if something inside (an autofocused field) already took it.
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key === "Tab" && panel) {
        const items = panel.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
        const list = Array.from(items).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const side = variant === "side";
  return (
    <div className="fixed inset-0 z-[60]">
      <div aria-hidden className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        tabIndex={-1}
        className={
          side
            ? "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-canvas shadow-2xl outline-none"
            : "absolute left-1/2 top-[8vh] flex max-h-[84vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col rounded-2xl bg-canvas shadow-2xl outline-none"
        }
      >
        <div className="flex items-start gap-3 border-b border-hairline px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id={`${ids}-title`} className="truncate font-display text-xl font-semibold tracking-display text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="border-t border-hairline px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}
