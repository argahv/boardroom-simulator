// Same limits as the upload endpoints: PDF/DOCX/TXT, a handful of files, nothing huge.
export const MAX_FILES = 5;
export const MAX_FILE_MB = 25;
export const FILE_ACCEPT = ".pdf,.docx,.txt";
const ALLOWED = [".pdf", ".docx", ".txt"];

const ext = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** Adds what fits and says, in one line, what didn't. */
export function addFiles(existing: File[], incoming: FileList | File[]): { files: File[]; problem: string } {
  const out = [...existing];
  const skipped: string[] = [];
  for (const f of Array.from(incoming)) {
    if (out.some((x) => x.name === f.name && x.size === f.size)) continue;
    if (!ALLOWED.includes(ext(f.name))) { skipped.push(`${f.name} isn't a PDF, Word or text file`); continue; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) { skipped.push(`${f.name} is over ${MAX_FILE_MB} MB`); continue; }
    if (out.length >= MAX_FILES) { skipped.push(`only ${MAX_FILES} files fit`); break; }
    out.push(f);
  }
  return { files: out, problem: skipped.length ? `Skipped: ${skipped.join("; ")}.` : "" };
}
