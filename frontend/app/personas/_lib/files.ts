import { uploadPersonaDocument } from "@/lib/api";

// Mirrors backend ALLOWED_CONTENT_TYPES / MAX_UPLOAD_SIZE_MB / PERSONA_DOCUMENT_LIMIT, so bad files
// are caught before the person waits on an upload.
export const ACCEPT = ".pdf,.docx,.txt";
export const MAX_MB = 25;
export const MAX_DOCS = 10;

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function checkFiles(incoming: FileList | File[], room = MAX_DOCS): { ok: File[]; problems: string[] } {
  const ok: File[] = [];
  const problems: string[] = [];
  for (const f of Array.from(incoming)) {
    if (!EXT_TYPES[ext(f.name)]) problems.push(`${f.name}: only PDF, Word (.docx) or text files`);
    else if (f.size === 0) problems.push(`${f.name}: the file is empty`);
    else if (f.size > MAX_MB * 1024 * 1024) problems.push(`${f.name}: bigger than ${MAX_MB} MB`);
    else if (ok.length >= room) problems.push(`${f.name}: a persona can hold ${MAX_DOCS} documents`);
    else ok.push(f);
  }
  return { ok, problems };
}

// Some browsers report "" (or a vendor type) for .docx/.txt; the server checks the declared type.
function withKnownType(f: File): File {
  const want = EXT_TYPES[ext(f.name)];
  return want && f.type !== want ? new File([f], f.name, { type: want }) : f;
}

/** The server's error text is JSON like {"detail": "..."}; show just the sentence. */
export function errorText(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const first = parsed.detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }
  } catch {
    // Not JSON: a network error message or plain text.
  }
  if (raw === "Failed to fetch") return "Can't reach the server. Is the backend running?";
  return raw.length > 200 ? fallback : raw;
}

export type UploadResult = { file: File; error?: string };

/** One at a time, so progress reads "2 of 3" and a failure names its file. */
export async function uploadFiles(
  personaId: string,
  files: File[],
  onProgress?: (done: number, current: File) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files[i]);
    try {
      await uploadPersonaDocument(personaId, withKnownType(files[i]));
      results.push({ file: files[i] });
    } catch (err) {
      results.push({ file: files[i], error: errorText(err, "Upload failed") });
    }
  }
  return results;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** For buttons and headings: "Rehearse with Dana", "What does Dana know about...?". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "them";
}
