"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ACCEPT } from "./files";

type DropZoneProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  /** Class added while files are dragged over. */
  overClassName?: string;
  children: (api: { open: () => void; over: boolean }) => ReactNode;
};

/** A drop target with a hidden file picker; children get `open()` for a "choose files" button. */
export function DropZone({ onFiles, disabled, className = "", overClassName = "", children }: DropZoneProps) {
  const inputId = useId();
  // dragenter/leave fire for every child element; count them so the highlight doesn't flicker.
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  return (
    <div
      className={`${className} ${over ? overClassName : ""}`}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (disabled || !hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          // Let the same file be picked again after a failure.
          e.target.value = "";
        }}
      />
      {/* Looked up by id at click time: children render with `open`, and the compiler forbids refs there. */}
      {children({ open: () => (document.getElementById(inputId) as HTMLInputElement | null)?.click(), over })}
    </div>
  );
}
