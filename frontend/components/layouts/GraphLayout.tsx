"use client";

import { useMemo } from "react";
import type {
  Turn,
  Stakeholder,
  CoalitionSignal,
  LeaderboardEntry,
} from "@/lib/types";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ActionGlyph, actionLabel } from "@/components/ActionGlyph";
import { SimBadge } from "@/components/SimBadge";

interface GraphLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  coalitions: CoalitionSignal[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
}

interface NodePos {
  id: string;
  x: number;
  y: number;
}

const FIXED_POSITIONS: Record<string, { x: number; y: number }> = {
  marin: { x: 30, y: 28 },
  devon: { x: 70, y: 30 },
  yuki:  { x: 80, y: 65 },
  aaron: { x: 50, y: 78 },
  priya: { x: 18, y: 65 },
};

function computeEdges(turns: Turn[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (let i = 1; i < turns.length; i++) {
    const a = turns[i - 1].stakeholder_id;
    const b = turns[i].stakeholder_id;
    if (a === b) continue;
    const key = [a, b].sort().join("-");
    m[key] = (m[key] ?? 0) + 1;
  }
  return m;
}

interface StatementBubbleProps {
  pos: { x: number; y: number };
  content: string;
  action: string;
}

function StatementBubble({ pos, content, action }: StatementBubbleProps) {
  const right = pos.x < 50;
  return (
    <div
      style={{
        position: "absolute",
        left: right ? `calc(${pos.x}% + 50px)` : "auto",
        right: !right ? `calc(${100 - pos.x}% + 50px)` : "auto",
        top: `${pos.y}%`,
        transform: "translateY(-50%)",
        maxWidth: 260,
        background: "var(--color-canvas)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 4px 12px rgba(20,20,19,0.06)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 4,
          color: "var(--color-muted)",
        }}
      >
        <ActionGlyph type={action} size={12} />
        {actionLabel(action)}
      </div>
      <div
        style={{
          fontFamily: "var(--font-newsreader), serif",
          fontSize: 13,
          lineHeight: 1.3,
          color: "var(--color-ink)",
          letterSpacing: "-0.2px",
        }}
      >
        &ldquo;{content.length > 100 ? content.slice(0, 100) + "…" : content}&rdquo;
      </div>
    </div>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  dot?: boolean;
}

function LegendItem({ color, label, dot }: LegendItemProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {dot ? (
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: color }}
        />
      ) : (
        <div style={{ width: 18, height: 2, background: color }} />
      )}
      <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}

