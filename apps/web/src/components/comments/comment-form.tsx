"use client";

import * as React from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX = 2000;

export function CommentForm({
  onSubmit,
  placeholder = "Share your experience…",
  submitLabel = "Post",
  autoFocus,
  compact,
}: {
  onSubmit: (body: string) => Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = body.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onSubmit(value);
      setBody("");
    } catch (err) {
      toast.error(errorMessage(err, "Could not post your comment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX}
        rows={compact ? 2 : 3}
        autoFocus={autoFocus}
        aria-label="Write a comment"
      />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs tabular-nums">
          {body.length}/{MAX}
        </span>
        <Button type="submit" size="sm" disabled={!body.trim() || busy}>
          {busy ? "Posting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
