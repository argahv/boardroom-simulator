"use client";

import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from "react";

interface DocumentUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  uploading?: boolean;
}

interface FileError {
  name: string;
  message: string;
}

const ALLOWED_TYPES = [".pdf", ".docx", ".txt"] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

export function DocumentUpload({
  files,
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 25,
  uploading = false,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<FileError[]>([]);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateAndAdd = useCallback(
    (incoming: FileList | File[]) => {
      const newErrors: FileError[] = [];
      const valid: File[] = [];
      const remaining = Math.max(0, maxFiles - files.length);

      const arr = Array.from(incoming);

      for (const file of arr) {
        if (valid.length >= remaining) {
          newErrors.push({ name: file.name, message: `Maximum ${maxFiles} files` });
          continue;
        }

        const ext = getExtension(file.name);
        const allowed = ALLOWED_TYPES.includes(ext as (typeof ALLOWED_TYPES)[number]);
        if (!allowed) {
          newErrors.push({
            name: file.name,
            message: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
          });
          continue;
        }

        if (file.size > maxSizeBytes) {
          newErrors.push({
            name: file.name,
            message: `File exceeds ${maxSizeMB} MB limit`,
          });
          continue;
        }

        valid.push(file);
      }

      setErrors(newErrors);
      if (valid.length > 0) {
        onFilesChange([...files, ...valid]);
      }
    },
    [files, onFilesChange, maxFiles, maxSizeMB, maxSizeBytes],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (uploading) return;
      if (e.dataTransfer.files.length > 0) {
        validateAndAdd(e.dataTransfer.files);
      }
    },
    [validateAndAdd, uploading],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!uploading) setDragOver(true);
    },
    [uploading],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        validateAndAdd(e.target.files);
      }
      e.target.value = "";
    },
    [validateAndAdd],
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange],
  );

  const handleZoneClick = useCallback(() => {
    if (!uploading) inputRef.current?.click();
  }, [uploading]);

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleZoneClick}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition
          ${dragOver ? "border-primary bg-primary/5" : "border-hairline bg-surface-card/50"}
          ${uploading ? "opacity-50 cursor-not-allowed" : ""}
          focus:border-primary focus:ring-2 focus:ring-primary/10`}
        tabIndex={0}
        role="button"
        aria-label="Upload files"
      >
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <span className="material-symbols-outlined text-3xl text-muted animate-spin">
              hourglass_empty
            </span>
          ) : (
            <span className="material-symbols-outlined text-3xl text-muted">
              upload_file
            </span>
          )}
          <div>
            <p className="text-sm text-muted">
              {uploading
                ? "Uploading files..."
                : "Drag & drop files here, or click to select"}
            </p>
            <p className="text-xs text-muted/70 mt-1">
              Supports PDF, DOCX, TXT (max {maxSizeMB} MB each, up to {maxFiles}{" "}
              files)
            </p>
          </div>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={handleSelect}
      />

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-error text-xs mt-1">
              {err.name}: {err.message}
            </p>
          ))}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${file.size}-${i}`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-card/30 border border-hairline"
            >
              {/* Doc icon */}
              <span className="material-symbols-outlined text-lg text-muted">
                description
              </span>

              {/* Name + Size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted">{formatSize(file.size)}</p>
              </div>

              {/* Loading spinner or Remove button */}
              {uploading ? (
                <span className="material-symbols-outlined text-lg text-muted animate-spin">
                  hourglass_empty
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="text-muted hover:text-error transition shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
