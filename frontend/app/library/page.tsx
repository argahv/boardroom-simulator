"use client";
import { AppShell } from "@/components/AppShell";

export default function LibraryPage() {
  return (
    <AppShell>
      <div className="px-8 py-8">
        <h1 className="font-display text-2xl text-body-strong mb-2">Playbook Library</h1>
        <p className="text-sm text-muted">Saved negotiation playbooks and reusable strategy cards will appear here.</p>
      </div>
    </AppShell>
  );
}
