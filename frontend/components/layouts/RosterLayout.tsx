"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
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
import { SimBadge, dispositionTone } from "@/components/SimBadge";
import { Voltage } from "@/components/Voltage";

interface RosterLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  heatmap: HeatmapState | null;
  sentiment: number[];
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
  conflictStep: number;
  totalSteps: number;
}

function StakeholderRail({
  stakeholders,
  turns,
  activeId,
}: {
  stakeholders: Stakeholder[];
  turns: Turn[];
  activeId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
          marginBottom: 4,
        }}
      >
        The Room
      </span>
      {stakeholders.map((s) => {
        const speaking = s.id === activeId;
        const lastTurn = [...turns].reverse().find((t) => t.stakeholder_id === s.id);
        const initials = initialsFromName(s.name);
        const accent = speaking ? "coral" : "ink";

        return (
          <div
            key={s.id}
            style={{
              padding: 14,
              background: speaking ? "var(--color-ink)" : "var(--color-surface-card)",
              color: speaking ? "var(--color-on-dark)" : "var(--color-ink)",
              borderRadius: 12,
              transition: "background 240ms ease",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Avatar initials={initials} size={36} accent={accent} speaking={speaking} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "inherit", lineHeight: 1.2 }}>
                  {s.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: speaking ? "var(--color-on-dark-soft)" : "var(--color-muted)",
                    lineHeight: 1.3,
                  }}
                >
                  {s.role}
                </div>
              </div>
              {speaking ? (
                <SimBadge tone="speaking">SPEAKING</SimBadge>
              ) : lastTurn ? (
                <SimBadge tone={dispositionTone(lastTurn.action_type)}>
                  {lastTurn.action_type.replace("_", " ")}
                </SimBadge>
              ) : null}
            </div>
            {lastTurn && (
              <div
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  color: speaking ? "var(--color-on-dark-soft)" : "var(--color-muted)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                &ldquo;{lastTurn.content}&rdquo;
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TranscriptStream({
  turns,
  activeId,
}: {
  turns: Turn[];
  activeId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length]);

  return (
    <div
      style={{
        background: "var(--color-canvas)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 360,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-muted)",
          }}
        >
          Transcript
        </span>
        <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{turns.length} turns</span>
      </div>
      <div
        ref={scrollRef}
        style={{ padding: "12px 20px", flex: 1, overflowY: "auto", maxHeight: 440 }}
      >
        {turns.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--color-muted)", fontStyle: "italic" }}>
            No turns yet — start the simulation.
          </p>
        )}
        {turns.map((t, i) => {
          const isCurrent = t.stakeholder_id === activeId && i === turns.length - 1;
          const initials = initialsFromName(t.stakeholder_name);
          return (
            <div
              key={`${t.stakeholder_id}-${t.turn_index}`}
              style={{
                display: "flex",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < turns.length - 1 ? "1px solid var(--color-hairline)" : "none",
                opacity: isCurrent ? 1 : 0.82,
              }}
            >
              <Avatar initials={initials} size={32} speaking={isCurrent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.stakeholder_name}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--color-muted)",
                      fontSize: 11,
                    }}
                  >
                    <ActionGlyph type={t.action_type} />
                    {actionLabel(t.action_type)}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--color-muted)",
                    }}
                  >
                    T{String(t.turn_index).padStart(2, "0")}
                  </span>
                </div>
                <div className="text-[15px] leading-relaxed text-[var(--color-ink)]">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>,
                      em: ({ children }) => <em className="italic text-[var(--color-ink)]/70">{children}</em>,
                      code: ({ children }) => <code className="bg-[var(--color-ink)]/20 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      pre: ({ children }) => <pre className="bg-[var(--color-ink)]/10 p-2 rounded my-1 overflow-x-auto text-xs">{children}</pre>,
                      blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--color-primary)]/40 pl-2 italic text-[var(--color-ink)]/70 my-1">{children}</blockquote>,
                      a: ({ children, href }) => <a href={href} className="text-[var(--color-accent-teal)] underline hover:opacity-70" target="_blank" rel="noopener noreferrer">{children}</a>,
                      h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs font-semibold mt-1.5 mb-0.5">{children}</h3>,
                      hr: ({ children }) => <hr className="border-[var(--color-hairline)] my-2">{children}</hr>,
                    }}
                  >
                    {t.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
        {heatmap.recommendation && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-muted)",
              fontStyle: "italic",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            &ldquo;{heatmap.recommendation}&rdquo;
          </p>
        )}
      </div>
    </PanelCard>
  );
}

