"use client";

import type { SimulationListItem, TemplateListItem } from "@/lib/api";
import { voltageWord } from "./model";
import { Icon, LABEL, Spinner } from "./ui";

export type ResumeInfo = { name: string; people: number; at: number };

export type StartFromProps = {
  templates: TemplateListItem[] | null;
  recent: SimulationListItem[] | null;
  resume: ResumeInfo | null;
  /** Which card is launching or loading, e.g. "t:series-b" or "r:<simId>". */
  busyKey: string | null;
  onLoadTemplate: (t: TemplateListItem) => void;
  onPlayTemplate: (t: TemplateListItem) => void;
  onLoadRecent: (s: SimulationListItem) => void;
  onPlayRecent: (s: SimulationListItem) => void;
  onResume: () => void;
  onBlank: () => void;
};

const ago = (iso?: string | number) => {
  if (!iso) return "";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

function Card({
  label,
  eyebrow,
  title,
  body,
  meta,
  busy,
  disabled,
  onLoad,
  onPlay,
}: {
  label: string;
  eyebrow: string;
  title: string;
  body?: string;
  meta: string;
  busy: boolean;
  disabled: boolean;
  onLoad: () => void;
  onPlay?: () => void;
}) {
  return (
    <li className="group relative flex min-w-0 flex-col rounded-xl border border-hairline bg-surface-card p-3.5 transition hover:border-primary/40 hover:shadow-sm">
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled}
        aria-label={label}
        className="absolute inset-0 cursor-pointer rounded-xl"
      />
      <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <p className="mt-1 line-clamp-1 text-sm font-semibold text-ink">{title}</p>
      {body && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{body}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 text-[11px] text-muted">
        <span className="min-w-0 truncate">{meta}</span>
        {onPlay && (
          <span className="relative z-10 shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={onPlay}
              disabled={disabled}
              title="Start this meeting now, as it is"
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-hairline bg-canvas/60 px-2.5 text-ink transition hover:border-primary hover:text-primary"
            >
              {busy ? <Spinner className="h-3 w-3" /> : <Icon name="play_arrow" className="text-[16px]" />}
              Play now
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

export function StartFrom(props: StartFromProps) {
  const { templates, recent, resume, busyKey } = props;
  const locked = busyKey !== null;
  return (
    <section aria-labelledby="start-from" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="start-from" className={LABEL}>Or start from</h2>
        <div className="text-sm font-semibold">
          <button
            type="button"
            onClick={props.onBlank}
            disabled={locked}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-2 text-muted underline-offset-4 transition hover:text-ink hover:underline"
          >
            Start blank <Icon name="arrow_forward" className="text-[16px]" />
          </button>
        </div>
      </div>

      {(resume || (recent && recent.length > 0)) && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted">Your recent setups</h3>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {resume && (
              <Card
                label={`Pick up your unsaved draft: ${resume.name || "Untitled"}`}
                eyebrow="Unsaved draft"
                title={resume.name || "Untitled meeting"}
                meta={`${resume.people} ${resume.people === 1 ? "person" : "people"} · ${ago(resume.at)}`}
                busy={false}
                disabled={locked}
                onLoad={props.onResume}
              />
            )}
            {(recent ?? []).map((s) => (
              <Card
                key={s.simulation_id}
                label={`Load ${s.subject?.name || "this setup"} into the room`}
                eyebrow={ago(s.created_at) || "Earlier"}
                title={s.subject?.name || "Untitled meeting"}
                body={s.subject?.description}
                meta={`${s.stakeholder_count} people · ${voltageWord(s.voltage)}`}
                busy={busyKey === `r:${s.simulation_id}`}
                disabled={locked}
                onLoad={() => props.onLoadRecent(s)}
                onPlay={() => props.onPlayRecent(s)}
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold text-muted">Scenarios</h3>
        {templates === null ? (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => <li key={i} className="anim-shimmer h-28 rounded-xl" />)}
          </ul>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted">No scenarios available right now. Describe the meeting above, or start blank.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card
                key={t.slug}
                label={`Load ${t.name} into the room`}
                eyebrow={t.category || "Scenario"}
                title={t.name}
                body={t.description}
                meta={`${t.stakeholder_count} people · ${voltageWord(t.voltage)}`}
                busy={busyKey === `t:${t.slug}`}
                disabled={locked}
                onLoad={() => props.onLoadTemplate(t)}
                onPlay={() => props.onPlayTemplate(t)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
