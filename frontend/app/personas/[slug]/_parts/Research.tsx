"use client";

import { useEffect, useState } from "react";
import { ExpandableText } from "@/components/ExpandableText";
import {
  fetchPersonaResearch,
  fetchPersonaResearchConfig,
  fetchPersonaResearchStatus,
  triggerPersonaResearch,
  type PersonaResearchEntry,
} from "@/lib/api";
import { errorText } from "../../_lib/files";

type Source = { title?: string; url?: string; content?: string };

function sourcesOf(entry: PersonaResearchEntry): Source[] {
  try {
    const parsed: unknown = JSON.parse(entry.results);
    return Array.isArray(parsed) ? (parsed as Source[]) : [];
  } catch {
    return [];
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Web research; renders nothing unless the backend has a Tavily key. */
export function Research({ personaId, who }: { personaId: string; who: string }) {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<PersonaResearchEntry[]>([]);
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchPersonaResearchConfig(personaId)
      .then(async (cfg) => {
        if (!alive || !cfg.tavily_configured) return;
        setEnabled(true);
        const h = await fetchPersonaResearch(personaId);
        if (alive) setHistory(h);
      })
      .catch(() => {
        // Without the config there is nothing to show; research is optional.
      });
    return () => { alive = false; };
  }, [personaId]);

  if (!enabled) return null;

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      await triggerPersonaResearch(personaId, topic.trim() || undefined);
      setTopic("");
      // The search runs in the background; poll briefly rather than leave the person guessing.
      for (let i = 0; i < 15; i++) {
        await wait(2000);
        const status = await fetchPersonaResearchStatus(personaId);
        if (status.status !== "running") break;
      }
      setHistory(await fetchPersonaResearch(personaId));
    } catch (err) {
      setError(errorText(err, "The web search failed. Try again."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="research-title">
      <h2 id="research-title" className="mb-3 font-display text-2xl font-semibold tracking-display">Look it up</h2>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <input
            type="search"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            disabled={running}
            placeholder={`Search the web for what ${who} would read, e.g. "EU AI Act"`}
            aria-label="Web research topic"
            className="w-full rounded-full border border-hairline bg-surface-card px-4 py-2.5 text-ink outline-none transition placeholder:text-muted/70 focus:border-primary disabled:opacity-60"
          />
        </div>
        <div className="text-sm font-semibold">
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-ink px-4 text-on-dark transition hover:bg-surface-dark disabled:opacity-50"
          >
            {running ? "Searching..." : "Search"}
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-xs text-muted">Leave it empty to research {who}&apos;s role. Results feed {who}&apos;s knowledge.</p>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
      {history.length > 0 && (
        <ul className="mt-3 space-y-2">
          {history.map((entry) => {
            const sources = sourcesOf(entry);
            return (
              <li key={entry.id}>
                <details className="group rounded-xl border border-hairline bg-surface-card">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="material-symbols-outlined text-[16px] text-muted transition-transform group-open:rotate-90">chevron_right</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{entry.query}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {sources.length ? `${sources.length} sources` : "no results yet"}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-hairline px-3 py-2">
                    {sources.length === 0 && <p className="text-xs text-muted">Still running, or nothing was found.</p>}
                    {sources.map((s, i) => (
                      <div key={i} className="min-w-0 text-sm">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-active hover:underline">
                            {s.title || s.url}
                          </a>
                        ) : (
                          <span className="font-semibold">{s.title || `Source ${i + 1}`}</span>
                        )}
                        {s.content && <p className="mt-0.5 text-xs leading-relaxed text-muted"><ExpandableText text={s.content} limit={180} /></p>}
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
