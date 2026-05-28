"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Turn } from "./TranscriptStream";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { CoalitionTracker } from "./CoalitionTracker";
import { Avatar, initialsFromName } from "@/components/Avatar";
import type { SimulationStateData } from "@/lib/use-simulation-state";

interface GraphStakeholder {
  id: string;
  name: string;
  role: string;
  stance: string;
}

interface EventLogEntry {
  t: number;
  text: string;
  type: string;
}

interface GraphLayoutProps {
  turn: number;
  current?: Turn;
  playing: boolean;
  stakeholders: GraphStakeholder[];
  speakerId: string | null;
  turns: Turn[];
  totalTurns: number;
  eventLog: EventLogEntry[];
  simState?: SimulationStateData;
  nameMap?: Record<string, string>;
}

type GraphMode = "conversation" | "relationships";

const TAB_CLS = (active: boolean) =>
  `px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
    active ? "bg-ink text-canvas" : "text-muted hover:text-ink hover:bg-surface-card"
  }`;

const STANCE_COLORS: Record<string, string> = {
  champion: "var(--color-primary)",
  detractor: "var(--color-error)",
  neutral: "var(--color-muted)",
  moderator: "var(--color-accent-teal)",
  wildcard: "var(--color-accent-amber)",
};

const STANCE_LABELS: Record<string, string> = {
  champion: "Champion",
  detractor: "Detractor",
  neutral: "Neutral",
  moderator: "Moderator",
  wildcard: "Wildcard",
};

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  fear: "#a855f7",
  joy: "#22c55e",
  shame: "#f97316",
  surprise: "#eab308",
};

interface GraphNode {
  id: string;
  name: string;
  role: string;
  stance: string;
  isSpeaking: boolean;
  credibility: number;
  trust: number;
  leverage: number;
  tension: number;
  dominantEmotion: string;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
  type: "exchange" | "trust";
  label?: string;
}

