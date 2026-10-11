import type { Insights } from "@/lib/api";
import { Card, Empty, RateBar, TooFew, moveName, pct } from "./ui";

/** Each move's share of turns in rooms that decided vs rooms that didn't, side by side. */
function MoveCompare({ moves }: { moves: Insights["tactics"]["moves"] }) {
  const max = Math.max(0.01, ...moves.flatMap((m) => [m.share_decided ?? 0, m.share_open ?? 0]));
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Rooms that decided</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink/30" />Rooms that didn&apos;t</span>
      </div>
      {moves.map((m) => {
        const verdict = m.lift == null || m.count < 5 ? null : m.lift >= 1.25 ? "helps" : m.lift <= 0.8 ? "stalls" : null;
        return (
          <div key={m.action} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_5.5rem]">
            <span className="truncate text-body-strong">{moveName(m.action)}</span>
            <span className="space-y-1">
              <span className="block h-2 rounded-full bg-success" style={{ width: `${((m.share_decided ?? 0) / max) * 100}%`, minWidth: m.share_decided ? 2 : 0 }} />
              <span className="block h-2 rounded-full bg-ink/25" style={{ width: `${((m.share_open ?? 0) / max) * 100}%`, minWidth: m.share_open ? 2 : 0 }} />
            </span>
            <span className="text-right text-xs">
              {verdict === "helps" && <span className="font-semibold text-success">{m.lift}× more</span>}
              {verdict === "stalls" && <span className="font-semibold text-error">{Math.round((1 - (m.lift ?? 1)) * 100)}% less</span>}
              {!verdict && <span className="text-muted">{pct(m.share)} of turns</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Tactics({ data }: { data: Insights["tactics"] }) {
  if (!data.moves.length) return <Empty>No turns in this period.</Empty>;
  const phases = data.heat_by_phase;
  const heatMax = Math.max(0.01, ...phases.flatMap((p) => [p.anger ?? 0, p.fear ?? 0, p.joy ?? 0]));
  return (
    <div className="space-y-6">
      <Card title="Moves that go with decisions"
        hint="How much of the talk each move takes up, in rooms that reached a decision against rooms that didn't. “2× more” means twice as common where the room decided; “40% less” means rarer there.">
        <MoveCompare moves={data.moves} />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="First move sets the tone" hint={`Decision rate by the meeting's opening move.`}>
          {data.openers.length ? (
            <div className="space-y-2.5">
              {data.openers.map((o) => (
                <RateBar key={o.action} label={moveName(o.action)} value={o.decided_rate} faded={!o.enough} color="var(--color-success)"
                  note={<span>{pct(o.decided_rate)} <span className="text-xs text-muted">/{o.meetings}</span></span>} />
              ))}
              <p className="pt-1"><TooFew /></p>
            </div>
          ) : <Empty>No finished meetings yet.</Empty>}
        </Card>

        <Card title="How rooms answer pressure" hint="What the next speaker does after a challenge, escalation or interruption.">
          {data.answers_to_pressure.length ? (
            <div className="space-y-2.5">
              {data.answers_to_pressure.map((a) => (
                <RateBar key={a.action} label={moveName(a.action)} value={a.share}
                  color={["challenge", "escalate", "interrupt", "walkaway"].includes(a.action) ? "var(--color-error)" : "var(--color-accent-teal)"} />
              ))}
            </div>
          ) : <Empty>No pressure moves yet.</Empty>}
        </Card>

        <Card title="Temperature" hint="Combative vs conciliatory share of all turns.">
          <div className="space-y-2.5">
            <RateBar label="Combative" value={data.hostile_share} color="var(--color-error)" />
            <RateBar label="Conciliatory" value={data.conciliatory_share} color="var(--color-success)" />
          </div>
        </Card>

        <Card title="When it heats up" hint="Average emotion across the start, middle and end of meetings.">
          {phases.length ? (
            <div className="grid grid-cols-3 gap-3">
              {phases.map((p) => (
                <div key={p.phase}>
                  <div className="flex h-24 items-end gap-1.5">
                    {(["anger", "fear", "joy"] as const).map((e) => (
                      <span key={e} title={`${e}: ${(p[e] ?? 0).toFixed(2)}`} className="flex-1 rounded-t"
                        style={{ height: `${((p[e] ?? 0) / heatMax) * 100}%`, minHeight: 2,
                          background: e === "anger" ? "var(--color-error)" : e === "fear" ? "var(--color-accent-blue)" : "var(--color-success)" }} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-center text-xs capitalize text-muted">{p.phase}</p>
                </div>
              ))}
            </div>
          ) : <Empty>No emotion data yet.</Empty>}
          <div className="mt-3 flex justify-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-error" />Anger</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-blue" />Fear</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Joy</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
