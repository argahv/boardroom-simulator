"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdvancedPanel } from "@/components/room/AdvancedPanel";
import { Composer } from "@/components/room/Composer";
import { FactsEditor } from "@/components/room/FactsEditor";
import { LaunchDock } from "@/components/room/LaunchDock";
import { PeoplePicker } from "@/components/room/PeoplePicker";
import { RulesSentence } from "@/components/room/RulesSentence";
import { SeatDrawer } from "@/components/room/SeatDrawer";
import { SeatTable } from "@/components/room/SeatTable";
import { Sheet } from "@/components/room/Sheet";
import { StartFrom, type ResumeInfo } from "@/components/room/StartFrom";
import { FILE_ACCEPT, addFiles } from "@/components/room/files";
import {
  blankRoom,
  carryOver,
  configFromRoom,
  roomFromConfig,
  roomSummary,
  seatFromDraft,
  seatFromStakeholder,
  startBlocker,
  type Room,
  type Rules,
  type Seat,
} from "@/components/room/model";
import { Icon, LABEL, Spinner, formatBytes } from "@/components/room/ui";
import {
  createSimulation,
  createSimulationWithDocuments,
  createStakeholder,
  draftPersona,
  draftSimulation,
  draftSimulationFromFiles,
  fetchSimulation,
  fetchSimulations,
  fetchStakeholders,
  fetchTemplate,
  fetchTemplates,
  getStakeholder,
  type DraftSimulationResponse,
  type SimulationListItem,
  type TemplateListItem,
} from "@/lib/api";
import { emptyPersona, fromDraft, newSeatId, toStakeholder, withArchetype, type PersonaDraft } from "@/lib/persona";
import type { AgentStance, SimulationConfig, Stakeholder } from "@/lib/types";

type Param = string | string[] | undefined;
type SearchParams = { template?: Param; from?: Param; with?: Param };
type Phase = "landing" | "room";
type Snapshot = { phase: Phase; room: Room };
type Toast = { message: string; undo?: boolean };
type DraftInfo = { headline: string; notes: string[] };

const DRAFT_KEY = "vantage.room-draft.v1";
const HISTORY_LIMIT = 30;
const SKEPTIC_NAMES = ["Morgan Hale", "Priya Raman", "Theo Brandt", "Lena Fischer", "Omar Haddad"];

const first = (v: Param) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const errorText = (err: unknown, fallback: string) => {
  const raw = err instanceof Error ? err.message : "";
  try {
    const detail = JSON.parse(raw)?.detail;
    if (typeof detail === "string") return detail;
  } catch { /* not JSON */ }
  return raw && raw.length < 160 ? raw : fallback;
};

function titleFrom(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  const sentence = line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line;
  return sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence.replace(/[.!?]$/, "");
}

