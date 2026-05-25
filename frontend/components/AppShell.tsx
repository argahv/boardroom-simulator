"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

type AppShellProps = {
  children: ReactNode;
  activeTab?: string;
  hideTopNav?: boolean;
};

const NAV_TABS: { label: string; href: string }[] = [
  { label: "War Room", href: "/simulate" },
  { label: "Personas", href: "/personas" },
  { label: "Frameworks", href: "/frameworks" },
];

type SideNavItem = {
  label: string;
  href: string;
  icon: string;
};

const SIDE_NAV: SideNavItem[] = [
  { label: "War Room", href: "/simulate", icon: "play_circle" },
  { label: "Personas", href: "/personas", icon: "group" },
  { label: "Templates", href: "/frameworks", icon: "library_books" },
  { label: "Analytics", href: "/analytics", icon: "bar_chart" },
];

export function AppShell({ children, activeTab = "War Room", hideTopNav = false }: AppShellProps) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // Track active nav index for sidebar indicator animation
  const activeSideIdx = SIDE_NAV.findIndex(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  // Animate sidebar active indicator pill
  useGSAP(
    () => {
      const indicator = sidebarRef.current?.querySelector("[data-indicator]") as HTMLElement | null;
      const activeItem = sidebarRef.current?.querySelector(
        `[data-nav-item="${activeSideIdx}"]`,
      ) as HTMLElement | null;
      if (!indicator || !activeItem) return;
      gsap.to(indicator, {
        y: activeItem.offsetTop - (sidebarRef.current?.querySelector("nav")?.offsetTop ?? 0),
        duration: 0.35,
        ease: "power2.out",
      });
    },
    { scope: sidebarRef, dependencies: [activeSideIdx], revertOnUpdate: true },
  );

  // Stagger entrance for sidebar nav items
  useGSAP(
    () => {
      gsap.from("[data-anim='nav-item']", {
        x: -12,
        opacity: 0,
        duration: 0.35,
        stagger: { amount: 0.3, from: "start" },
        clearProps: "transform",
      });
    },
    { scope: sidebarRef },
  );

  // Tab underline slide animation
  useGSAP(
    () => {
      const activeTabEl = navRef.current?.querySelector("[data-tab-active='true']") as HTMLElement | null;
      const underline = navRef.current?.querySelector("[data-tab-underline]") as HTMLElement | null;
      if (!activeTabEl || !underline) return;
      gsap.to(underline, {
        x: activeTabEl.offsetLeft,
        width: activeTabEl.offsetWidth - 32,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { scope: navRef, dependencies: [pathname], revertOnUpdate: true },
  );

  // Sidebar entrance slide
  useGSAP(
    () => {
      gsap.from(sidebarRef.current, {
        x: -20,
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        delay: 0.05,
        clearProps: "transform",
      });
    },
    { scope: sidebarRef },
  );

  return (
    <div ref={shellRef} className="min-h-screen bg-canvas text-ink overflow-x-hidden">
      {!hideTopNav && (
      <nav
        className="fixed top-0 left-0 right-0 h-16 z-50 bg-canvas border-b border-hairline flex items-center px-6 gap-6"
        aria-label="Top navigation"
      >
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-on-dark font-bold text-sm font-serif-title">V</span>
          </div>
          <span className="font-serif-title text-xl font-bold text-ink tracking-tight">
            Vantage <span className="text-primary/80" style={{ fontFamily: "var(--font-display)" }}>✦</span>
          </span>
        </Link>

        <div ref={navRef} className="flex-1 flex items-center justify-center gap-1 relative" role="tablist">
          {NAV_TABS.map((tab) => {
            const isActive = tab.label === activeTab || (tab.label === "War Room" && pathname.startsWith("/simulate"));
            return (
              <Link
                key={tab.label}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                data-tab-active={isActive}
                className={`relative px-5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          {/* Animated underline indicator */}
          <span
            data-tab-underline
            className="absolute bottom-0 h-[2px] bg-primary rounded-full pointer-events-none"
            style={{ left: 16 }}
          />
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
      )}

      <aside
        ref={sidebarRef}
        className={`fixed top-0 left-0 w-64 h-full z-40 bg-canvas border-r border-hairline flex flex-col pb-6 hidden lg:flex ${hideTopNav ? "pt-6" : "pt-20"}`}
        aria-label="Side navigation"
      >
        <div className="px-5 mb-6">
          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-body-strong">Strategic Engine</p>
          <p className="text-[10px] font-mono text-muted mt-0.5 tracking-wider">Version 4.2 Active</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 relative">
          {/* Animated indicator pill */}
          <span
            data-indicator
            className="absolute left-3 w-[calc(100%-24px)] h-[42px] bg-surface-container-low rounded-lg pointer-events-none"
            style={{ top: 0 }}
          />
          {SIDE_NAV.map(({ label, href, icon }, idx) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={label}
                href={href}
                data-nav-item={idx}
                data-anim="nav-item"
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "text-primary font-medium"
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

      <main className={`lg:ml-64 min-h-screen ${hideTopNav ? "pt-0" : "pt-16"}`}>
        {children}
      </main>
    </div>
  );
}