function SentimentPanel({ sentiment }: { sentiment: number[] }) {
  return (
    <PanelCard title="Sentiment by Turn" sub="Aggressive ↔ aligned">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          height: 90,
          borderBottom: "1px solid var(--color-hairline)",
          borderTop: "1px solid var(--color-hairline)",
          padding: "8px 0",
        }}
      >
        {sentiment.length === 0
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: "30%", background: "var(--color-hairline)", borderRadius: 2 }} />
            ))
          : sentiment.map((score, i) => {
              const h = Math.max(8, Math.abs(score) * 80);
              const pos = score >= 0;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    height: "100%",
                  }}
                  title={`Turn ${i + 1}`}
                >
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    {pos && (
                      <div
                        style={{
                          width: "100%",
                          height: h,
                          background: "var(--color-secondary)",
                          borderRadius: "2px 2px 0 0",
                          opacity: 0.75,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ width: "100%", height: 1, background: "var(--color-hairline)" }} />
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-start", width: "100%" }}>
                    {!pos && (
                      <div
                        style={{
                          width: "100%",
                          height: h,
                          background: "var(--color-error)",
                          borderRadius: "0 0 2px 2px",
                          opacity: 0.75,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--color-muted)",
        }}
      >
        <span>T0</span>
        <span style={{ color: "var(--color-error)", fontSize: 10 }}>
          {sentiment.filter((s) => s < -0.3).length} aggressive turns
        </span>
        <span>T{sentiment.length}</span>
      </div>
    </PanelCard>
  );
}

function LeveragePanel({ shifts }: { shifts: LeverageShift[] }) {
  const recent = shifts.slice(-4);
  return (
    <PanelCard title="Leverage Shifts" sub="Power transfers">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recent.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic" }}>
            Balanced — no shifts yet.
          </p>
        ) : (
          recent.map((ls, i) => (
            <div
              key={i}
              style={{
                padding: 10,
                background: "var(--color-canvas)",
                borderRadius: 8,
                border: "1px solid var(--color-hairline)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600 }}>{ls.from_agent}</span>
                <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                  <path d="M1 5h16M13 1l4 4-4 4" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{ls.to_agent}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.4 }}>{ls.reason}</p>
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}

function CoalitionPanel({ coalitions }: { coalitions: CoalitionSignal[] }) {
  return (
    <PanelCard title="Coalitions" sub={`${coalitions.length} formed`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {coalitions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic" }}>
            None yet — room is still individual.
          </p>
        ) : (
          coalitions.map((c, i) => {
            const aInit = c.agent_a.slice(0, 2).toUpperCase();
            const bInit = c.agent_b.slice(0, 2).toUpperCase();
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--color-canvas)",
                  borderRadius: 8,
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <div style={{ display: "flex" }}>
                  <Avatar initials={aInit} size={28} accent="ink" />
                  <div style={{ marginLeft: -10 }}>
                    <Avatar initials={bInit} size={28} accent="teal" />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {c.agent_a} + {c.agent_b}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.issue}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PanelCard>
  );
}

function EventLogPanel({ eventLog }: { eventLog: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (endRef.current) {
      endRef.current.parentElement!.scrollTop =
        endRef.current.parentElement!.scrollHeight;
    }
  }, [eventLog.length]);

  return (
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
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {eventLog.length === 0 && (
          <span style={{ color: "var(--color-on-dark-soft)" }}>Awaiting events…</span>
        )}
        {eventLog.map((evt, i) => (
          <div key={i} style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "var(--color-on-dark-soft)", minWidth: 28 }}>
              T{String(i).padStart(2, "0")}
            </span>
            <span
              style={{
                color:
                  evt.startsWith("[agent]") ? "var(--color-on-dark)" :
                  evt.startsWith("[tool]")  ? "var(--color-accent-teal)" :
                  evt.startsWith("[alert]") ? "var(--color-primary)" :
                  "var(--color-on-dark-soft)",
              }}
            >
              {evt}
            </span>
          </div>
        ))}
        <div ref={endRef} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              color: "var(--color-primary)",
              animation: "pulse 1s steps(2) infinite",
            }}
          >
            ▌
          </span>
        </div>
      </div>
    </div>
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

export function RosterLayout({
  turns,
  activeId,
  stakeholders,
  heatmap,
  sentiment,
  coalitions,
  leverageShifts,
  eventLog,
}: RosterLayoutProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 340px",
        gap: 16,
        padding: 16,
        minHeight: "calc(100vh - 180px)",
        background: "var(--color-canvas)",
      }}
    >
      <StakeholderRail stakeholders={stakeholders} turns={turns} activeId={activeId} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TranscriptStream turns={turns} activeId={activeId} />
        <EventLogPanel eventLog={eventLog} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <HeatmapPanel heatmap={heatmap} />
        <SentimentPanel sentiment={sentiment} />
        <LeveragePanel shifts={leverageShifts} />
        <CoalitionPanel coalitions={coalitions} />
      </div>
    </div>
  );
}
