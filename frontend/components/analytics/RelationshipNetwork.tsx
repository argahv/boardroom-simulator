"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RelationshipNetworkData } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

type Props = { data: RelationshipNetworkData };

export function RelationshipNetworkSection({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 340, h: 340 });

  // Container sizing via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Valid node ID set for edge filtering + lookups
  const nodeIds = useMemo(
    () => new Set(data.nodes.map((n) => n.id)),
    [data.nodes],
  );

  // Transform edges → links for ForceGraph2D; filter dangling refs
  const graphData = useMemo(
    () => ({
      nodes: data.nodes,
      links: data.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ ...e, source: e.source, target: e.target })),
    }),
    [data.nodes, data.edges, nodeIds],
  );

  // Per-node average trust from connected edges
  const nodeAvgTrust = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const e of data.edges) {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
      for (const id of [e.source, e.target]) {
        const s = sums.get(id) ?? { total: 0, count: 0 };
        s.total += e.trust;
        s.count++;
        sums.set(id, s);
      }
    }
    const avgs = new Map<string, number>();
    for (const [id, s] of sums) avgs.set(id, s.total / s.count);
    return avgs;
  }, [data.edges, nodeIds]);

  // Node fill: green = high trust, yellow = medium, red = low
  const nodeColor = useCallback(
    (n: any) => {
      const t = nodeAvgTrust.get(n.id) ?? 0.5;
      if (t > 0.6) return "var(--color-success)";
      if (t > 0.3) return "var(--color-warning)";
      return "var(--color-error)";
    },
    [nodeAvgTrust],
  );

  // Node size proportional to sim_count (minimum 1)
  const nodeVal = useCallback((n: any) => Math.max(1, n.sim_count ?? 1), []);

  // Hover tooltip: name, sims, avg trust / fear / rivalry
  const nodeLabel = useCallback(
    (n: any) => {
      const connected = data.edges.filter(
        (e) =>
          (e.source === n.id || e.target === n.id) &&
          nodeIds.has(e.source) &&
          nodeIds.has(e.target),
      );
      const t = nodeAvgTrust.get(n.id) ?? 0.5;
      const f =
        connected.length > 0
          ? connected.reduce((s, e) => s + e.fear, 0) / connected.length
          : 0;
      const r =
        connected.length > 0
          ? connected.reduce((s, e) => s + e.rivalry, 0) / connected.length
          : 0;
      return [
        `<b>${n.name}</b>`,
        `Sims: ${n.sim_count ?? 0}`,
        `Trust: ${t.toFixed(2)}`,
        `Fear: ${f.toFixed(2)}`,
        `Rivalry: ${r.toFixed(2)}`,
      ].join("<br/>");
    },
    [data.edges, nodeAvgTrust, nodeIds],
  );

  // Link stroke: green = high trust, red = high rivalry, gray = neutral
  const linkColor = useCallback((l: any) => {
    if (l.trust > 0.5) return "var(--color-success)";
    if (l.rivalry > 0.5) return "var(--color-error)";
    return "var(--color-muted)";
  }, []);

  // Link thickness: trust [0,1] → width [0.5, 3]
  const linkWidth = useCallback((l: any) => 0.5 + l.trust * 2.5, []);

  // ── Empty state ──
  if (data.nodes.length < 2) {
    return (
      <div className="flex items-center justify-center h-[340px] text-sm text-muted">
        No relationship data
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-[340px]">
      {dims.w > 100 && dims.h > 100 && (
        <ForceGraph2D
          graphData={graphData}
          width={dims.w}
          height={dims.h}
          backgroundColor="transparent"
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeLabel={nodeLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
        />
      )}
    </div>
  );
}
