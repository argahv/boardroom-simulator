"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

// The one navigation: every page is reachable from here, under one name.
const NAV_TABS: { label: string; href: string }[] = [
  { label: "Simulations", href: "/simulate" },
  { label: "Personas", href: "/personas" },
  { label: "Analytics", href: "/analytics" },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-canvas text-ink overflow-x-hidden">
      <nav
        className="fixed top-0 left-0 right-0 h-16 z-50 bg-canvas border-b border-hairline flex items-center px-3 sm:px-6 gap-3 sm:gap-6"
        aria-label="Main navigation"
      >
        <Link href="/simulate" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-on-dark font-bold text-sm font-serif-title">V</span>
          </div>
          <span className="hidden sm:inline font-serif-title text-xl font-bold text-ink tracking-tight">
            Vantage <span className="text-primary/80" style={{ fontFamily: "var(--font-display)" }}>✦</span>
          </span>
        </Link>

        <div className="flex-1 min-w-0 flex items-center sm:justify-center gap-1 overflow-x-auto">
          {NAV_TABS.map((tab) => {
            // "New simulation" has its own button, so the Simulations tab is not lit there.
            const active = isActive(tab.href) && pathname !== "/simulate/new";
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap px-2 sm:px-5 py-2 text-sm font-medium transition-colors duration-150 ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 sm:left-4 sm:right-4 h-[2px] bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        <Link
          href="/simulate/new"
          aria-current={pathname === "/simulate/new" ? "page" : undefined}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-active px-3 py-2 text-sm font-medium text-on-dark transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
          <span className="hidden sm:inline">New simulation</span>
        </Link>
      </nav>

      <main className="min-h-screen pt-16">{children}</main>
    </div>
  );
}
