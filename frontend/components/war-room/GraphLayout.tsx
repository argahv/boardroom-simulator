"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { Turn } from "./TranscriptStream";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { CoalitionTracker } from "./CoalitionTracker";
import { RoomStatePanel } from "./RoomStatePanel";
import { Avatar, initialsFromName } from "@/components/Avatar";
import type { SimulationStateData } from "@/lib/use-simulation-state";

gsap.registerPlugin(useGSAP);

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

// ── Token color constants (design system values, static) ──
const TOKENS = {
  primary:     "#ed6f5c",
  error:       "#ba1a1a",
  success:     "#3d9e8c",
  warning:     "#c9952e",
  muted:       "#5a5448",
  ink:         "#15140f",
  onDark:      "#f7f3e8",
  onDarkSoft:  "#c4bdb0",
  chart1:      "#ed6f5c",
  chart2:      "#3d9e8c",
  chart3:      "#c9952e",
  chart4:      "#4f8bc9",
  chart5:      "#8b6f9e",
};

function lighten(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  if (isNaN(num)) return hex;
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100)));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100)));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100)));
  return `rgb(${r},${g},${b})`;
}

function stanceColor(stance: string): string {
  switch (stance) {
    case "champion":   return TOKENS.chart1;
    case "detractor":  return TOKENS.error;
    case "neutral":    return TOKENS.muted;
    case "moderator":  return TOKENS.chart2;
    case "wildcard":   return TOKENS.chart3;
    default:           return TOKENS.muted;
  }
}

function emotionColor(emotion: string): string {
  switch (emotion) {
    case "anger":     return TOKENS.error;
    case "fear":      return TOKENS.chart5;
    case "joy":       return TOKENS.success;
    case "shame":     return TOKENS.warning;
    case "surprise":  return TOKENS.chart4;
    default:          return TOKENS.muted;
  }
}

function trustColor(val: number): string {
  if (val > 0.6) return TOKENS.success;
  if (val > 0.3) return TOKENS.onDarkSoft;
  return TOKENS.error;
}

function hexToRgba(hex: string, alpha: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  if (isNaN(num)) return `rgba(128,128,128,${alpha})`;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

const VOTE_COLORS: Record<string, string> = {
  yes: "#6e7448",
  no: TOKENS.error,
  abstain: TOKENS.muted,
};

// Only champion/detractor carry colour on the badge; neutral, moderator and the rest read as muted.
const STANCE_BADGE: Record<string, string> = {
  champion: "bg-primary/15 text-primary",
  detractor: "bg-error-soft text-error",
  wildcard: "bg-accent-amber/20 text-ink",
};

const VOTE_CHIP: Record<string, string> = {
  yes: "bg-secondary/15 text-secondary",
  no: "bg-error-soft text-error",
  abstain: "bg-ink/10 text-muted",
};

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.12em]";

/** Each person's most recent ballot, keyed by agent id. */
function latestVotes(turns: Turn[], stakeholders: GraphStakeholder[]): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const t of turns) {
    if (t.kind !== "agent" || t.action_type !== "vote" || !t.vote) continue;
    const id = t.agent_id ?? stakeholders.find((s) => s.name === t.speaker)?.id;
    if (id) votes[id] = t.vote.toLowerCase();
  }
  return votes;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

// Where each node was last drawn. Graph data is rebuilt on every turn, and new node objects
// would otherwise restart from d3's tight spiral at the origin, piling the seats on each other.
const lastPos = new Map<string, { x: number; y: number }>();