export function GraphLayout({
  turn,
  current,
  stakeholders,
  speakerId,
  turns,
  totalTurns,
  eventLog,
  simState,
  nameMap,
}: GraphLayoutProps) {
  const [mode, setMode] = useState<GraphMode>("conversation");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ width: 720, height: 450 });

  // Resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDim({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Enrich nodes with state data
  const enrichNode = useCallback(
    (s: GraphStakeholder): GraphNode => {
      const sp = simState?.getSocialPhysics(s.id);
      const ast = simState?.getAgentState(s.id);
      const emotions = ast?.emotion ?? {};
      const dominant = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0];
      return {
        id: s.id,
        name: nameMap?.[s.id] ?? s.name,
        role: s.role,
        stance: s.stance,
        isSpeaking: s.name === speakerId,
        credibility: sp?.credibility ?? 0.5,
        trust: sp?.trust ?? 0.5,
        leverage: sp?.leverage ?? 0.5,
        tension: sp?.tension ?? 0.3,
        dominantEmotion: dominant?.[0] ?? "neutral",
      };
    },
    [simState, speakerId, nameMap]
  );

  // Conversation graph
  const convGraph = useMemo(() => {
    const nodes: GraphNode[] = stakeholders.map(enrichNode);
    const edgeMap: Record<string, { count: number; speakers: string[] }> = {};
    for (let i = 1; i < turns.length; i++) {
      const a = turns[i - 1]?.speaker;
      const b = turns[i]?.speaker;
      if (!a || !b || a === b) continue;
      const aId = stakeholders.find((s) => s.name === a)?.id;
      const bId = stakeholders.find((s) => s.name === b)?.id;
      if (!aId || !bId) continue;
      const key = [aId, bId].sort().join("-");
      if (!edgeMap[key]) edgeMap[key] = { count: 0, speakers: [a, b] };
      edgeMap[key].count++;
    }
    const links: GraphLink[] = Object.entries(edgeMap).map(([key, val]) => {
      const [a, b] = key.split("-");
      return { source: a, target: b, value: val.count, type: "exchange" as const, label: `${val.count}x` };
    });
    return { nodes, links };
  }, [stakeholders, turns, enrichNode]);

  // Trust relationship graph
  const relGraph = useMemo(() => {
    const tm = simState?.trustMatrix ?? {};
    const nodes: GraphNode[] = stakeholders.map(enrichNode);
    const links: GraphLink[] = [];
    for (const a of stakeholders) {
      for (const b of stakeholders) {
        if (a.id >= b.id) continue;
        const trust = tm[a.id]?.[b.id] ?? 0.5;
        links.push({ source: a.id, target: b.id, value: trust, type: "trust" as const, label: `${Math.round(trust * 100)}%` });
      }
    }
    return { nodes, links };
  }, [stakeholders, simState?.trustMatrix, enrichNode]);

  const graphData = mode === "conversation" ? convGraph : relGraph;

  // Track which IDs are connected to selected node
  const highlightIds = useMemo(() => {
    if (!selectedNode) return null;
    const set = new Set<string>([selectedNode]);
    for (const link of graphData.links) {
      const sid = typeof link.source === "string" ? link.source : (link.source as any).id;
      const tid = typeof link.target === "string" ? link.target : (link.target as any).id;
      if (sid === selectedNode) set.add(tid);
      if (tid === selectedNode) set.add(sid);
    }
    return set;
  }, [selectedNode, graphData.links]);

  // Center on speaker
  useEffect(() => {
    if (speakerId && fgRef.current && !selectedNode) {
      const n = (graphData.nodes as any[]).find(
        (n: any) => n.name === speakerId || stakeholders.find((s) => s.name === speakerId)?.id === n.id
      );
      if (n?.x != null) {
        fgRef.current.centerAt(n.x, n.y, 600);
      }
    }
  }, [speakerId, mode, selectedNode]);

  // ── Node canvas renderer ──
  const nodeCanvas = useCallback(
    (rawNode: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as GraphNode & { x: number; y: number; vx?: number; vy?: number };
      // Guard: skip if node hasn't been positioned by force sim yet
      if (!isFinite(node.x) || !isFinite(node.y)) return;

      const isHighlighted = !highlightIds || highlightIds.has(node.id);
      const isSelected = node.id === selectedNode;
      const isHovered = node.id === hoveredNode;
      const alpha = isHighlighted ? 1 : 0.15;

      const baseR = 8 + node.credibility * 14; // radius 8–22 based on credibility
      const r = node.isSpeaking ? baseR * 1.12 : baseR;
      // Guard: skip if computed radius is non-finite
      if (!isFinite(r) || r <= 0) return;
      const fontSize = Math.max(9, Math.min(13, r * 0.7)) / globalScale;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── Coral glow for selected/speaking ──
      if (isSelected || node.isSpeaking) {
        const glowR = r + 10;
        const gradient = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR);
        gradient.addColorStop(0, `rgba(237,111,92,0.25)`);
        gradient.addColorStop(1, `rgba(237,111,92,0)`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // ── Emotion ring ──
      if (node.dominantEmotion && node.dominantEmotion !== "neutral") {
        const emColor = EMOTION_COLORS[node.dominantEmotion] ?? "#666";
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = emColor;
        ctx.lineWidth = 2 / globalScale;
        ctx.globalAlpha = alpha * 0.6;
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }

      // ── Speaking pulse ring ──
      if (node.isSpeaking) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // ── Node body ──
      const baseColor = STANCE_COLORS[node.stance] ?? "#a3a3a3";
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 0, node.x, node.y, r);
      grad.addColorStop(0, lighten(baseColor, 40));
      grad.addColorStop(1, baseColor);
      ctx.fillStyle = grad;
      ctx.fill();

      // ── Border ──
      ctx.strokeStyle = isSelected ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = (isSelected ? 2 : 1) / globalScale;
      ctx.stroke();

      // ── Inner dot for speaking ──
      if (node.isSpeaking) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.35, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
      }

      // ── Label ──
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelY = node.y + r + 4 / globalScale;
      ctx.fillStyle = isSelected || node.isSpeaking ? "#ffffff" : "rgba(255,255,255,0.7)";
      ctx.fillText(node.name, node.x, labelY);

      // Role subtitle under label
      if (node.isSpeaking || isSelected) {
        ctx.font = `${Math.max(7, fontSize * 0.75)}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(node.role, node.x, labelY + fontSize + 2 / globalScale);
      }

      // ── Credibility score badge ──
      if (globalScale > 0.7) {
        const score = Math.round(node.credibility * 100);
        ctx.font = `${Math.max(6, 8 / globalScale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(`${score}`, node.x, node.y + 1);
      }

      ctx.restore();
    },
    [highlightIds, selectedNode, hoveredNode]
  );

  // ── Edge rendering ──
  const linkColor = useCallback(
    (link: any) => {
      if (!highlightIds) {
        if (link.type === "trust") {
          return link.value > 0.6 ? "rgba(34,197,94,0.3)" : link.value > 0.3 ? "rgba(163,163,163,0.2)" : "rgba(239,68,68,0.3)";
        }
        return `rgba(255,255,255,${Math.min(0.06 + link.value * 0.035, 0.2)})`;
      }
      const sid = typeof link.source === "string" ? link.source : link.source?.id;
      const tid = typeof link.target === "string" ? link.target : link.target?.id;
      const bothHighlighted = highlightIds.has(sid) && highlightIds.has(tid);
      if (!bothHighlighted) return "rgba(255,255,255,0.03)";
      if (link.type === "trust") {
        return link.value > 0.6 ? "rgba(34,197,94,0.5)" : link.value > 0.3 ? "rgba(163,163,163,0.35)" : "rgba(239,68,68,0.5)";
      }
      return `rgba(255,255,255,0.25)`;
    },
    [highlightIds]
  );

  const linkWidth = useCallback(
    (link: any) => {
      if (!highlightIds) {
        if (link.type === "trust") return 0.3 + link.value * 1.8;
        return 0.2 + link.value * 0.25;
      }
      const sid = typeof link.source === "string" ? link.source : link.source?.id;
      const tid = typeof link.target === "string" ? link.target : link.target?.id;
      if (!highlightIds.has(sid) || !highlightIds.has(tid)) return 0;
      if (link.type === "trust") return 0.5 + link.value * 2.5;
      return 0.3 + link.value * 0.4;
    },
    [highlightIds]
  );



  // ── Hover handlers ──
  const handleNodeHover = useCallback(
    (rawNode: any | null) => {
      if (!rawNode) {
        setHoveredNode(null);
        setTooltip(null);
        return;
      }
      const node = rawNode as GraphNode;
      setHoveredNode(node.id);
      setTooltip({ x: rawNode.x, y: rawNode.y, node });
    },
    []
  );

  const handleNodeClick = useCallback(
    (rawNode: any) => {
      const node = rawNode as GraphNode;
      setSelectedNode((prev) => (prev === node.id ? null : node.id));
    },
    []
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ── Selected agent detail panel ──
  const selectedAgent = useMemo(() => {
    if (!selectedNode) return null;
    const s = stakeholders.find((st) => st.id === selectedNode);
    if (!s) return null;
    const sp = simState?.getSocialPhysics(selectedNode);
    const ast = simState?.getAgentState(selectedNode);
    const tm = simState?.trustMatrix ?? {};
    const trustTo = stakeholders
      .filter((st) => st.id !== selectedNode)
      .map((st) => ({
        name: nameMap?.[st.id] ?? st.name,
        trust: tm[selectedNode]?.[st.id] ?? 0.5,
      }))
      .sort((a, b) => b.trust - a.trust);
    return { stakeholder: s, socialPhysics: sp, agentState: ast, trustTo };
  }, [selectedNode, stakeholders, simState, nameMap]);

  return (
    <div
      className="grid min-h-[calc(100vh-220px)] gap-4 p-4"
      style={{ gridTemplateColumns: "1fr 360px" }}
    >
      <div className="flex flex-col gap-3">
        {/* ── Top bar: mode toggle + legend ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 self-start rounded-lg border border-hairline bg-canvas p-0.5">
            <button className={TAB_CLS(mode === "conversation")} onClick={() => setMode("conversation")}>
              Conversation
            </button>
            <button className={TAB_CLS(mode === "relationships")} onClick={() => setMode("relationships")}>
              Trust
            </button>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted">
            {Object.entries(STANCE_COLORS).map(([stance, color]) => (
              <span key={stance} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {STANCE_LABELS[stance] ?? stance}
              </span>
            ))}
            <span className="flex items-center gap-1 ml-2">
              <span className="h-[2px] w-3 rounded" style={{ background: "rgba(34,197,94,0.5)" }} />
              trust &gt;60%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-[2px] w-3 rounded" style={{ background: "rgba(239,68,68,0.5)" }} />
              trust &lt;30%
            </span>
          </div>
        </div>

        {/* ── Force graph ── */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-hairline bg-surface-dark"
          style={{ minHeight: 420 }}
          onClick={handleBackgroundClick}
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dim.width}
            height={dim.height}
            nodeCanvasObject={nodeCanvas}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as any;
              ctx.beginPath();
              ctx.arc(n.x, n.y, 22, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={linkColor}
            linkWidth={linkWidth as any}
            linkDirectionalParticles={mode === "conversation" ? 1 : 0}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleSpeed={0.008}
            d3VelocityDecay={0.28}
            d3AlphaDecay={0.015}
            cooldownTime={2000}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            backgroundColor="transparent"
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            minZoom={0.5}
            maxZoom={4}
          />

          {/* ── Hover tooltip ── */}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-50 rounded-xl border border-hairline/40 bg-ink/95 px-3 py-2 shadow-xl backdrop-blur-sm"
              style={{
                left: Math.min(tooltip.x + 16, dim.width - 200),
                top: Math.max(tooltip.y - 60, 8),
                minWidth: 160,
              }}
            >
              <div className="flex items-center gap-2">
                <Avatar initials={initialsFromName(tooltip.node.name)} size={22} />
                <div>
                  <div className="text-[12px] font-semibold text-canvas">{tooltip.node.name}</div>
                  <div className="text-[10px] text-canvas/50">{tooltip.node.role}</div>
                </div>
              </div>
              <div className="mt-1.5 flex gap-2 text-[10px] text-canvas/60">
                <span>
                  Trust <span className="font-mono text-canvas/80">{Math.round(tooltip.node.trust * 100)}%</span>
                </span>
                <span>
                  Cred <span className="font-mono text-canvas/80">{Math.round(tooltip.node.credibility * 100)}</span>
                </span>
                <span>
                  Tense <span className="font-mono text-canvas/80">{Math.round(tooltip.node.tension * 100)}</span>
                </span>
              </div>
              {tooltip.node.dominantEmotion && tooltip.node.dominantEmotion !== "neutral" && (
                <div className="mt-1 text-[10px] text-canvas/50">
                  Emotion:{" "}
                  <span
                    className="font-semibold"
                    style={{ color: EMOTION_COLORS[tooltip.node.dominantEmotion] ?? "#fff" }}
                  >
                    {tooltip.node.dominantEmotion}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Watermark / mode indicator ── */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-hairline/20 bg-ink/40 px-3 py-1 text-[10px] text-canvas/40 backdrop-blur-sm">
            {mode === "conversation" ? "Conversation flow · particle edges show exchange direction" : "Trust relationships · edge width = trust strength"}
            {selectedNode && " · click node to deselect"}
          </div>
        </div>

        <ConflictTimeline turn={turn} totalTurns={totalTurns} />
        <EventLog events={eventLog} />
      </div>

      {/* ── Right sidebar ── */}
      <div className="flex flex-col gap-[14px]">
        {/* Agent detail panel when selected */}
        {selectedAgent && (
          <div className="rounded-xl border border-hairline bg-surface-card p-[18px] transition-all duration-300">
            <div className="mb-3 flex items-center gap-2">
              <Avatar initials={initialsFromName(selectedAgent.stakeholder.name)} size={32} />
              <div>
                <div className="text-[13px] font-semibold text-ink">{selectedAgent.stakeholder.name}</div>
                <div className="text-[10px] text-muted">{selectedAgent.stakeholder.role}</div>
              </div>
              <button
                className="ml-auto cursor-pointer text-[14px] text-muted hover:text-ink"
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </button>
            </div>

            {selectedAgent.socialPhysics && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Trust", value: selectedAgent.socialPhysics.trust, color: "#22c55e" },
                  { label: "Leverage", value: selectedAgent.socialPhysics.leverage, color: "#3b82f6" },
                  { label: "Tension", value: selectedAgent.socialPhysics.tension, color: "#f97316" },
                  { label: "Credibility", value: selectedAgent.socialPhysics.credibility, color: "#a855f7" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg bg-canvas p-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{m.label}</div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${m.value * 100}%`, background: m.color }}
                      />
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink">{Math.round(m.value * 100)}%</div>
                  </div>
                ))}
              </div>
            )}

            {selectedAgent.agentState?.emotion && (
              <div className="mb-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Emotions</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selectedAgent.agentState.emotion).map(([em, val]) => (
                    <span
                      key={em}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: `${EMOTION_COLORS[em] ?? "#666"}20`,
                        color: EMOTION_COLORS[em] ?? "#666",
                      }}
                    >
                      {em} {Math.round((val as number) * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Trust to others</div>
              {selectedAgent.trustTo.map((t) => (
                <div key={t.name} className="mb-1 flex items-center gap-2">
                  <span className="w-20 truncate text-[11px] text-ink">{t.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${t.trust * 100}%`,
                        background: t.trust > 0.6 ? "#22c55e" : t.trust > 0.3 ? "#a3a3a3" : "#ef4444",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[10px] text-muted">
                    {Math.round(t.trust * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Leaderboard leaderboard={simState?.leaderboard} nameMap={nameMap} />
        <CoalitionTracker coalitions={simState?.coalitions} nameMap={nameMap} />
      </div>
    </div>
  );
}

// ── Helpers ──
function lighten(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100)));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100)));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100)));
  return `rgb(${r},${g},${b})`;
}
