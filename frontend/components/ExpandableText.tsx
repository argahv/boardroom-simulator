"use client";
import { useState } from "react";

type Props = {
  text: string;
  limit?: number;
  className?: string;
};

export function ExpandableText({ text, limit = 200, className = "" }: Props) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > limit;

  return (
    <span className={className}>
      {needsTruncation && !expanded ? (
        <>
          {text.slice(0, limit)}&hellip;
          <button
            onClick={() => setExpanded(true)}
            className="ml-1 text-primary hover:underline text-xs font-semibold whitespace-nowrap"
            aria-label="Show full text"
          >
            Read more
          </button>
        </>
      ) : (
        <>
          {text}
          {needsTruncation && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="ml-1 text-primary hover:underline text-xs font-semibold whitespace-nowrap"
              aria-label="Show less"
            >
              Show less
            </button>
          )}
        </>
      )}
    </span>
  );
}
