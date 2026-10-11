"use client";

import { useState, type ReactNode } from "react";
import { PersonaCard } from "@/components/PersonaCard";
import type { AgentStance, Stakeholder } from "@/lib/types";
import { PeoplePicker } from "./PeoplePicker";
import { roomSummary, seatEdited, type Room, type Seat } from "./model";
import { Icon, IconButton, LABEL } from "./ui";

export type SeatTableProps = {
  room: Room;
  /** Library people not seated yet. */
  library: Stakeholder[];
  /** Seats whose ids are in the library, for the "From your library" badge. */
  isLibrary: (seat: Seat) => boolean;
  /** Seats that just changed (draft, refine), briefly highlighted. */
  flash: Set<string>;
  /** Placeholder cards while someone is being drafted. */
  pending: number;
  openKey: string | null;
  onCycle: (key: string, stance: AgentStance) => void;
  onOpen: (key: string) => void;
  onToggleMe: (key: string) => void;
  onSwap: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: (seat: Seat, note?: string) => void;
};

function EmptyChair({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li className="min-w-0 rounded-xl border border-dashed border-ink/20 bg-surface-card/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
        <Icon name="chair" className="text-[14px]" /> {label}
      </p>
      {children}
    </li>
  );
}

function AddChair(props: Pick<SeatTableProps, "library" | "room" | "onAdd">) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <li className="min-w-0 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full min-h-24 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink/20 text-muted transition hover:border-primary/50 hover:text-ink"
        >
          <Icon name="add" className="text-[18px]" /> Add someone
        </button>
      </li>
    );
  }
  return (
    <EmptyChair label="Empty chair">
      <PeoplePicker
        library={props.library}
        seats={props.room.seats}
        autoFocus
        onCancel={() => setOpen(false)}
        onPick={(seat, note) => { props.onAdd(seat, note); setOpen(false); }}
      />
    </EmptyChair>
  );
}

export function SeatTable(props: SeatTableProps) {
  const { room, flash, pending, openKey } = props;
  const needed = Math.max(0, 2 - room.seats.length - pending);

  const seatItems: ReactNode[] = room.seats.map((seat) => {
    const isMe = room.meKey === seat.key;
    const lib = props.isLibrary(seat);
    const name = seat.persona.name.trim() || "this seat";
    const badge = isMe
      ? <span className="font-semibold text-primary">That&apos;s you. You can speak as {seat.persona.name.split(" ")[0] || "them"}.</span>
      : lib
        ? <span>From your library{seat.simCount ? ` · ${seat.simCount} ${seat.simCount === 1 ? "meeting" : "meetings"}` : ""}{seatEdited(seat) ? " · edited for this meeting" : ""}</span>
        : seat.guessed?.length
          ? <span>Drafted for you. Open to check.</span>
          : <span>New. Saved to your people when you start.</span>;
    return (
      <li key={seat.key} className={`min-w-0 rounded-xl transition-shadow duration-500 ${flash.has(seat.key) ? "ring-2 ring-accent-amber ring-offset-2 ring-offset-canvas" : ""}`}>
        <PersonaCard
          mode="seat"
          value={seat.persona}
          onChange={(patch) => { if (patch.stance) props.onCycle(seat.key, patch.stance); }}
          onOpen={() => props.onOpen(seat.key)}
          highlight={isMe || openKey === seat.key}
          badge={badge}
          error={seat.persona.name.trim() ? undefined : "Needs a name"}
          className="h-full"
          actions={
            <>
              <IconButton
                icon="person_pin"
                label={isMe ? `You're playing ${name}. Undo` : `That's me: I'll play ${name}`}
                active={isMe}
                aria-pressed={isMe}
                onClick={() => props.onToggleMe(seat.key)}
              />
              <IconButton icon="swap_horiz" label={`Swap ${name} for someone else`} onClick={() => props.onSwap(seat.key)} />
              <IconButton icon="close" label={`Remove ${name}`} onClick={() => props.onRemove(seat.key)} />
            </>
          }
        />
      </li>
    );
  });

  const pendingItems: ReactNode[] = Array.from({ length: pending }, (_, i) => (
    <li key={`pending-${i}`} className="min-w-0" aria-hidden>
      <div className="anim-shimmer h-[7.5rem] rounded-xl" />
    </li>
  ));

  const chairItems: ReactNode[] = needed > 0
    ? Array.from({ length: needed }, (_, i) => (
        <EmptyChair key={`empty-${room.seats.length + i}`} label={room.seats.length + i === 0 ? "First chair" : "Empty chair"}>
          <PeoplePicker
            library={props.library}
            seats={room.seats}
            onPick={props.onAdd}
            placeholder={i === 0 && room.seats.length === 0 ? "Search your people, or type “Dana Okafor, CFO”" : undefined}
          />
        </EmptyChair>
      ))
    : [<AddChair key="add" library={props.library} room={room} onAdd={props.onAdd} />];

  const items = [...seatItems, ...pendingItems, ...chairItems];
  // Half the chairs on each side of the table.
  const top = items.slice(0, Math.ceil(items.length / 2));
  const bottom = items.slice(Math.ceil(items.length / 2));
  // Centred rows, so two cards in a three-wide row sit evenly around the table.
  const grid = "flex flex-wrap justify-center gap-3 [&>li]:w-full sm:[&>li]:w-[calc(50%-0.375rem)] lg:[&>li]:w-[calc((100%-1.5rem)/3)]";

  return (
    <section aria-labelledby="table-label" className="rounded-3xl border border-hairline bg-surface-container-low/60 p-3 sm:p-5">
      <h2 id="table-label" className="sr-only">Who&apos;s at the table</h2>
      <ul className={grid}>{top}</ul>
      <div className="my-3 flex flex-col items-center justify-center rounded-[2rem] border border-hairline bg-surface-container-high/70 px-4 py-4 text-center sm:my-4 sm:py-5">
        <p className={LABEL}>The table</p>
        <p className="mt-1 max-w-full truncate font-display text-lg font-semibold tracking-display text-ink sm:text-xl">
          {room.name.trim() || "Untitled meeting"}
        </p>
        <p className="mt-0.5 text-xs text-muted">{roomSummary(room)}</p>
      </div>
      {bottom.length > 0 && <ul className={grid}>{bottom}</ul>}
      <p className="mt-3 text-center text-[11px] text-muted">
        Click a ring to change sides. Click a seat to edit the person.
      </p>
    </section>
  );
}
