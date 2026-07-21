"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const LENGTH = 8;

export interface OtpInputProps {
  /** The digits entered so far, always left-packed and contiguous (0–8 chars). */
  value: string;
  onChange: (next: string) => void;
  /** Fired once the eighth digit lands — lets a form auto-submit without a Verify click. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** id of the visible label, wired to the group so screen readers announce its purpose. */
  labelledBy?: string;
  /** id(s) of hint/error text, echoed onto every box so the description is never orphaned. */
  describedBy?: string;
}

/**
 * An eight-box one-time-code field.
 *
 * The parent owns a single contiguous string; this component only ever emits a hole-free value.
 * That invariant is what keeps the interactions honest: focus can never land past the fill
 * frontier (`onFocus` redirects there), so typing or pasting into box `i` — where `i` is at most
 * `value.length` — can never leave an earlier box empty. Backspace deletes and closes up rather
 * than punching a gap. Everything a keyboard user expects works: digit entry advances, Backspace
 * retreats, arrows move, and a pasted code is split across the boxes. The first box advertises
 * `autocomplete="one-time-code"` so the platform can offer to fill a delivered code.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  labelledBy,
  describedBy,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = React.useMemo(
    () => Array.from({ length: LENGTH }, (_, i) => value[i] ?? ""),
    [value],
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  // The first empty box, clamped — the natural home for the caret after any edit.
  const frontier = Math.min(value.length, LENGTH - 1);

  const focusBox = React.useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(LENGTH - 1, index));
    const el = refs.current[clamped];
    el?.focus();
    el?.select();
  }, []);

  const emit = React.useCallback(
    (next: string) => {
      const clean = next.replace(/\D/g, "").slice(0, LENGTH);
      onChange(clean);
      if (clean.length === LENGTH) onComplete?.(clean);
    },
    [onChange, onComplete],
  );

  // Advance/retreat the caret to the frontier *after* the value commits, not inside the input
  // handler. A focus move made mid-keystroke is fragile — the surrounding key sequence can land
  // the following event on the old box — so this reacts to the frontier moving instead. Guarded on
  // "focus is already inside the widget" so it never yanks focus from elsewhere on the page.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !container.contains(document.activeElement)) return;
    refs.current[frontier]?.focus();
    refs.current[frontier]?.select();
  }, [frontier]);

  function handleChange(i: number, raw: string) {
    // Keep only the newest digit — typing over a filled box replaces it in place.
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const next = i < value.length ? value.slice(0, i) + digit + value.slice(i + 1) : value + digit;
    emit(next);
  }

  function handleKeyDown(i: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const target = value[i] ? i : i - 1;
      if (target < 0) return;
      emit(value.slice(0, target) + value.slice(target + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(i - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(i: number, event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH - i);
    if (!pasted) return;
    emit(value.slice(0, i) + pasted + value.slice(i + pasted.length));
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex items-center justify-between gap-1.5"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          // Six of eight would still submit a code, so every box announces the whole target.
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => {
            // Never let focus sit past the frontier — that is how a hole would be born.
            if (i > value.length) focusBox(value.length);
            else e.currentTarget.select();
          }}
          className={cn(
            "size-10 rounded-md border text-center text-lg font-medium tabular-nums shadow-xs transition-[color,box-shadow] outline-none",
            "border-input bg-transparent dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:opacity-50",
            invalid && "border-destructive ring-destructive/20 dark:ring-destructive/40",
          )}
        />
      ))}
    </div>
  );
}

export const OTP_LENGTH = LENGTH;
