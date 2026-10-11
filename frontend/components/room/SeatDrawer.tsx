"use client";

import { useState } from "react";
import { PersonaCard } from "@/components/PersonaCard";
import { patchStakeholder } from "@/lib/api";
import { toStakeholderPatch, type PersonaDraft } from "@/lib/persona";
import { seatEdited, type Seat } from "./model";
import { Sheet } from "./Sheet";
import { Icon, Spinner } from "./ui";

export type SeatDrawerProps = {
  seat: Seat;
  index: number;
  total: number;
  isMe: boolean;
  inLibrary: boolean;
  onChange: (patch: Partial<PersonaDraft>) => void;
  onSavedToLibrary: (saved: PersonaDraft) => void;
  onToggleMe: () => void;
  onSwap: () => void;
  onRemove: () => void;
  onClose: () => void;
};

/** The full card for one seat. Edits apply to this meeting; a library person can also be saved back. */
export function SeatDrawer({ seat, index, total, isMe, inLibrary, onChange, onSavedToLibrary, onToggleMe, onSwap, onRemove, onClose }: SeatDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const p = seat.persona;
  const first = p.name.trim().split(" ")[0] || "them";
  const edited = inLibrary && seatEdited(seat);

  const saveBack = async () => {
    if (!p.id) return;
    setSaving(true);
    setSaveMsg("");
    try {
      // Their side in this meeting stays a meeting choice; everything else is who they are.
      await patchStakeholder(p.id, toStakeholderPatch({
        name: p.name,
        role: p.role,
        backstory: p.backstory,
        hidden_agenda: p.hidden_agenda,
        archetype: p.archetype,
        personality: p.personality,
      }));
      onSavedToLibrary({ ...p });
      setSaveMsg(`Saved to ${first}'s profile.`);
    } catch (err) {
      setSaveMsg(err instanceof Error && err.message ? `Couldn't save: ${err.message.slice(0, 120)}` : "Couldn't save to the profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={p.name.trim() || "New person"}
      subtitle={
        <>
          Seat {index + 1} of {total}
          {inLibrary ? " · from your library. Changes here apply to this meeting." : " · saved to your people when the meeting starts."}
        </>
      }
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <button
            type="button"
            onClick={onToggleMe}
            aria-pressed={isMe}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 transition ${
              isMe ? "border-primary bg-primary text-white" : "border-hairline bg-surface-card text-ink hover:border-primary"
            }`}
          >
            <Icon name="person_pin" className="text-[18px]" />
            {isMe ? `You're playing ${first}` : "That's me"}
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3.5 text-ink transition hover:border-primary"
          >
            <Icon name="swap_horiz" className="text-[18px]" /> Swap
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-muted transition hover:bg-error-soft hover:text-error"
          >
            <Icon name="delete" className="text-[18px]" /> Remove
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex min-h-10 cursor-pointer items-center rounded-full bg-ink px-4 text-on-dark transition hover:bg-surface-dark-elevated"
          >
            Done
          </button>
        </div>
      }
    >
      <PersonaCard
        mode="edit"
        value={p}
        onChange={onChange}
        guessed={seat.guessed}
        autoFocusName={!p.name.trim()}
        error={p.name.trim() ? undefined : "Needs a name"}
      />
      {(edited || saveMsg) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2.5 text-xs">
          <span className="min-w-0 flex-1 text-muted" role="status">
            {saveMsg || `You changed ${first} for this meeting only.`}
          </span>
          {edited && (
            <span className="text-xs font-semibold">
              <button
                type="button"
                onClick={saveBack}
                disabled={saving}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-canvas px-3 text-ink transition hover:border-primary"
              >
                {saving ? <Spinner className="h-3 w-3" /> : <Icon name="bookmark_add" className="text-[16px]" />}
                Save to {first}&apos;s profile too
              </button>
            </span>
          )}
        </div>
      )}
      {isMe && (
        <p className="mt-3 text-xs text-muted">
          In the meeting you can speak as {first} at any time. The others won&apos;t wait for you, so jump in when you have something to say.
        </p>
      )}
    </Sheet>
  );
}
