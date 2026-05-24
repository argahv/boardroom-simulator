"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AgentCard, type AgentCardData } from "./agent-card";

/* ── Types ─────────────────────────────────────────── */

export type GraphNodeData = {
  id: string;
  label: string;
  stance: string;
  /** Optional extended data for tooltip */
  agent?: Partial<AgentCardData>;
};

export type GraphEdgeData = {
  from: string;
  to: string;
  trust: number; // 0–1
};

export type RelationshipGraphData = {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
};

interface Props {
  data: RelationshipGraphData;
  width?: number;
  height?: number;
  className?: string;
}

/* ── Stance → color ───────────────────────────────── */

const STANCE_FILL = (s: string) => {
  const map: Record<string, string> = {
    champion:  "#924a31",
    detractor: "#ba1a1a",
    neutral:   "#6c6a64",
    moderator: "#3d9e8c",
    wildcard:  "#e8a55a",
  };
  return map[s] ?? "#6c6a64";
};

const STANCE_STROKE = (s: string) => {
  const map: Record<string, string> = {
    champion:  "#c97a5f",
    detractor: "#d46060",
    neutral:   "#8a8882",
    moderator: "#6bbbaa",
    wildcard:  "#f0c080",
  };
  return map[s] ?? "#8a8882";
};

/* ── Simple force-directed layout ──────────────────── */

interface SimNode {
  id: string;
  label: string;
  stance: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function runForceSimulation(
  rawNodes: GraphNodeData[],
  rawEdges: GraphEdgeData[],
  w: number,
  h: number,
  iter = 150,
): SimNode[] {
  const cx = w / 2;
  const cy = h / 2;
  const idealEdge = Math.min(w, h) * 0.18;

  const nodes: SimNode[] = rawNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / rawNodes.length - Math.PI / 2;
    const r = Math.min(w, h) * 0.32;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 };
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const repK = Math.min(w, h) * 8;

  for (let t = 0; t < iter; t++) {
    const alpha = 1 - t / iter;

    // Center gravity
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.002 * alpha;
      n.vy += (cy - n.y) * 0.002 * alpha;
    }

    // Pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (repK / (dist * dist)) * alpha;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Spring attraction along edges
    for (const e of rawEdges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - idealEdge) * 0.008 * alpha;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Damping
    const damp = 0.75 + 0.2 * (1 - alpha);
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= damp;
      n.vy *= damp;
    }
  }

  // Clamp to bounds
  const pad = 50;
  for (const n of nodes) {
    n.x = Math.max(pad, Math.min(w - pad, n.x));
    n.y = Math.max(pad, Math.min(h - pad, n.y));
  }

  return nodes;
}

/* ── Edge opacity helpers ──────────────────────────── */

function edgeOpacity(trust: number): number {
  return 0.15 + trust * 0.5;
}

function edgeWidth(trust: number): number {
  return 0.5 + trust * 3;
}

/* ── Component ─────────────────────────────────────── */

export function RelationshipGraph({
  data,
  width = 600,
  height = 420,
  className = "",
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const simNodes = useMemo(
    () => runForceSimulation(data.nodes, data.edges, width, height),
    [data.nodes, data.edges, width, height],
  );

  const nodeMap = useMemo(() => new Map(simNodes.map((n) => [n.id, n])), [simNodes]);

  const hoveredNode = useMemo(
    () => (hovered ? data.nodes.find((n) => n.id === hovered) ?? null : null),
    [hovered, data.nodes],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-hairline bg-surface-card ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ display: "block" }}
        onMouseMove={handleMouseMove}
      >
        <defs>
          <pattern id="rg-dots" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.15" fill="var(--color-muted)" opacity="0.3" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#rg-dots)" />

        {/* Edges */}
        {data.edges.map((e) => {
          const a = nodeMap.get(e.from);
          const b = nodeMap.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--color-ink)"
              strokeWidth={edgeWidth(e.trust)}
              opacity={edgeOpacity(e.trust)}
            />
          );
        })}

        {/* Nodes */}
        {simNodes.map((n) => {
          const isHovered = n.id === hovered;
          const r = isHovered ? 24 : 18;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: "pointer", transition: "transform 150ms" }}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Glow ring on hover */}
              {isHovered && (
                <circle r={32} fill="none" stroke={STANCE_STROKE(n.stance)} strokeWidth={1.5} opacity={0.4} />
              )}
              {/* Node circle */}
              <circle
                r={r}
                fill={STANCE_FILL(n.stance)}
                stroke={STANCE_STROKE(n.stance)}
                strokeWidth={2}
                opacity={isHovered ? 1 : 0.85}
              />
              {/* Initials */}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize={isHovered ? 11 : 9}
                fontWeight={700}
                fontFamily="var(--font-sans), sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {n.label
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </text>
              {/* Label below */}
              <text
                y={r + 16}
                textAnchor="middle"
                fill="var(--color-ink)"
                fontSize={11}
                fontWeight={500}
                fontFamily="var(--font-sans), sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {n.label.length > 14 ? n.label.slice(0, 12) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: Math.min(tooltipPos.x + 16, width - 300),
            top: tooltipPos.y > height / 2 ? tooltipPos.y - 320 : tooltipPos.y + 16,
          }}
        >
          <AgentCard
            agent={{
              id: hoveredNode.id,
              name: hoveredNode.label,
              role: hoveredNode.agent?.role ?? "--",
              stance: hoveredNode.stance,
              confidence: hoveredNode.agent?.confidence ?? 50,
              certainty: hoveredNode.agent?.certainty ?? 50,
              emotions: hoveredNode.agent?.emotions ?? {
                anger: 0.3,
                fear: 0.3,
                joy: 0.3,
                shame: 0.3,
                surprise: 0.3,
              },
            }}
          />
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-full border border-hairline bg-canvas px-[14px] py-2"
        style={{ fontSize: 11, color: "var(--color-muted)" }}
      >
        {(["champion", "detractor", "neutral", "moderator"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-[5px] capitalize">
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: STANCE_FILL(s) }}
            />
            {s}
          </span>
        ))}
        <span className="inline-flex items-center gap-[5px]">
          <span
            className="inline-block"
            style={{ width: 18, height: 2, borderRadius: 1, background: "var(--color-ink)", opacity: 0.5 }}
          />
          trust
        </span>
      </div>
    </div>
  );
}
