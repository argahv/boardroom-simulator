"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/Button";

type NavItem = { label: string; href: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Simulations", href: "/simulate" },
  { label: "Personas", href: "/personas" },
];

const TABS = ["War Room", "Personas", "Frameworks"];

type AppShellProps = {
  children: ReactNode;
  activeTab?: string;
};

export function AppShell({ children, activeTab = "War Room" }: AppShellProps) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen p-4 text-ink md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]">
        {/* Sidebar */}
        <aside className="rounded-[2rem] bg-surface-dark p-6 text-canvas shadow-2xl">
          <Link href="/" className="block">
            <p className="text-xs uppercase tracking-[0.28em] text-canvas/50">Vantage</p>
            <h1 className="mt-3 font-display text-4xl font-normal tracking-display">Boardroom</h1>
          </Link>

          <nav className="mt-10 space-y-1">
            {NAV_ITEMS.map(({ label, href }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={label}
                  href={href}
                  className={`block rounded-2xl px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? "bg-canvas/10 text-white"
                      : "text-canvas/55 hover:bg-canvas/5 hover:text-canvas/80"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <Link href="/simulate/new" className="mt-8 block">
            <Button className="w-full">+ New Simulation</Button>
          </Link>
        </aside>

        {/* Main panel */}
        <section className="rounded-[2rem] border border-ink/10 bg-canvas/70 p-5 shadow-xl backdrop-blur md:p-8">
          <div className="mb-8 flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <span
                key={tab}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  tab === activeTab
                    ? "bg-ink text-canvas"
                    : "bg-surface-card text-muted"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