function readDraft(): { room: Room; at: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const r = parsed?.room;
    if (!r || typeof r.name !== "string" || !Array.isArray(r.seats) || !r.rules || !Array.isArray(r.facts)) return null;
    return { room: { ...blankRoom(), ...r, rules: { ...blankRoom().rules, ...r.rules } }, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
}

const STAGES = (withFiles: boolean) => [
  withFiles ? "Reading your documents…" : "Reading your brief…",
  "Casting the room…",
  "Giving everyone a reason to be there…",
  "Choosing how it ends…",
];

export default function NewSimulationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = use(searchParams);
  const templateSlug = first(params.template);
  const fromId = first(params.from);
  const withKey = first(params.with);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>(templateSlug || fromId ? "room" : "landing");
  const [room, setRoom] = useState<Room>(blankRoom);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(templateSlug || fromId ? "Setting up the room…" : null);
  const [draftInfo, setDraftInfo] = useState<DraftInfo | null>(null);

  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState("");
  const [building, setBuilding] = useState(false);
  const [stage, setStage] = useState(0);

  const [library, setLibrary] = useState<Stakeholder[] | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[] | null>(null);
  const [recent, setRecent] = useState<SimulationListItem[] | null>(null);
  const [resume, setResume] = useState<{ room: Room; at: number } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(0);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saveNew, setSaveNew] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launched = useRef(false);
  const docInput = useRef<HTMLInputElement>(null);

  const libraryIds = useMemo(() => new Set((library ?? []).map((s) => s.id)), [library]);
  const isLibrary = (seat: Seat) => !!seat.saved || libraryIds.has(seat.persona.id ?? "");
  const seatedIds = new Set(room.seats.map((s) => s.persona.id));
  const unseated = (library ?? []).filter((s) => !seatedIds.has(s.id));

  // ── Loading ────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    fetchStakeholders().then((l) => { if (alive) setLibrary(l); }).catch(() => { if (alive) setLibrary([]); });
    fetchTemplates().then((t) => { if (alive) setTemplates(t); }).catch(() => { if (alive) setTemplates([]); });
    fetchSimulations()
      .then((list) => {
        if (!alive) return;
        const newest = [...list].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        setRecent(newest.slice(0, 3));
      })
      .catch(() => { if (alive) setRecent([]); });
    // localStorage only exists in the browser, so the saved draft is read after mount.
    Promise.resolve().then(() => { if (alive) setResume(readDraft()); });
    return () => { alive = false; };
  }, []);

  // Deep links: ?template=<slug>, ?from=<simulationId>, ?with=<personaId>[,<personaId>]
  const linkRan = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${templateSlug}|${fromId}|${withKey}`;
    if (linkRan.current === signature) return;
    const firstRun = linkRan.current === null;
    linkRan.current = signature;
    if (!templateSlug && !fromId && !withKey) {
      // Arriving at a bare /simulate/new from a deep-linked one (the nav button) starts fresh.
      if (!firstRun) {
        Promise.resolve().then(() => {
          setPhase("landing");
          setRoom(blankRoom());
          setDraftInfo(null);
        });
      }
      return;
    }
    let alive = true;
    (async () => {
      const people: Seat[] = [];
      for (const id of withKey.split(",").map((s) => s.trim()).filter(Boolean)) {
        try { people.push(seatFromStakeholder(await getStakeholder(id))); } catch { /* deleted or unknown: skip */ }
      }
      let base: Room | null = null;
      let info: DraftInfo | null = null;
      let problem = "";
      if (templateSlug) {
        try {
          const t = await fetchTemplate(templateSlug);
          base = roomFromConfig(t.config);
          info = { headline: `Started from the “${t.name}” scenario. Change anything, then start.`, notes: [] };
        } catch {
          problem = "That scenario couldn't be loaded. Pick another below or describe the meeting.";
        }
      } else if (fromId) {
        try {
          const sim = await fetchSimulation(fromId);
          base = roomFromConfig(sim.config);
          info = { headline: "Same setup as before. Change what you want to try differently, then start.", notes: [] };
        } catch {
          problem = "That earlier meeting couldn't be loaded. Pick a starting point below.";
        }
      }
      if (!alive) return;
      if (base) {
        const known = new Set(base.seats.map((s) => s.persona.id));
        setRoom({ ...base, seats: [...base.seats, ...people.filter((p) => !known.has(p.persona.id))] });
        setPhase("room");
        setDraftInfo(info);
      } else {
        setRoom((r) => {
          const known = new Set(r.seats.map((s) => s.persona.id));
          return { ...r, seats: [...r.seats, ...people.filter((p) => !known.has(p.persona.id))] };
        });
        setPhase("landing");
        if (problem) showToast({ message: problem });
      }
      setLoadingLabel(null);
    })();
    return () => { alive = false; };
  }, [templateSlug, fromId, withKey]);

  // Unsent rooms survive a reload.
  useEffect(() => {
    if (phase !== "room" || launched.current || (!room.name.trim() && room.seats.length === 0)) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ room, at: Date.now() })); } catch { /* storage blocked */ }
    }, 500);
    return () => clearTimeout(t);
  }, [room, phase]);

  // Staged copy while a draft is being built.
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, 3)), 1800);
    return () => clearInterval(t);
  }, [building]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // ── Room changes ───────────────────────────────────────────────────

  function showToast(t: Toast) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), t.undo ? 7000 : 5000);
  }

  function flashSeats(keys: string[]) {
    if (!keys.length) return;
    setFlash(new Set(keys));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(new Set()), 2400);
  }

  /** Swap in a whole new room (draft, refine, template), remembering the old one for Undo. */
  function replaceRoom(next: Room, nextPhase: Phase = "room") {
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), { phase, room }]);
    setRoom(next);
    setPhase(nextPhase);
    setOpenKey(null);
    setStartError("");
  }

  function undo(): boolean {
    const last = history[history.length - 1];
    if (!last) return false;
    setHistory((h) => h.slice(0, -1));
    setRoom(last.room);
    setPhase(last.phase);
    setOpenKey(null);
    setSwapKey(null);
    setToast(null);
    return true;
  }

  const setRules = (patch: Partial<Rules>) => setRoom((r) => ({ ...r, rules: { ...r.rules, ...patch } }));
  const updatePersona = (key: string, patch: Partial<PersonaDraft>) =>
    setRoom((r) => ({ ...r, seats: r.seats.map((s) => (s.key === key ? { ...s, persona: { ...s.persona, ...patch } } : s)) }));

  function addSeat(seat: Seat, note?: string) {
    const keys = new Set(room.seats.map((s) => s.key));
    const safe = keys.has(seat.key) ? { ...seat, key: newSeatId() } : seat;
    setRoom((r) => ({ ...r, seats: [...r.seats, safe] }));
    setStartError("");
    flashSeats([safe.key]);
    if (note) showToast({ message: note });
  }

  function removeSeat(key: string) {
    const seat = room.seats.find((s) => s.key === key);
    if (!seat) return;
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), { phase, room }]);
    setRoom((r) => ({
      ...r,
      seats: r.seats.filter((s) => s.key !== key),
      meKey: r.meKey === key ? null : r.meKey,
      rules: r.rules.judgeKey === key ? { ...r.rules, judgeKey: null } : r.rules,
    }));
    if (openKey === key) setOpenKey(null);
    showToast({ message: `Removed ${seat.persona.name.trim() || "the empty seat"}.`, undo: true });
  }

  function swapSeat(key: string, incoming: Seat, note?: string) {
    const old = room.seats.find((s) => s.key === key);
    if (!old) return;
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), { phase, room }]);
    // The seat keeps its side, and the judge / "That's me" that point at it.
    const next: Seat = { ...incoming, key, persona: { ...incoming.persona, stance: old.persona.stance } };
    setRoom((r) => ({ ...r, seats: r.seats.map((s) => (s.key === key ? next : s)) }));
    setSwapKey(null);
    flashSeats([key]);
    showToast({ message: note ?? `Swapped ${old.persona.name || "them"} for ${incoming.persona.name}.`, undo: true });
  }

  async function addSkeptic() {
    setPending((n) => n + 1);
    const about = room.name.trim() ? `“${room.name.trim()}”` : "the proposal";
    let seat: Seat;
    try {
      const res = await draftPersona(`A sharp skeptic in the room who is against ${about}.${room.stakes.trim() ? ` What's at stake: ${room.stakes.trim()}` : ""}`);
      const p = fromDraft(res.persona);
      seat = seatFromDraft({ ...p, role: p.role || "Skeptic", stance: "detractor" }, res.guessed);
    } catch {
      const taken = new Set(room.seats.map((s) => s.persona.name));
      const name = SKEPTIC_NAMES.find((n) => !taken.has(n)) ?? "The Skeptic";
      seat = seatFromDraft(emptyPersona({
        name,
        role: "Skeptic",
        stance: "detractor",
        backstory: `Thinks ${about} is a mistake and wants proof before agreeing to anything.`,
        ...withArchetype("guardian"),
      }), ["name"]);
    } finally {
      setPending((n) => Math.max(0, n - 1));
    }
    addSeat(seat);
  }

  // ── Ways in ────────────────────────────────────────────────────────

  /** People seated before a way in was picked (?with=) come along into it. */
  const withPreSeated = (base: Room): Room => {
    const known = new Set(base.seats.map((s) => s.persona.id));
    const extra = room.seats.filter((s) => !known.has(s.persona.id));
    return extra.length ? { ...base, seats: [...base.seats, ...extra] } : base;
  };

  const markDrafted = (next: Room, source: DraftSimulationResponse["source"]): Room => {
    if (source === "template") return next;
    const guess = source === "llm" ? ["hidden_agenda", "personality"] : ["name"];
    return {
      ...next,
      seats: next.seats.map((s) => (isLibrary(s) || s.guessed ? s : { ...s, guessed: guess })),
    };
  };

  async function build() {
    const text = brief.trim();
    if ((!text && !files.length) || building) return;
    setBuilding(true);
    setStage(0);
    const personaIds = room.seats.filter(isLibrary).map((s) => s.persona.id ?? "").filter(Boolean);
    try {
      const res = files.length
        ? await draftSimulationFromFiles(text, personaIds, files)
        : await draftSimulation({ brief: text, ...(personaIds.length ? { persona_ids: personaIds } : {}) });
      const next = markDrafted(carryOver(room, roomFromConfig(res.config)), res.source);
      replaceRoom(next);
      setDraftInfo({
        headline: res.source === "llm"
          ? "Drafted from your brief. Check the people and how it ends, then start."
          : "Here's a first draft from your brief. Edit anything.",
        notes: res.notes,
      });
      flashSeats(next.seats.map((s) => s.key));
    } catch {
      replaceRoom({ ...room, name: room.name || titleFrom(text || files[0]?.name || ""), description: room.description || text });
      setDraftInfo({
        headline: "Couldn't reach the drafting service, so the room has only what you wrote. Seat people below or pick a scenario.",
        notes: [],
      });
    } finally {
      setBuilding(false);
    }
  }

  function loadTemplate(t: TemplateListItem) {
    replaceRoom(withPreSeated(roomFromConfig(t.config)));
    setDraftInfo({ headline: `Started from the “${t.name}” scenario. Change anything, then start.`, notes: [] });
  }

  async function loadRecent(s: SimulationListItem) {
    setBusyKey(`r:${s.simulation_id}`);
    try {
      const sim = await fetchSimulation(s.simulation_id);
      replaceRoom(withPreSeated(roomFromConfig(sim.config)));
      setDraftInfo({ headline: "Same setup as before. Change what you want to try differently, then start.", notes: [] });
    } catch (err) {
      showToast({ message: errorText(err, "That setup couldn't be loaded.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function playNow(key: string, getConfig: () => Promise<SimulationConfig>) {
    setBusyKey(key);
    try {
      const res = await createSimulation(await getConfig());
      launched.current = true;
      router.push(`/simulate/${res.simulation_id}`);
    } catch (err) {
      showToast({ message: errorText(err, "Couldn't start that meeting.") });
      setBusyKey(null);
    }
  }

  function startBlank() {
    const text = brief.trim();
    replaceRoom({ ...room, name: room.name || (text ? titleFrom(text) : ""), description: room.description || text });
    setDraftInfo(null);
  }

  function startOver() {
    replaceRoom(blankRoom(), "landing");
    setDraftInfo(null);
    setBrief("");
    setFiles([]);
    clearDraft();
    setResume(null);
    showToast({ message: "Cleared the room.", undo: true });
  }

  // ── Refine ─────────────────────────────────────────────────────────

  async function refine() {
    const instruction = refineText.trim();
    if (!instruction || refining) return;
    setRefining(true);
    try {
      const res = await draftSimulation({ current: configFromRoom(room), instruction });
      const next = carryOver(room, roomFromConfig(res.config));
      const changed = next.seats
        .filter((s) => {
          const old = room.seats.find((o) => o.key === s.key);
          return !old || JSON.stringify(old.persona) !== JSON.stringify(s.persona);
        })
        .map((s) => s.key);
      replaceRoom(next);
      flashSeats(changed);
      setRefineText("");
      showToast({ message: res.notes.length ? res.notes.join(" ") : "Done.", undo: true });
    } catch (err) {
      showToast({ message: `Couldn't make that change (${errorText(err, "the drafting service didn't answer")}). Try rewording it, or edit the room directly.` });
    } finally {
      setRefining(false);
    }
  }

  // ── Launch ─────────────────────────────────────────────────────────

  const blocker = phase === "landing"
    ? (room.seats.length ? "Describe the meeting, or pick a starting point" : "Describe the meeting, or pick a starting point below")
    : loadingLabel ? "Setting up the room…" : startBlocker(room);

  async function launch() {
    if (blocker || starting || phase !== "room") return;
    setStarting(true);
    setStartError("");
    let current = room;
    try {
      // New people join the library first, so this meeting's memory and growth accrue to them.
      if (saveNew) {
        let known: Set<string> | null = null;
        try {
          const list = await fetchStakeholders();
          setLibrary(list);
          known = new Set(list.map((s) => s.id));
        } catch { /* library unreachable: launch with ad hoc seats */ }
        const knownIds = known;
        if (knownIds) {
          const fresh = current.seats.filter((s) => !knownIds.has(s.persona.id ?? ""));
          const results = await Promise.allSettled(fresh.map((s) => createStakeholder(toStakeholder(s.persona))));
          const ids = new Map<string, string>();
          results.forEach((r, i) => {
            if (r.status === "fulfilled" && r.value?.id) ids.set(fresh[i].persona.id ?? "", r.value.id);
          });
          if (ids.size) {
            current = {
              ...current,
              seats: current.seats.map((s) => {
                const id = ids.get(s.persona.id ?? "");
                if (!id) return s;
                const persona = { ...s.persona, id };
                return { ...s, persona, saved: persona };
              }),
            };
            // Kept even if the launch fails, so a retry doesn't save them twice.
            setRoom(current);
          }
        }
      }
      const config = configFromRoom(current);
      const res = files.length ? await createSimulationWithDocuments(config, files) : await createSimulation(config);
      launched.current = true;
      clearDraft();
      const me = current.seats.find((s) => s.key === current.meKey);
      router.push(`/simulate/${res.simulation_id}${me?.persona.id ? `?seat=${encodeURIComponent(me.persona.id)}` : ""}`);
    } catch (err) {
      setStartError(`Couldn't start: ${errorText(err, "the server didn't answer")}`);
      setStarting(false);
    }
  }

  // Ctrl/⌘+Enter starts from anywhere (the composer claims it for Build); Ctrl/⌘+Z undoes room changes outside text fields.
  const keyActions = useRef({ launch, undo });
  useEffect(() => {
    keyActions.current = { launch, undo };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void keyActions.current.launch();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (keyActions.current.undo()) e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  const nudge = (() => {
    if (phase !== "room" || loadingLabel || room.seats.length === 0) return null;
    if (!room.seats.some((s) => s.persona.stance === "detractor")) {
      return (
        <span>
          Nobody&apos;s against this.{" "}
          <span className="font-semibold">
            <button
              type="button"
              onClick={() => void addSkeptic()}
              disabled={pending > 0}
              className="cursor-pointer text-primary underline underline-offset-2 hover:text-primary-active"
            >
              {pending > 0 ? "Adding…" : "Add a skeptic"}
            </button>
          </span>
        </span>
      );
    }
    if (room.seats.length > 7) return "Big rooms run slowly. Three to six people works best.";
    return null;
  })();

  const openSeat = room.seats.find((s) => s.key === openKey) ?? null;
  const swapSeatObj = room.seats.find((s) => s.key === swapKey) ?? null;
  const preSeated = phase === "landing" ? room.seats : [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        {phase === "landing" ? (
          <div className="mx-auto max-w-4xl space-y-8 pb-6">
            <div>
              <p className={LABEL}>New meeting</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-display text-ink sm:text-4xl">Who&apos;s in the room?</h1>
            </div>
            <Composer
              value={brief}
              onChange={setBrief}
              files={files}
              onFilesChange={setFiles}
              onBuild={() => void build()}
              busy={building ? STAGES(files.length > 0)[stage] : null}
              seated={preSeated}
              onUnseat={(key) => setRoom((r) => ({ ...r, seats: r.seats.filter((s) => s.key !== key) }))}
              autoFocus
            />
            {building ? (
              <div aria-hidden className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => <div key={i} className="anim-shimmer h-28 rounded-xl" />)}
              </div>
            ) : (
              <StartFrom
                templates={templates}
                recent={recent}
                resume={resume ? { name: resume.room.name, people: resume.room.seats.length, at: resume.at } satisfies ResumeInfo : null}
                busyKey={busyKey}
                onLoadTemplate={loadTemplate}
                onPlayTemplate={(t) => void playNow(`t:${t.slug}`, async () => t.config as unknown as SimulationConfig)}
                onLoadRecent={(s) => void loadRecent(s)}
                onPlayRecent={(s) => void playNow(`r:${s.simulation_id}`, async () => (await fetchSimulation(s.simulation_id)).config)}
                onResume={() => { if (resume) { replaceRoom(resume.room); setDraftInfo(null); } }}
                onBlank={startBlank}
              />
            )}
          </div>
        ) : loadingLabel ? (
          <div className="space-y-4 pb-6" aria-busy>
            <p className="flex items-center gap-2 text-sm text-muted" role="status"><Spinner /> {loadingLabel}</p>
            <div className="anim-shimmer h-12 w-2/3 rounded-xl" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="anim-shimmer h-28 rounded-xl" />)}
            </div>
          </div>
        ) : (
          <div className="space-y-7 pb-6">
            {/* Subject */}
            <header>
              <div className="flex items-center justify-between gap-3">
                <p className={LABEL}>New meeting</p>
                <span className="text-xs font-semibold">
                  <button
                    type="button"
                    onClick={startOver}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-muted transition hover:bg-ink/5 hover:text-ink"
                  >
                    <Icon name="restart_alt" className="text-[16px]" /> Start over
                  </button>
                </span>
              </div>
              {/* Textareas rather than inputs so a long title wraps on a phone instead of scrolling sideways. */}
              <div className="mt-1 font-display text-3xl font-semibold leading-tight tracking-display sm:text-4xl">
                <textarea
                  value={room.name}
                  onChange={(e) => setRoom((r) => ({ ...r, name: e.target.value.replace(/\n/g, " ") }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                  autoFocus={!room.name}
                  rows={1}
                  placeholder="Name the meeting"
                  aria-label="What the meeting is about"
                  maxLength={160}
                  className="block w-full min-w-0 resize-none border-b border-transparent bg-transparent text-ink outline-none transition [field-sizing:content] placeholder:text-muted/50 hover:border-hairline focus:border-primary"
                />
              </div>
              <div className="mt-2 flex items-baseline gap-2 text-base">
                <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-warning">At stake</span>
                <textarea
                  value={room.stakes}
                  onChange={(e) => setRoom((r) => ({ ...r, stakes: e.target.value.replace(/\n/g, " ") }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                  rows={1}
                  placeholder="What if it goes wrong?"
                  aria-label="What's at stake"
                  className="block min-w-0 flex-1 resize-none border-b border-transparent bg-transparent py-1 text-body-strong outline-none [field-sizing:content] placeholder:text-muted/60 hover:border-hairline focus:border-primary"
                />
              </div>
              <div className="mt-2 text-sm leading-relaxed">
                <textarea
                  value={room.description}
                  onChange={(e) => setRoom((r) => ({ ...r, description: e.target.value }))}
                  rows={2}
                  placeholder="Background everyone walks in with (optional)"
                  aria-label="Background"
                  className="block w-full resize-y rounded-xl border border-transparent bg-transparent px-0 py-1 text-muted outline-none [field-sizing:content] placeholder:text-muted/50 hover:border-hairline focus:border-primary focus:bg-surface-card focus:px-3"
                />
              </div>
              {draftInfo && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2.5 text-xs text-body-strong">
                  <Icon name="info" className="mt-px text-[16px] text-muted" />
                  <div className="min-w-0 flex-1">
                    <p>{draftInfo.headline}</p>
                    {draftInfo.notes.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                        {draftInfo.notes.map((n) => <li key={n}>{n}</li>)}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftInfo(null)}
                    aria-label="Dismiss"
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                </div>
              )}
            </header>

            {/* Facts + reference documents */}
            <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
              <FactsEditor facts={room.facts} onChange={(facts) => setRoom((r) => ({ ...r, facts }))} />
              <section aria-labelledby="docs-label">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 id="docs-label" className={LABEL}>Reference documents</h2>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {files.map((f) => (
                    <li key={`${f.name}-${f.size}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-hairline bg-surface-card py-1 pl-2.5 pr-1">
                      <Icon name="description" className="text-[16px] text-muted" />
                      <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                      <span className="shrink-0 text-muted">{formatBytes(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}
                        aria-label={`Remove ${f.name}`}
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                      >
                        <Icon name="close" className="text-[16px]" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-xs font-semibold">
                  <input
                    ref={docInput}
                    type="file"
                    multiple
                    accept={FILE_ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      if (e.target.files) {
                        const { files: next, problem } = addFiles(files, e.target.files);
                        setFiles(next);
                        setFileProblem(problem);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => docInput.current?.click()}
                    className="-ml-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2 text-muted transition hover:bg-ink/5 hover:text-ink"
                  >
                    <Icon name="attach_file" className="text-[16px]" />
                    {files.length ? "Attach another" : "Attach a deck, contract or notes"}
                  </button>
                </div>
                {fileProblem && <p className="mt-1 text-xs text-error">{fileProblem}</p>}
                <p className="mt-1 text-[11px] text-muted">Everyone can quote from these during the meeting.</p>
              </section>
            </div>

            <SeatTable
              room={room}
              library={unseated}
              isLibrary={isLibrary}
              flash={flash}
              pending={pending}
              openKey={openKey}
              onCycle={(key, stance: AgentStance) => updatePersona(key, { stance })}
              onOpen={setOpenKey}
              onToggleMe={(key) => setRoom((r) => ({ ...r, meKey: r.meKey === key ? null : key }))}
              onSwap={setSwapKey}
              onRemove={removeSeat}
              onAdd={addSeat}
            />

            <RulesSentence room={room} onChange={setRules} />

            <AdvancedPanel
              room={room}
              onRules={setRules}
              onExtra={(patch) => setRoom((r) => ({ ...r, extra: { ...r.extra, ...patch } }))}
              saveNew={saveNew}
              onSaveNew={setSaveNew}
            />
          </div>
        )}

        <LaunchDock
          blocker={blocker}
          summary={roomSummary(room)}
          nudge={nudge}
          starting={starting}
          startError={startError}
          onStart={() => void launch()}
          refine={phase === "room" && !loadingLabel ? { value: refineText, onChange: setRefineText, onSubmit: () => void refine(), busy: refining } : undefined}
          canUndo={history.length > 0}
          onUndo={() => void undo()}
        />
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 lg:bottom-24" role="status" aria-live="polite">
          <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl bg-surface-dark px-4 py-3 text-sm text-on-dark shadow-lg">
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.undo && history.length > 0 && (
              <span className="shrink-0 font-semibold">
                <button type="button" onClick={() => void undo()} className="cursor-pointer text-accent-amber underline-offset-2 hover:underline">
                  Undo
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-dark-soft hover:text-on-dark"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        </div>
      )}

      {openSeat && (
        <SeatDrawer
          key={openSeat.key}
          seat={openSeat}
          index={room.seats.indexOf(openSeat)}
          total={room.seats.length}
          isMe={room.meKey === openSeat.key}
          inLibrary={isLibrary(openSeat)}
          onChange={(patch) => updatePersona(openSeat.key, patch)}
          onSavedToLibrary={(saved) => setRoom((r) => ({ ...r, seats: r.seats.map((s) => (s.key === openSeat.key ? { ...s, saved } : s)) }))}
          onToggleMe={() => setRoom((r) => ({ ...r, meKey: r.meKey === openSeat.key ? null : openSeat.key }))}
          onSwap={() => { setOpenKey(null); setSwapKey(openSeat.key); }}
          onRemove={() => removeSeat(openSeat.key)}
          onClose={() => setOpenKey(null)}
        />
      )}

      {swapSeatObj && (
        <Sheet
          variant="center"
          title={`Swap ${swapSeatObj.persona.name.trim() || "this seat"}`}
          subtitle="The new person takes this seat and its side."
          onClose={() => setSwapKey(null)}
        >
          <PeoplePicker
            library={unseated}
            seats={room.seats}
            stance={swapSeatObj.persona.stance}
            autoFocus
            placeholder="Search your people, or describe someone"
            onPick={(seat, note) => swapSeat(swapSeatObj.key, seat, note)}
          />
        </Sheet>
      )}
    </AppShell>
  );
}
