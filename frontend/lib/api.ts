import type {
  DashboardAnalytics,
  DocumentMeta,
  EvolutionProposal,
  KnowledgeQueryResult,
  Postmortem,
  SimulationAnalytics,
  SimulationState,
  SimulationConfig,
  Stakeholder,
  StateSnapshotData,
  StateSnapshotEvent,
} from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const API_LOGGING = (process.env.NEXT_PUBLIC_API_LOGGING ?? "true").toLowerCase() === "true";

const logApi = (phase: "REQ" | "RES" | "ERR", data: Record<string, unknown>) => {
  if (!API_LOGGING) return;
  const payload = JSON.stringify(data);
  console.info(`[API:${phase}] ${payload}`);
};

const nowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

const genRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const requestId = genRequestId();
  const started = nowMs();
  const method = init?.method ?? "GET";
  logApi("REQ", { id: requestId, method, path });

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
      ...init?.headers,
    },
  });

  const elapsedMs = Math.round((nowMs() - started) * 100) / 100;

  if (!response.ok) {
    const message = await response.text();
    logApi("ERR", {
      id: requestId,
      method,
      path,
      status: response.status,
      elapsedMs,
      message,
    });
    throw new Error(message || `Request failed with ${response.status}`);
  }

  logApi("RES", {
    id: requestId,
    method,
    path,
    status: response.status,
    elapsedMs,
  });

  return response.json() as Promise<T>;
};

export const fetchStakeholders = () =>
  request<Stakeholder[]>("/stakeholders");

export const createStakeholder = (persona: Stakeholder) =>
  request<Stakeholder>("/stakeholders", {
    method: "POST",
    body: JSON.stringify(persona),
  });

export const updateStakeholder = (id: string, persona: Stakeholder) =>
  request<Stakeholder>(`/stakeholders/${id}`, {
    method: "PUT",
    body: JSON.stringify(persona),
  });

export const deleteStakeholder = (id: string) =>
  request<void>(`/stakeholders/${id}`, {
    method: "DELETE",
  });

// ── Persona Documents ──────────────────────────────────────────────

export async function uploadPersonaDocument(personaId: string, file: File): Promise<DocumentMeta> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/personas/${personaId}/documents`, {
    method: "POST",
    body: formData,
  });
  // Don't set Content-Type — browser sets multipart boundary automatically
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed with ${res.status}`);
  }
  return res.json();
}

export async function listPersonaDocuments(personaId: string): Promise<DocumentMeta[]> {
  const res = await fetch(`${API_URL}/personas/${personaId}/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function deletePersonaDocument(personaId: string, docId: string): Promise<void> {
  const res = await fetch(`${API_URL}/personas/${personaId}/documents/${docId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete document");
}

export async function queryPersonaKnowledge(personaId: string, query: string): Promise<KnowledgeQueryResult> {
  const res = await fetch(`${API_URL}/personas/${personaId}/query-knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("Knowledge query failed");
  return res.json();
}

// ── Templates ──────────────────────────────────────────────────────

export type TemplateListItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_duration: string;
  stakeholder_count: number;
  voltage: number;
  config: Record<string, unknown>;  // full SimulationConfig
};

export const fetchTemplates = () =>
  request<TemplateListItem[]>("/templates");

export const fetchTemplate = (templateId: string) =>
  request<TemplateListItem>(`/templates/${templateId}`);

// ── Agent Detail ────────────────────────────────────────────────────

export type AgentDetailResponse = {
  profile: Record<string, unknown>;
  simulations: Array<Record<string, unknown>>;
  recent_turns: Array<Record<string, unknown>>;
  memories: Array<Record<string, unknown>>;
  emotional_arc: Array<Record<string, unknown>>;
  goals: Array<{
    id: string;
    simulation_id: string;
    agent_id: string;
    turn_index: number;
    goal_text: string;
    priority: number;
    source: string;
    is_active: number;
  }>;
  strategies: Array<{
    simulation_id: string;
    subject_name: string;
    strategy_hints: Array<{ turn_index: number; hint: string }>;
  }>;
  hidden_motive_scores: Array<{
    simulation_id: string;
    subject_name: string;
    consistency_score: number;
  }>;
  stats: {
    total_simulations: number;
    total_turns: number;
    total_memories: number;
    stances: string[];
  };
};

export const fetchAgentDetail = (name: string) =>
  request<AgentDetailResponse>(`/agents/${encodeURIComponent(name)}/detail`);

// ── Persona Research ──────────────────────────────────────────────────

export type PersonaResearchEntry = {
  id: string;
  persona_id: string;
  query: string;
  results: string;
  created_at: string;
};

export type ResearchStatusResponse = {
  status: "none" | "running" | "complete";
  research_id: string | null;
  query?: string;
  count?: number;
};

export type ResearchConfigResponse = {
  tavily_configured: boolean;
};

export const fetchPersonaResearch = (personaId: string) =>
  request<PersonaResearchEntry[]>(`/personas/${personaId}/research-history`);

export const triggerPersonaResearch = (personaId: string, topic?: string) =>
  request<{ research_id: string; topic: string; status: string }>(`/personas/${personaId}/research`, {
    method: "POST",
    body: JSON.stringify({ topic }),
  });

export const fetchPersonaResearchStatus = (personaId: string) =>
  request<ResearchStatusResponse>(`/personas/${personaId}/research-status`);

export const fetchPersonaResearchConfig = (personaId: string) =>
  request<ResearchConfigResponse>(`/personas/${personaId}/research-config`);

// ── Evolution ─────────────────────────────────────────────────────────

export async function fetchPendingEvolutions(personaId: string): Promise<EvolutionProposal[]> {
  const res = await fetch(`${API_URL}/personas/${personaId}/evolutions/pending`);
  if (!res.ok) throw new Error("Failed to fetch evolutions");
  return res.json();
}

export async function approveEvolution(evolutionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/evolutions/${evolutionId}/approve`, { method: "POST" });
  if (!res.ok) throw new Error("Approve failed");
}

export async function rejectEvolution(evolutionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/evolutions/${evolutionId}/reject`, { method: "POST" });
  if (!res.ok) throw new Error("Reject failed");
}

export async function fetchEvolutionHistory(personaId: string): Promise<EvolutionProposal[]> {
  const res = await fetch(`${API_URL}/personas/${personaId}/evolutions`);
  if (!res.ok) throw new Error("Failed to fetch evolution history");
  return res.json();
}

export const createSimulation = (payload: SimulationConfig) =>
  request<{ simulation_id: string; config: SimulationConfig; status: string }>("/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createSimulationWithDocuments = async (
  config: SimulationConfig,
  files: File[]
): Promise<{ simulation_id: string; config: SimulationConfig; status: string; documents: DocumentMeta[] }> => {
  const formData = new FormData();
  formData.append("config", JSON.stringify(config));
  files.forEach((f) => formData.append("files", f));

  const response = await fetch(`${API_URL}/simulations/with-documents`, {
    method: "POST",
    body: formData,
    headers: { "X-Request-ID": genRequestId() },
  });
  // Note: Do NOT set Content-Type header — browser sets multipart boundary automatically
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed with ${response.status}`);
  }
  return response.json();
};