function CoalitionPanel({ coalitions }: { coalitions: CoalitionSignal[] }) {
  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        borderRadius: 12,
        padding: 18,
        border: "1px solid var(--color-hairline)",
      }}
    >
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
          Coalitions
        </span>
        <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
          {coalitions.length} formed
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {coalitions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic" }}>
            None yet.
          </p>
        ) : (
          coalitions.map((c, i) => (
            <div
              key={i}
              style={{
                borderRadius: 8,
                background: "var(--color-accent-amber)/10",
                border: "1px solid var(--color-accent-amber)/30",
                padding: 8,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--color-primary)",
                  margin: 0,
                }}
              >
                {c.agent_a} ⚡ {c.agent_b}
              </p>
              <p
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  lineHeight: 1.4,
                  color: "var(--color-muted)",
                  margin: "4px 0 0 0",
                }}
              >
                {c.issue}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CurrentSpeakerPanel({
  turn,
  stakeholder,
}: {
  turn: Turn | null;
  stakeholder: Stakeholder | null;
}) {
  if (!turn || !stakeholder) {
    return (
      <div
        style={{
          background: "var(--color-ink)",
          color: "var(--color-on-dark)",
          borderRadius: 12,
          padding: 20,
          border: "1px solid var(--color-ink)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Awaiting first turn
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--color-ink)",
        color: "var(--color-on-dark)",
        borderRadius: 12,
        padding: 20,
        border: "1px solid var(--color-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Avatar
          initials={initialsFromName(stakeholder.name)}
          size={42}
          accent="coral"
          speaking
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-on-dark)" }}>
            {stakeholder.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-on-dark-soft)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ActionGlyph type={turn.action_type} size={12} />
            {actionLabel(turn.action_type)} · T{String(turn.turn_index).padStart(2, "0")}
          </div>
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-newsreader), serif",
          fontSize: 18,
          lineHeight: 1.3,
          color: "var(--color-on-dark)",
          marginBottom: 12,
        }}
      >
        &ldquo;{turn.content}&rdquo;
      </div>
      {turn.internal_reasoning && (
        <div style={{ paddingTop: 12, borderTop: "1px solid #2e2b27" }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-on-dark-soft)",
              marginBottom: 6,
            }}
          >
            Why this turn
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-on-dark)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {turn.internal_reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

export function GraphLayout({
  turns,
  activeId,
  stakeholders,
  coalitions,
  leaderboard,
  eventLog,
}: GraphLayoutProps) {
  const positions = useMemo(() => {
    return stakeholders.map((s) => ({
      id: s.id,
      x: FIXED_POSITIONS[s.id]?.x ?? 50,
      y: FIXED_POSITIONS[s.id]?.y ?? 50,
    }));
  }, [stakeholders]);

  const edges = useMemo(() => computeEdges(turns), [turns]);
  const coalitionPairs = coalitions.map((c) => `${c.agent_a}--${c.agent_b}`);
  const currentTurn = turns[turns.length - 1] ?? null;
  const currentStakeholder = stakeholders.find((s) => s.id === activeId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: 16,
        padding: 16,
        minHeight: "calc(100vh - 180px)",
        background: "var(--color-canvas)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            background: "var(--color-surface-card)",
            borderRadius: 12,
            aspectRatio: "16/10",
            position: "relative",
            overflow: "hidden",
            border: "1px solid var(--color-hairline)",
          }}
        >
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id="dotgrid"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="0.18" fill="var(--color-muted)" opacity="0.4" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#dotgrid)" />

            {Object.entries(edges).map(([key, count]) => {
              const [a, b] = key.split("-");
              const pa = positions.find((p) => p.id === a);
              const pb = positions.find((p) => p.id === b);
              if (!pa || !pb) return null;
              const isCoalition = coalitionPairs.includes(
                `${a}--${b}` || `${b}--${a}`
              );
              return (
                <line
                  key={key}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={isCoalition ? "var(--color-primary)" : "var(--color-ink)"}
                  strokeWidth={
                    isCoalition
                      ? 0.5
                      : Math.min(0.15 + count * 0.08, 0.45)
                  }
                  opacity={isCoalition ? 0.85 : 0.32}
                />
              );
            })}

            {activeId && (
              <g>
                <circle
                  cx={positions.find((p) => p.id === activeId)?.x}
                  cy={positions.find((p) => p.id === activeId)?.y}
                  r="3"
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="0.3"
                  opacity="0.6"
                  style={{ animation: "pulse 1.6s ease-out infinite" }}
                />
              </g>
            )}
          </svg>

          {positions.map((p) => {
            const s = stakeholders.find((st) => st.id === p.id);
            if (!s) return null;
            const speaking = s.id === activeId;
            const initials = initialsFromName(s.name);
            return (
              <div
                key={s.id}
                style={{
                  position: "absolute",
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.15 : 1})`,
                  transition: "transform 300ms",
                  textAlign: "center",
                  zIndex: speaking ? 2 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar
                    initials={initials}
                    size={speaking ? 56 : 48}
                    accent={speaking ? "coral" : "ink"}
                    speaking={speaking}
                    label={s.name}
                  />
                </div>
                <div
                  style={{
                    marginTop: 6,
                    background: "var(--color-canvas)",
                    border: "1px solid var(--color-hairline)",
                    padding: "3px 8px",
                    borderRadius: 9999,
                    fontWeight: 500,
                    fontSize: 12,
                    color: "var(--color-ink)",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                  }}
                >
                  {s.name.split(" ")[0]} ·{" "}
                  <span style={{ color: "var(--color-muted)" }}>{s.role.split(" ")[0]}</span>
                </div>
              </div>
            );
          })}

          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              display: "flex",
              gap: 16,
              padding: "8px 14px",
              background: "var(--color-canvas)",
              borderRadius: 9999,
              border: "1px solid var(--color-hairline)",
            }}
          >
            <LegendItem color="var(--color-ink)" label="exchange" />
            <LegendItem color="var(--color-primary)" label="coalition" />
            <LegendItem color="var(--color-primary)" label="speaking now" dot />
          </div>

          {currentTurn && activeId && (
            <StatementBubble
              pos={
                positions.find((p) => p.id === activeId) ?? { x: 50, y: 50 }
              }
              content={currentTurn.content}
              action={currentTurn.action_type}
            />
          )}
        </div>

        <div
          style={{
            background: "var(--color-surface-dark)",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-on-dark-soft)",
              }}
            >
              Event stream
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {["#a09d96", "#a09d96", "#cc785c"].map((c, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
              ))}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.7,
              color: "var(--color-on-dark)",
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            {eventLog.length === 0 && (
              <span style={{ color: "var(--color-on-dark-soft)" }}>Awaiting events…</span>
            )}
            {eventLog.map((evt, i) => (
              <p key={i} style={{ color: i === eventLog.length - 1 ? "var(--color-primary)" : undefined }}>
                &gt; {evt}
              </p>
            ))}
            <span style={{ color: "var(--color-primary)", animation: "pulse 1s steps(2) infinite" }}>▌</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <CurrentSpeakerPanel turn={currentTurn} stakeholder={currentStakeholder} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {leaderboard.length > 0 && (
            <div
              style={{
                background: "var(--color-surface-card)",
                borderRadius: 12,
                padding: 18,
                border: "1px solid var(--color-hairline)",
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
                  Who's Winning
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {leaderboard.slice(0, 3).map((entry) => (
                  <div key={entry.agent_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        width: 20,
                        color: entry.rank === 1 ? "var(--color-accent-amber)" : "var(--color-muted)",
                      }}
                    >
                      #{entry.rank}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                          {entry.name.split(" ")[0]}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                          {entry.score.toFixed(1)}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: "var(--color-hairline)",
                          borderRadius: 9999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            background: entry.rank === 1 ? "var(--color-accent-amber)" : "var(--color-primary)/50",
                            width: `${Math.min(100, entry.score)}%`,
                            transition: "width 500ms",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <CoalitionPanel coalitions={coalitions} />
        </div>
      </div>
    </div>
  );
}