function seedPosition(id: string, i: number, n: number): { x: number; y: number } {
  const known = lastPos.get(id);
  if (known) return known;
  const r = 35 + 10 * n;
  const a = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

const STANCE_LABELS: Record<string, string> = {
  champion: "Champion",
  detractor: "Detractor",
  neutral: "Neutral",
  moderator: "Moderator",
  wildcard: "Wildcard",
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
  departed: boolean;
  vote: string | null;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
  type: "exchange" | "trust";
  label?: string;
  /** Bends one of a two-way pair so both directions stay visible. */
  curvature?: number;
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
  const [graphReady, setGraphReady] = useState(false);

  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphAreaRef = useRef<HTMLDivElement>(null);
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

  // Mark graph as ready after first render for entrance animation
  useEffect(() => {
    if (dim.width > 0 && !graphReady) setGraphReady(true);
  }, [dim, graphReady]);

  // Entrance animation
  useGSAP(() => {
    if (!graphReady || !graphAreaRef.current) return;
    gsap.from(graphAreaRef.current, { opacity: 0, y: 16, duration: 0.4, ease: "power2.out", clearProps: "transform" });
  }, { dependencies: [graphReady], revertOnUpdate: true });

  // Spread the seats: d3's defaults (30-unit links, weak charge) overlap nodes this size.
  // A light pull to the centre keeps people nobody has addressed yet in view.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg?.d3Force) return;
    fg.d3Force("charge")?.strength(-160);
    fg.d3Force("link")?.distance(90);
    fg.d3Force("collide", forceCollide(34));
    fg.d3Force("x", forceX(0).strength(0.06));
    fg.d3Force("y", forceY(0).strength(0.06));
    fg.d3ReheatSimulation?.();
  }, [graphReady]);

  // System rows (room events) never take the floor.
  const speakerAgentId = useMemo(() => {
    if (!speakerId) return null;
    if (current?.kind === "agent" && current.agent_id) return current.agent_id;
    return stakeholders.find((s) => s.name === speakerId)?.id ?? null;
  }, [speakerId, current, stakeholders]);

  const votes = useMemo(() => latestVotes(turns, stakeholders), [turns, stakeholders]);
  const departed = useMemo(() => new Set(simState?.departed ?? []), [simState?.departed]);

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
        isSpeaking: s.id === speakerAgentId,
        credibility: sp?.credibility ?? 0.5,
        trust: sp?.trust ?? 0.5,
        leverage: sp?.leverage ?? 0.5,
        tension: sp?.tension ?? 0.3,
        dominantEmotion: dominant?.[0] ?? "neutral",
        departed: departed.has(s.id),
        vote: votes[s.id] ?? null,
      };
    },
    [simState, speakerAgentId, nameMap, departed, votes]
  );

  // Conversation graph: who addressed whom (speaker -> directed_at), not who spoke next.
  const convGraph = useMemo(() => {
    const nodes: GraphNode[] = stakeholders.map((s, i) => ({ ...enrichNode(s), ...seedPosition(s.id, i, stakeholders.length) }));
    const ids = new Set(stakeholders.map((s) => s.id));
    const resolve = (ref: string | null | undefined) =>
      !ref ? undefined : ids.has(ref) ? ref : stakeholders.find((s) => s.name === ref)?.id;
    const edges = new Map<string, { source: string; target: string; count: number }>();
    for (const t of turns) {
      if (t.kind !== "agent" || !t.directed_at) continue;
      const from = resolve(t.agent_id) ?? resolve(t.speaker);
      const to = resolve(t.directed_at);
      if (!from || !to || from === to) continue;
      const key = JSON.stringify([from, to]);
      const edge = edges.get(key) ?? { source: from, target: to, count: 0 };
      edge.count++;
      edges.set(key, edge);
    }
    const links: GraphLink[] = [...edges.values()].map((e) => ({
      source: e.source,
      target: e.target,
      value: e.count,
      type: "exchange" as const,
      label: `${e.count}x`,
      curvature: edges.has(JSON.stringify([e.target, e.source])) ? 0.25 : 0,
    }));
    return { nodes, links };
  }, [stakeholders, turns, enrichNode]);

  // Trust relationship graph: mean of both directions; pairs with no recorded trust get no edge.
  const trustMatrix = simState?.trustMatrix;
  const relGraph = useMemo(() => {
    const tm = trustMatrix ?? {};
    const nodes: GraphNode[] = stakeholders.map((s, i) => ({ ...enrichNode(s), ...seedPosition(s.id, i, stakeholders.length) }));
    const links: GraphLink[] = [];
    for (const a of stakeholders) {
      for (const b of stakeholders) {
        if (a.id >= b.id) continue;
        const known = [tm[a.id]?.[b.id], tm[b.id]?.[a.id]].filter(
          (v): v is number => typeof v === "number" && Number.isFinite(v)
        );
        if (known.length === 0) continue;
        const trust = known.reduce((sum, v) => sum + v, 0) / known.length;
        links.push({ source: a.id, target: b.id, value: trust, type: "trust" as const, label: `${Math.round(trust * 100)}%` });
      }
    }
    return { nodes, links };
  }, [stakeholders, trustMatrix, enrichNode]);

  const graphData = mode === "conversation" ? convGraph : relGraph;

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Typing in the inject box (or any field) must keep its own cursor keys.
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      if (e.key === "Escape") { setSelectedNode(null); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const nodes = graphData.nodes as (GraphNode & { x?: number; y?: number })[];
        if (nodes.length === 0) return;
        const idx = selectedNode ? nodes.findIndex((n) => n.id === selectedNode) : -1;
        const next = e.key === "ArrowRight"
          ? (idx + 1) % nodes.length
          : (idx <= 0 ? nodes.length - 1 : idx - 1);
        setSelectedNode(nodes[next].id);
        if (fgRef.current && nodes[next]?.x != null) {
          fgRef.current.centerAt(nodes[next].x, nodes[next].y, 400);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedNode, graphData]);

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

  // Follow the speaker, but only pan when they are out of view: panning to every speaker
  // pushes the rest of the (fitted) room off a narrow canvas.
  useEffect(() => {
    if (speakerAgentId && fgRef.current && !selectedNode) {
      const n = (graphData.nodes as any[]).find((n: any) => n.id === speakerAgentId);
      if (n?.x == null) return;
      const p = fgRef.current.graph2ScreenCoords?.(n.x, n.y);
      const m = 40;
      const inView = p && p.x >= m && p.y >= m && p.x <= dim.width - m && p.y <= dim.height - m;
      if (!inView) fgRef.current.centerAt(n.x, n.y, 600);
    }
  }, [speakerAgentId, mode, selectedNode]);

  // Fit the room to the canvas once the first layout settles, and again when the canvas resizes.
  const fittedRef = useRef(false);
  const fitRoom = useCallback(() => {
    const fg = fgRef.current;
    if (!fg?.zoomToFit) return;
    fg.zoomToFit(0, 80);
    // A small room would otherwise be blown up to the zoom limit.
    if (fg.zoom() > 3) fg.zoom(3, 0);
    fittedRef.current = true;
  }, []);
  useEffect(() => {
    if (fittedRef.current) fitRoom();
  }, [dim.width, dim.height, fitRoom]);
  // A live run rebuilds the graph every turn, which restarts the engine before it can stop.
  useEffect(() => {
    if (!graphReady) return;
    const t = setTimeout(() => { if (!fittedRef.current) fitRoom(); }, 1500);
    return () => clearTimeout(t);
  }, [graphReady, fitRoom]);

  // ── Node canvas renderer ──
  const nodeCanvas = useCallback(
    (rawNode: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as GraphNode & { x: number; y: number; vx?: number; vy?: number };
      if (!isFinite(node.x) || !isFinite(node.y)) return;
      lastPos.set(node.id, { x: node.x, y: node.y });

      const isHighlighted = !highlightIds || highlightIds.has(node.id);
      const isSelected = node.id === selectedNode;
      const isHovered = node.id === hoveredNode;
      const alpha = (isHighlighted ? 1 : 0.15) * (node.departed && !node.isSpeaking ? 0.5 : 1);

      const baseR = 8 + node.credibility * 14;
      const r = node.isSpeaking ? baseR * 1.12 : baseR;
      if (!isFinite(r) || r <= 0) return;
      const fontSize = Math.max(9, Math.min(13, r * 0.7)) / globalScale;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── Coral glow for selected/speaking ──
      if (isSelected || node.isSpeaking) {
        const glowR = r + 14;
        const grad = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR);
        grad.addColorStop(0, hexToRgba(TOKENS.primary, 0.35));
        grad.addColorStop(1, hexToRgba(TOKENS.primary, 0));
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // ── Emotion ring ──
      if (node.dominantEmotion && node.dominantEmotion !== "neutral") {
        const emColor = emotionColor(node.dominantEmotion);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = emColor;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.globalAlpha = alpha * 0.7;
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }

      // ── Speaking pulse ring ──
      if (node.isSpeaking) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
        ctx.strokeStyle = hexToRgba(TOKENS.onDark, 0.35);
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // ── Node body ──
      const baseColor = stanceColor(node.stance);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 0, node.x, node.y, r);
      grad.addColorStop(0, lighten(baseColor, 45));
      grad.addColorStop(1, baseColor);
      ctx.fillStyle = grad;
      ctx.fill();

      // ── Border (dashed once they have walked out) ──
      ctx.strokeStyle = isSelected ? hexToRgba(TOKENS.onDark, 0.8) : hexToRgba(TOKENS.onDark, 0.25);
      ctx.lineWidth = (isSelected ? 2.5 : 1.5) / globalScale;
      if (node.departed) ctx.setLineDash([3 / globalScale, 2 / globalScale]);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Inner dot for speaking ──
      if (node.isSpeaking) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.35, 0, 2 * Math.PI);
        ctx.fillStyle = hexToRgba(TOKENS.onDark, 0.9);
        ctx.fill();
      }

      // ── Label with background pill ──
      const labelY = node.y + r + 4 / globalScale;
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Measure label width for background pill
      const labelMetrics = ctx.measureText(node.name);
      const labelW = labelMetrics.width + 10 / globalScale;
      const labelH = fontSize * 1.4;

      // Draw background pill
      ctx.fillStyle = hexToRgba(TOKENS.ink, 0.55);
      const rx = labelW / 2 + 3 / globalScale;
      ctx.beginPath();
      ctx.roundRect(node.x - rx, labelY - 2 / globalScale, rx * 2, labelH + 4 / globalScale, 4 / globalScale);
      ctx.fill();

      // Label text — always bright white for readability
      ctx.fillStyle = TOKENS.onDark;
      ctx.fillText(node.name, node.x, labelY);

      // Subtitle with its own pill: "Walked out" once departed, else the role for speaking/selected
      const subtitle = node.departed ? "Walked out" : node.isSpeaking || isSelected ? node.role : null;
      if (subtitle) {
        // fontSize is in graph units (already divided by zoom), so the floor must be too.
        const subSize = Math.max(8 / globalScale, fontSize * 0.75);
        ctx.font = `${node.departed ? "700 " : ""}${subSize}px Inter, sans-serif`;
        const subY = labelY + labelH + 4 / globalScale;
        const subMetrics = ctx.measureText(subtitle);
        const subW = subMetrics.width + 8 / globalScale;
        const subH = subSize * 1.3;
        ctx.fillStyle = hexToRgba(TOKENS.ink, 0.45);
        const srx = subW / 2 + 2 / globalScale;
        ctx.beginPath();
        ctx.roundRect(node.x - srx, subY - 1 / globalScale, srx * 2, subH + 2 / globalScale, 3 / globalScale);
        ctx.fill();
        ctx.fillStyle = node.departed ? TOKENS.warning : hexToRgba(TOKENS.onDark, 0.7);
        ctx.fillText(subtitle, node.x, subY);
      }

      // ── Vote chip above the node ──
      if (node.vote) {
        const chipFont = fontSize * 0.8;
        const text = node.vote.toUpperCase();
        ctx.font = `700 ${chipFont}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const chipW = ctx.measureText(text).width + 8 / globalScale;
        const chipH = chipFont * 1.5;
        const chipY = node.y - r - 6 / globalScale - chipH / 2;
        ctx.fillStyle = VOTE_COLORS[node.vote] ?? TOKENS.muted;
        ctx.beginPath();
        ctx.roundRect(node.x - chipW / 2, chipY - chipH / 2, chipW, chipH, chipH / 2);
        ctx.fill();
        ctx.fillStyle = TOKENS.onDark;
        ctx.fillText(text, node.x, chipY);
      }

      // ── Credibility score badge ──
      if (globalScale > 0.8) {
        const score = Math.round(node.credibility * 100);
        ctx.font = `700 ${Math.max(7, 9 / globalScale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(TOKENS.onDark, 0.9);
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
          if (link.value > 0.6) return hexToRgba(TOKENS.success, 0.5);
          if (link.value > 0.3) return hexToRgba(TOKENS.onDarkSoft, 0.35);
          return hexToRgba(TOKENS.error, 0.5);
        }
        return hexToRgba(TOKENS.onDark, Math.min(0.12 + link.value * 0.06, 0.35));
      }
      const sid = typeof link.source === "string" ? link.source : link.source?.id;
      const tid = typeof link.target === "string" ? link.target : link.target?.id;
      const bothHighlighted = highlightIds.has(sid) && highlightIds.has(tid);
      if (!bothHighlighted) return hexToRgba(TOKENS.onDark, 0.05);
      if (link.type === "trust") {
        if (link.value > 0.6) return hexToRgba(TOKENS.success, 0.7);
        if (link.value > 0.3) return hexToRgba(TOKENS.onDarkSoft, 0.5);
        return hexToRgba(TOKENS.error, 0.7);
      }
      return hexToRgba(TOKENS.onDark, 0.4);
    },
    [highlightIds]
  );

  const linkWidth = useCallback(
    (link: any) => {
      if (!highlightIds) {
        if (link.type === "trust") return 0.5 + link.value * 2.5;
        return 0.3 + link.value * 0.4;
      }
      const sid = typeof link.source === "string" ? link.source : link.source?.id;
      const tid = typeof link.target === "string" ? link.target : link.target?.id;
      if (!highlightIds.has(sid) || !highlightIds.has(tid)) return 0;
      if (link.type === "trust") return 0.8 + link.value * 3.5;
      return 0.5 + link.value * 0.6;
    },
    [highlightIds]
  );

  // ── Hover handlers ──
  const handleNodeHover = useCallback((rawNode: any | null) => {
    if (!rawNode) { setHoveredNode(null); setTooltip(null); return; }
    const node = rawNode as GraphNode;
    setHoveredNode(node.id);
    // Node x/y are graph coordinates; the tooltip is placed in container pixels.
    const screen = fgRef.current?.graph2ScreenCoords?.(rawNode.x, rawNode.y) ?? { x: rawNode.x, y: rawNode.y };
    setTooltip({ x: screen.x, y: screen.y, node });
  }, []);

  const handleNodeClick = useCallback((rawNode: any) => {
    const node = rawNode as GraphNode;
    setSelectedNode((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleBackgroundClick = useCallback(() => { setSelectedNode(null); }, []);

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
      .map((st) => ({ name: nameMap?.[st.id] ?? st.name, trust: tm[selectedNode]?.[st.id] }))
      .filter((t): t is { name: string; trust: number } => typeof t.trust === "number" && Number.isFinite(t.trust))
      .sort((a, b) => b.trust - a.trust);
    return {
      stakeholder: s,
      socialPhysics: sp,
      agentState: ast,
      trustTo,
      departed: departed.has(selectedNode),
      vote: votes[selectedNode] ?? null,
    };
  }, [selectedNode, stakeholders, simState, nameMap, departed, votes]);

  return (
    <div
      ref={graphAreaRef}
      className="grid min-h-[calc(100vh-220px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {/* ── Top bar: mode toggle + legend ── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 self-start rounded-lg border border-hairline bg-canvas p-0.5">
            <button className={TAB_CLS(mode === "conversation")} onClick={() => setMode("conversation")}>
              Conversation
            </button>
            <button className={TAB_CLS(mode === "relationships")} onClick={() => setMode("relationships")}>
              Trust
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
            {["champion","detractor","neutral","moderator","wildcard"].map((stance) => (
              <span key={stance} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: stanceColor(stance) }} />
                {STANCE_LABELS[stance] ?? stance}
              </span>
            ))}
            <span className="flex items-center gap-1 sm:ml-2">
              <span className="h-[2px] w-3 rounded" style={{ background: hexToRgba(TOKENS.success, 0.6) }} />
              trust &gt;60%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-[2px] w-3 rounded" style={{ background: hexToRgba(TOKENS.error, 0.6) }} />
              trust &lt;30%
            </span>
          </div>
        </div>

        {/* ── Force graph ── */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-hairline bg-surface-dark transition-all duration-300"
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
            linkCurvature="curvature"
            linkDirectionalParticles={mode === "conversation" ? 2 : 0}
            linkDirectionalParticleWidth={2.5}
            linkDirectionalParticleSpeed={0.012}
            linkDirectionalParticleColor={() => hexToRgba(TOKENS.primary, 0.6)}
            d3VelocityDecay={0.28}
            d3AlphaDecay={0.015}
            cooldownTime={2000}
            onEngineStop={() => { if (!fittedRef.current) fitRoom(); }}
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
              className="pointer-events-none absolute z-50 rounded-xl border border-hairline/30 bg-ink/95 px-3 py-2 shadow-xl backdrop-blur-sm"
              style={{
                left: Math.max(8, Math.min(tooltip.x + 16, dim.width - 200)),
                top: Math.max(tooltip.y - 60, 8),
                minWidth: 170,
              }}
            >
              <div className="flex items-center gap-2">
                <Avatar initials={initialsFromName(tooltip.node.name)} size={22} />
                <div>
                  <div className="text-[12px] font-semibold text-on-dark">{tooltip.node.name}</div>
                  <div className="text-[10px] text-on-dark-soft">{tooltip.node.role}</div>
                </div>
              </div>
              <div className="mt-1.5 flex gap-2 text-[10px] text-on-dark-soft">
                <span>Trust <span className="font-mono text-on-dark/80">{Math.round(tooltip.node.trust * 100)}%</span></span>
                <span>Cred <span className="font-mono text-on-dark/80">{Math.round(tooltip.node.credibility * 100)}</span></span>
                <span>Tense <span className="font-mono text-on-dark/80">{Math.round(tooltip.node.tension * 100)}</span></span>
              </div>
              {(tooltip.node.departed || tooltip.node.vote) && (
                <div className="mt-1 flex gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  {tooltip.node.departed && <span className="text-warning">Walked out</span>}
                  {tooltip.node.vote && <span className="text-on-dark">Voted {tooltip.node.vote}</span>}
                </div>
              )}
              {tooltip.node.dominantEmotion && tooltip.node.dominantEmotion !== "neutral" && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-on-dark-soft">
                  <span>Emotion:</span>
                  <span className="font-semibold capitalize" style={{ color: emotionColor(tooltip.node.dominantEmotion) }}>
                    {tooltip.node.dominantEmotion}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Watermark / mode indicator ── */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-hairline/20 bg-ink/40 px-3 py-1 text-[10px] text-on-dark-soft backdrop-blur-sm">
            {mode === "conversation" ? "Who addressed whom · particles show direction" : "Trust relationships · edge width = mutual trust"}
            {selectedNode && " · click node or Esc to deselect"}
            <span className="ml-2 hidden text-on-dark-soft/50 sm:inline">← → navigates</span>
          </div>
        </div>

        <ConflictTimeline turn={turn} totalTurns={totalTurns} simState={simState} />
        <EventLog events={eventLog} />
      </div>

      {/* ── Right sidebar ── */}
      <div className="flex min-w-0 flex-col gap-[14px]">
        {/* Agent detail panel when selected */}
        {selectedAgent && (
          <div className="rounded-xl border border-hairline bg-surface-card p-[18px] transition-all duration-300">
            <div className="mb-3 flex items-center gap-2">
              <Avatar initials={initialsFromName(selectedAgent.stakeholder.name)} size={32} accent={stanceColor(selectedAgent.stakeholder.stance)} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{selectedAgent.stakeholder.name}</div>
                <div className="text-[10px] text-muted">{selectedAgent.stakeholder.role}</div>
              </div>
              <button className="ml-auto cursor-pointer text-[14px] text-muted hover:text-ink transition-colors" onClick={() => setSelectedNode(null)} aria-label="Deselect">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className={`${CHIP} ${STANCE_BADGE[selectedAgent.stakeholder.stance] ?? "bg-ink/10 text-muted"}`}>
                {selectedAgent.stakeholder.stance}
              </span>
              {selectedAgent.departed && (
                <span className={`${CHIP} bg-accent-amber/20 text-ink`} title="Left the room before the end">
                  <span className="material-symbols-outlined text-[12px]" aria-hidden>logout</span>
                  Walked out
                </span>
              )}
              {selectedAgent.vote && (
                <span className={`${CHIP} ${VOTE_CHIP[selectedAgent.vote] ?? VOTE_CHIP.abstain}`}>Voted {selectedAgent.vote}</span>
              )}
            </div>

            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Social Physics</div>
            {selectedAgent.socialPhysics && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Trust", value: selectedAgent.socialPhysics.trust, color: "var(--color-success)" },
                  { label: "Leverage", value: selectedAgent.socialPhysics.leverage, color: "var(--color-chart-4)" },
                  { label: "Tension", value: selectedAgent.socialPhysics.tension, color: "var(--color-chart-3)" },
                  { label: "Credibility", value: selectedAgent.socialPhysics.credibility, color: "var(--color-chart-5)" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg bg-canvas p-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{m.label}</div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.value * 100}%`, background: m.color }} />
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
                  {Object.entries(selectedAgent.agentState.emotion).map(([em, val]) => {
                    const col = emotionColor(em);
                    return (
                      <span key={em} className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ background: hexToRgba(col, 0.12), color: col }}>
                        {em} {Math.round((val as number) * 100)}%
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Trust to others</div>
              {selectedAgent.trustTo.length === 0 && (
                <span className="text-[11px] italic text-muted">No trust readings yet.</span>
              )}
              {selectedAgent.trustTo.map((t) => {
                const barColor = trustColor(t.trust);
                return (
                  <div key={t.name} className="mb-1 flex items-center gap-2">
                    <span className="w-20 truncate text-[11px] text-ink">{t.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${t.trust * 100}%`, background: barColor }} />
                    </div>
                    <span className="w-8 text-right font-mono text-[10px] text-muted">{Math.round(t.trust * 100)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <RoomStatePanel simState={simState} nameMap={nameMap} focusAgentId={selectedNode ?? speakerAgentId} />
        <Leaderboard leaderboard={simState?.leaderboard} nameMap={nameMap} />
        <CoalitionTracker coalitions={simState?.coalitions} nameMap={nameMap} />
      </div>
    </div>
  );
}
