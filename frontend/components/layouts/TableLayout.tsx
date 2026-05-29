"use client";

import { useMemo } from "react";
import type {
  Turn,
  Stakeholder,
  HeatmapState,
  CoalitionSignal,
  LeverageShift,
  LeaderboardEntry,
} from "@/lib/types";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ActionGlyph, actionLabel } from "@/components/ActionGlyph";
import { Voltage } from "@/components/Voltage";
import { SimBadge } from "@/components/SimBadge";

interface TableLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  heatmap: HeatmapState | null;
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
}

interface SeatPosition {
  id: string;
  x: number;
  y: number;
}

function buildSeatPositions(stakeholders: Stakeholder[]): SeatPosition[] {
  const cx = 50, cy = 50;
  const rx = 38, ry = 30;
  const n = stakeholders.length;
  return stakeholders.map((s, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
    return {
      id: s.id,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });
}

function LeaderboardPanel({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  const sorted = [...leaderboard].sort((a, b) => a.rank - b.rank);
  return (
    <PanelCard title="Who's Winning" sub="Live score">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic" }}>
            Awaiting turns…
          </p>
        )}
        {sorted.map((row, i) => {
          const isTop = i === 0;
          return (
            <div
              key={row.agent_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: isTop ? "var(--color-ink)" : "var(--color-canvas)",
                color: isTop ? "var(--color-on-dark)" : "var(--color-ink)",
                borderRadius: 8,
                border: `1px solid ${isTop ? "var(--color-ink)" : "var(--color-hairline)"}`,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-newsreader), serif",
                  fontSize: 22,
                  width: 24,
                  color: isTop ? "var(--color-on-dark)" : "var(--color-muted)",
                  flexShrink: 0,
                }}
              >
                #{row.rank}
              </div>
              <Avatar
                initials={initialsFromName(row.name)}
                size={28}
                accent={isTop ? "coral" : "ink"}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "inherit" }}>
                  {row.name.split(" ")[0]}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: isTop ? "var(--color-on-dark-soft)" : "var(--color-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.delta_reason}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                  {row.score.toFixed(1)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color:
                      row.delta > 0
                        ? isTop ? "#a3d3ae" : "var(--color-secondary)"
                        : "var(--color-error)",
                  }}
                >
                  {row.delta > 0 ? "▲" : "▼"} {Math.abs(row.delta).toFixed(1)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

function HeatmapPanel({ heatmap }: { heatmap: HeatmapState | null }) {
  if (!heatmap) return null;
  const entries: [string, number][] = [
    ["Commercial Gain", heatmap.commercial_gain],
    ["Tech Integrity", heatmap.tech_integrity],
    ["Legal Safety", heatmap.legal_safety],
  ];
  return (
    <PanelCard title="Incentive Heatmap" sub="Where the room is pulling">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {entries.map(([label, value]) => (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{value}%</span>
            </div>
            <Voltage
              value={value}
              color={
                value >= 60
                  ? "var(--color-secondary)"
                  : value >= 35
                  ? "var(--color-accent-amber)"
                  : "var(--color-primary)"
              }
            />
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function LeveragePanel({ shifts }: { shifts: LeverageShift[] }) {
  const recent = shifts.slice(-3);
  return (
    <PanelCard title="Leverage Shifts" sub="Power transfers">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recent.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic" }}>
            Balanced.
          </p>
        ) : (
          recent.map((ls, i) => (
            <div
              key={i}
              style={{ fontSize: 12, borderLeft: "2px solid var(--color-primary)", paddingLeft: 8 }}
            >
              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{ls.to_agent}</span>
              {" gained over "}
              <span>{ls.from_agent}</span>
              <p style={{ color: "var(--color-muted)", marginTop: 2 }}>{ls.reason}</p>
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}

function PanelCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
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
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export function TableLayout({
  turns,
  activeId,
  stakeholders,
  heatmap,
  coalitions,
  leverageShifts,
  leaderboard,
  eventLog,
}: TableLayoutProps) {
  const positions = useMemo(() => buildSeatPositions(stakeholders), [stakeholders]);
  const currentTurn = turns[turns.length - 1] ?? null;

  const coalitionPairs = coalitions.map((c) => `${c.agent_a}--${c.agent_b}`);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: 16,
        padding: 16,
        minHeight: "calc(100vh - 180px)",
        background: "var(--color-canvas)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            background: "var(--color-surface-dark)",
            borderRadius: 12,
            aspectRatio: "16/10",
            position: "relative",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 24,
              background:
                "radial-gradient(ellipse at center, #2a2725 0%, #1f1c19 70%, #181715 100%)",
              borderRadius: "50%",
              border: "1px solid #2e2b27",
            }}
          />

          <svg
            style={{
              position: "absolute",
              inset: 24,
              width: "calc(100% - 48px)",
              height: "calc(100% - 48px)",
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <ellipse
              cx="50" cy="50" rx="48" ry="48"
              fill="none" stroke="#28251f" strokeWidth="0.2" strokeDasharray="0.3 0.6"
            />
            <ellipse
              cx="50" cy="50" rx="36" ry="36"
              fill="none" stroke="#28251f" strokeWidth="0.15"
            />

            {coalitionPairs.map((pair, i) => {
              const [aId, bId] = pair.split("--");
              const a = positions.find((p) => p.id === aId);
              const b = positions.find((p) => p.id === bId);
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y}
                  x2={b.x} y2={b.y}
                  stroke="var(--color-primary)"
                  strokeWidth="0.3"
                  strokeDasharray="0.6 0.4"
                  opacity="0.7"
                />
              );
            })}
          </svg>

          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "44%",
              textAlign: "center",
            }}
          >
            {currentTurn ? (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-on-dark-soft)",
                    marginBottom: 8,
                  }}
                >
                  T{String(currentTurn.turn_index).padStart(2, "0")} ·{" "}
                  {actionLabel(currentTurn.action_type)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-newsreader), serif",
                    fontSize: 20,
                    lineHeight: 1.25,
                    color: "var(--color-on-dark)",
                    letterSpacing: "-0.3px",
                  }}
                >
                  &ldquo;{currentTurn.content.slice(0, 140)}
                  {currentTurn.content.length > 140 ? "…" : ""}&rdquo;
                </div>
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 12,
                    color: "var(--color-on-dark-soft)",
                  }}
                >
                  — {currentTurn.stakeholder_name}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--color-on-dark-soft)",
                }}
              >
                Awaiting first turn
              </div>
            )}
          </div>

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
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.12 : 1})`,
                  transition: "transform 300ms cubic-bezier(.4,0,.2,1)",
                  textAlign: "center",
                  zIndex: speaking ? 2 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar
                    initials={initials}
                    size={speaking ? 60 : 52}
                    accent={speaking ? "coral" : "ink"}
                    speaking={speaking}
                    label={s.name}
                  />
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontWeight: 500,
                    fontSize: 13,
                    color: speaking ? "var(--color-on-dark)" : "var(--color-on-dark-soft)",
                  }}
                >
                  {s.name.split(" ")[0]}
                </div>
                <div style={{ fontSize: 10, color: "var(--color-on-dark-soft)" }}>
                  {s.role.split(" ")[0]}
                </div>
              </div>
            );
          })}
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
              {["var(--color-muted)", "var(--color-muted)", "var(--color-chart-1)"].map((c, i) => (
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
              maxHeight: 160,
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
        <LeaderboardPanel leaderboard={leaderboard} />
        <HeatmapPanel heatmap={heatmap} />
        <LeveragePanel shifts={leverageShifts} />
      </div>
    </div>
  );
}
