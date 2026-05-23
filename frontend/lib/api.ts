import type {
  JobResponse,
  Postmortem,
  SimulationCreate,
  SimulationState,
  SimulationV2Config,
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

export const fetchStakeholdersV2 = () =>
  request<Record<string, unknown>[]>("/stakeholders");

export const createStakeholderV2 = (payload: Record<string, unknown>) =>
  request<Record<string, unknown>>("/stakeholders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateStakeholderV2 = (id: string, payload: Record<string, unknown>) =>
  request<Record<string, unknown>>(`/stakeholders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteStakeholderV2 = (id: string) =>
  request<void>(`/stakeholders/${id}`, {
    method: "DELETE",
  });

export const createSimulation = (payload: SimulationCreate) =>
  request<SimulationState>("/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createSimulationV2 = (payload: SimulationV2Config) =>
  request<{ simulation_id: string; config: SimulationV2Config; status: string }>("/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchSimulationsV2 = () =>
  request<{ simulation_id: string; subject: { name: string }; status: string; stakeholder_count: number; voltage: number }[]>("/simulations");

export const fetchSimulationV2 = (simulationId: string) =>
  request<{ config: SimulationV2Config; status: string }>(`/simulations/${simulationId}`);

export const postmortemV2 = (simulationId: string) =>
  request<Record<string, unknown>>(`/simulations/${simulationId}/postmortem`, {
    method: "POST",
  });

export const injectV2Turn = (simulationId: string, stakeholderId: string, content: string) =>
  request<Record<string, unknown>>(`/simulations/${simulationId}/inject`, {
    method: "POST",
    body: JSON.stringify({ stakeholder_id: stakeholderId, content }),
  });

export const streamSimulationV2 = (
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

export const fetchSimulations = () =>
  request<SimulationState[]>("/simulations");

export const fetchSimulation = (simulationId: string) =>
  request<SimulationState>(`/simulations/${simulationId}`);

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
  let retryCount = 0;
  const maxRetries = 3;
  let lastSuccessfulTurn = 0;

  const getBackoffDelay = (attempt: number) => {
    return Math.min(1000 * Math.pow(2, attempt), 10000);
  };

  const run = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const response = await fetch(
        `${API_URL}/simulations/${simulationId}/stream?max_turns=${maxTurns}&from_turn=${lastSuccessfulTurn}`,
        { signal: controller.signal }
      );
      if (!response.ok || !response.body) {
        throw new Error(`Stream failed with ${response.status}`);
      }
      
      retryCount = 0;
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
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr) as StreamEvent;
              onEvent(event);
              if (event.type === "turn") {
                lastSuccessfulTurn = event.turn.turn_index + 1;
              }
              if (event.type === "done") {
                clearTimeout(timeoutId);
                onDone();
                return;
              }
            } catch {
              throw new Error(`Failed to parse SSE event: ${jsonStr}`);
            }
          }
        }
      }
      clearTimeout(timeoutId);
      onDone();
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error).name === "AbortError") {
        return;
      }

      if (retryCount < maxRetries) {
        retryCount++;
        const delay = getBackoffDelay(retryCount - 1);
        setTimeout(run, delay);
      } else {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  run();
  return controller;
}
