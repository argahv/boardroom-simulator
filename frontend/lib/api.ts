import type {
  JobResponse,
  Postmortem,
  SimulationCreate,
  SimulationState,
  Stakeholder,
  StreamEvent,
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

type LibraryResponse = {
  default_library: Stakeholder[];
  partnership_defaults: Stakeholder[];
};

export const fetchLibrary = async (): Promise<Stakeholder[]> => {
  const data = await request<LibraryResponse>("/library");
  const merged = new Map<string, Stakeholder>();
  for (const stakeholder of [...data.partnership_defaults, ...data.default_library]) {
    merged.set(stakeholder.id, stakeholder);
  }
  return Array.from(merged.values());
};

export const fetchStakeholders = () =>
  request<Stakeholder[]>("/api/stakeholders");

export const createStakeholder = (persona: Stakeholder) =>
  request<Stakeholder>("/api/stakeholders", {
    method: "POST",
    body: JSON.stringify(persona),
  });

export const updateStakeholder = (id: string, persona: Stakeholder) =>
  request<Stakeholder>(`/api/stakeholders/${id}`, {
    method: "PUT",
    body: JSON.stringify(persona),
  });

export const deleteStakeholder = (id: string) =>
  request<void>(`/api/stakeholders/${id}`, {
    method: "DELETE",
  });

export const createSimulation = (payload: SimulationCreate) =>
  request<SimulationState>("/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchSimulations = () =>
  request<SimulationState[]>("/simulations");

export const fetchSimulation = (simulationId: string) =>
  request<SimulationState>(`/simulations/${simulationId}`);

export const runSimulation = (simulationId: string, maxTurns?: number) =>
  request<SimulationState>(`/simulations/${simulationId}/run`, {
    method: "POST",
    body: JSON.stringify({ max_turns: maxTurns ?? null }),
  });

export const fetchPostmortem = (simulationId: string) =>
  request<Postmortem>(`/simulations/${simulationId}/postmortem`, {
    method: "POST",
  });

export const runSimulationAsync = (simulationId: string, maxTurns?: number) =>
  request<JobResponse>(`/simulations/${simulationId}/run-async`, {
    method: "POST",
    body: JSON.stringify({ max_turns: maxTurns ?? null }),
  });

export const createPostmortemAsync = (simulationId: string) =>
  request<JobResponse>(`/simulations/${simulationId}/postmortem-async`, {
    method: "POST",
  });

export const fetchJob = (jobId: string) =>
  request<JobResponse>(`/jobs/${jobId}`);

export const fetchSimulationJobs = (simulationId: string) =>
  request<{ jobs: JobResponse["job"][] }>(`/simulations/${simulationId}/jobs`);

export const retryJob = (jobId: string) =>
  request<JobResponse>(`/jobs/${jobId}/retry`, {
    method: "POST",
  });

/**
 * Opens an SSE connection to stream simulation turns as they are generated.
 * Calls onEvent for each parsed event, onError on parse/network errors.
 * Returns an AbortController so the caller can cancel the stream.
 */
export function streamSimulation(
  simulationId: string,
  maxTurns: number,
  onEvent: (event: StreamEvent) => void,
  onError: (err: Error) => void,
  onDone: () => void
): AbortController {
  const controller = new AbortController();

  const run = async () => {
    try {
      const response = await fetch(
        `${API_URL}/simulations/${simulationId}/stream?max_turns=${maxTurns}`,
        { signal: controller.signal }
      );
      if (!response.ok || !response.body) {
        throw new Error(`Stream failed with ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE lines: "data: <json>\n\n"
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr) as StreamEvent;
              onEvent(event);
              if (event.type === "done") {
                onDone();
                return;
              }
            } catch {
              // malformed JSON, skip
            }
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  run();
  return controller;
}