export type SimulationListItem = {
  simulation_id: string;
  subject: { name: string; description?: string };
  status: string;
  stakeholder_count: number;
  voltage: number;
  model_temperature?: string;
  created_at?: string;
};

export const fetchSimulations = () =>
  request<SimulationListItem[]>("/simulations");

export const fetchSimulation = (simulationId: string) =>
  request<{ config: SimulationConfig; status: string }>(`/simulations/${simulationId}`);

export const injectTurn = (simulationId: string, stakeholderId: string, content: string) =>
  request<Record<string, unknown>>(`/simulations/${simulationId}/inject`, {
    method: "POST",
    body: JSON.stringify({ stakeholder_id: stakeholderId, content }),
  });

export function exportSimulation(id: string): string {
  return `${API_URL}/simulations/${id}/export`;
}

export const fetchSimulationTurns = (simulationId: string) =>
  request<Array<Record<string, unknown>>>(`/simulations/${simulationId}/turns`);

export const fetchSimulationReplay = async (simulationId: string): Promise<StateSnapshotEvent[]> => {
  const res = await request<{ snapshots: Array<{ turn_index: number; data: StateSnapshotData }> }>(`/simulations/${simulationId}/replay`);
  return res.snapshots.map((s) => ({
    type: "state_snapshot" as const,
    turn_index: s.turn_index,
    data: s.data,
  }));
};

export const streamSimulation = (
  simulationId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onError: (err: Error) => void,
  onDone: () => void
): AbortController => {
  const controller = new AbortController();
  const run = async () => {
    try {
      const response = await fetch(`${API_URL}/simulations/${simulationId}/stream`, {
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Stream failed with ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6));
              onEvent(event);
              if (event.type === "done") { onDone(); return; }
            } catch { /* skip malformed */ }
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name !== "AbortError") onError(err instanceof Error ? err : new Error(String(err)));
    }
  };
  run();
  return controller;
};

export const fetchSimulationAnalytics = () =>
  request<SimulationAnalytics>("/simulations/analytics");

export const fetchAnalyticsDashboard = () =>
  request<DashboardAnalytics>("/analytics/dashboard");



export const injectHumanTurn = (
  simulationId: string,
  payload: {
    stakeholder_id: string;
    content: string;
    action_type?: string;
    directed_at?: string | null;
    coalition_with?: string | null;
  }
) =>
  request<SimulationState>(`/simulations/${simulationId}/inject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchPostmortem = (simulationId: string) =>
  request<Postmortem>(`/simulations/${simulationId}/postmortem`, {
    method: "POST",
  });


