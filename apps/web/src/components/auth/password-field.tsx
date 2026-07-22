"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface PasswordFieldProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Overrides the reveal-toggle's accessible name; defaults describe the current state. */
  toggleLabel?: string;
}

/**
 * A password input with an in-field reveal toggle.
 *
 * The toggle is a real `<button type="button">` (never a submit) carrying `aria-pressed` and an
 * accessible name that flips with state, and the input's `type` swaps between `password` and
 * `text`. Everything else is a plain `Input`, so `autoComplete`, `aria-invalid`, `aria-describedby`
 * and friends pass straight through — the caller decides `new-password` vs `current-password`.
 */
export function PasswordField({ className, toggleLabel, ...props }: PasswordFieldProps) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        aria-pressed={revealed}
        aria-label={toggleLabel ?? (revealed ? "Hide password" : "Show password")}
        onClick={() => setRevealed((r) => !r)}
        tabIndex={props.disabled ? -1 : 0}
        disabled={props.disabled}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.2A9.6 9.6 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.3 4M6.1 6.1A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 004-.86"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
