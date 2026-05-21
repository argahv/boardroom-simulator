"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  activeTab?: string;
};

const NAV_TABS = ["War Room", "Personas", "Frameworks"];

type SideNavItem = {
  label: string;
  href: string;
  icon: string;
};

const SIDE_NAV: SideNavItem[] = [
  { label: "Simulation", href: "/simulate", icon: "play_circle" },
  { label: "Stakeholders", href: "/personas", icon: "group" },
  { label: "Library", href: "/library", icon: "library_books" },
  { label: "Analytics", href: "/analytics", icon: "bar_chart" },
];

export function AppShell({ children, activeTab = "War Room" }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-canvas text-ink overflow-x-hidden">
      <nav
        className="fixed top-0 left-0 right-0 h-16 z-50 bg-canvas border-b border-hairline flex items-center px-6 gap-6"
        aria-label="Top navigation"
      >
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-on-dark font-bold text-sm font-serif-title">V</span>
          </div>
          <span className="font-serif-title text-xl font-bold text-ink tracking-tight">
            Vantage <span className="text-primary">✦</span>
          </span>
        </Link>

        <div className="flex-1 flex items-center justify-center gap-1" role="tablist">
          {NAV_TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                className={`relative px-5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-card transition-colors"
            aria-label="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-card transition-colors"
            aria-label="Settings"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          <div
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
            aria-label="User account"
          >
            <span className="text-on-dark text-xs font-bold">U</span>
          </div>
        </div>
      </nav>

      <aside
        className="fixed top-0 left-0 w-64 h-full z-40 bg-canvas border-r border-hairline flex flex-col pt-20 pb-6 hidden lg:flex"
        aria-label="Side navigation"
      >
        <div className="px-5 mb-6">
          <p className="text-xs font-semibold text-body-strong">Strategic Engine</p>
          <p className="text-[11px] text-muted mt-0.5">Version 4.2 Active</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {SIDE_NAV.map(({ label, href, icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-surface-container-low text-primary font-medium"
                    : "text-muted hover:text-ink hover:bg-surface-card"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${isActive ? "text-primary" : "text-muted"}`}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                {label}
                {isActive && (
                  <span className="ml-auto w-1 h-4 bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 mt-4">
          <Link href="/simulate/new" className="block">
            <button className="w-full bg-primary hover:bg-primary-active text-on-dark text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
              New Simulation
            </button>
          </Link>
        </div>

        <div className="px-3 mt-4 pt-4 border-t border-hairline flex gap-1">
          <Link
            href="/support"
            className="flex-1 text-center text-[11px] text-muted hover:text-ink py-1.5 rounded transition-colors"
          >
            Support
          </Link>
          <Link
            href="/account"
            className="flex-1 text-center text-[11px] text-muted hover:text-ink py-1.5 rounded transition-colors"
          >
            Account
          </Link>
        </div>
      </aside>

      <main className="lg:ml-64 pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}
