"use client";
import { AppShell } from "@/components/AppShell";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="px-8 py-8">
        <h1 className="font-display text-2xl text-body-strong mb-2">Analytics</h1>
        <p className="text-sm text-muted">Cross-simulation performance metrics and negotiation trend analysis will appear here.</p>
      </div>
    </AppShell>
  );
}
