import type { InsightGroup, Insights } from "@/lib/api";
import { OutcomeMix } from "./Overview";
import { Card, Empty, RateBar, Stat, TooFew, pct } from "./ui";

const SIZE_LABEL: Record<string, string> = { "2": "2 people", "3": "3 people", "4": "4 people", "5+": "5 or more" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const BALANCE_LABEL: Record<string, string> = {
  balanced: "Everyone spoke",
  uneven: "A few led",
  dominated: "One dominated",
};

function GroupCard({ title, hint, groups, label }: { title: string; hint: string; groups: InsightGroup[]; label?: (g: string) => string }) {
  return (
    <Card title={title} hint={hint}>
      {groups.length === 0 ? (
        <Empty>No finished meetings yet.</Empty>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => (
            <RateBar key={g.group} label={label ? label(g.group) : g.group} value={g.decided_rate} faded={!g.enough}
              note={<span>{pct(g.decided_rate)} <span className="text-xs text-muted">/{g.meetings}</span></span>}
              color="var(--color-success)" />
          ))}
        </div>
      )}
    </Card>
  );
}

export function Outcomes({ data }: { data: Insights["outcomes"] }) {
  return (
    <div className="space-y-6">
      <Card title="How meetings end" hint="Every meeting in this period, by how it finished.">
        <OutcomeMix data={data} tall />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Decided" value={pct(data.decision_rate)} sub="vote or agreement" />
        <Stat label="Ran out of turns" value={pct(data.stall_rate)} sub="hit the limit undecided" tone={(data.stall_rate ?? 0) >= 0.4 ? "warn" : undefined} />
        <Stat label="Turns to decide" value={data.median_turns_to_decision ?? "—"} sub="median, decided rooms" />
        <Stat label="Walkouts" value={pct(data.walkout_rate)} sub="someone left the table" />
      </div>

      <div>
        <h2 className="font-serif-title text-xl font-semibold text-ink">What helps a room decide</h2>
        <p className="mt-0.5 text-sm text-muted">Share of finished meetings that reached a decision, by how the room was set up. <TooFew /></p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <GroupCard title="Room size" hint="More voices, more ways to stall." groups={data.by_size} label={(g) => SIZE_LABEL[g] ?? g} />
        <GroupCard title="Who held the floor" hint="How evenly turns were spread." groups={data.by_balance} label={(g) => BALANCE_LABEL[g] ?? g} />
        <GroupCard title="Starting heat" hint="The room's voltage when it opened." groups={data.by_heat} label={cap} />
        <GroupCard title="Temperament setting" hint="Stable vs volatile agents." groups={data.by_temperature} label={cap} />
      </div>
    </div>
  );
}
