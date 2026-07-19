/** Small, dependency-free formatting helpers used across the UI. */

/** Two-letter initials for an avatar fallback: first + last token, or two letters of one. */
export function initials(name: string | null | undefined, username?: string): string {
  const base = (name && name.trim()) || username || "?";
  const parts = base.split(/\s+/).filter(Boolean);
  const [first] = parts;
  const last = parts.at(-1);
  // Narrowing, not a fallback change: `filter(Boolean)` already means a present token is a
  // non-empty string, so this only restates for the compiler what the filter guarantees —
  // and it covers the one real case, an all-whitespace `base` splitting to nothing.
  if (!first || !last) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

/** Truncate on a word boundary with an ellipsis. */
export function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "3 days ago", "just now", "in 2 hours". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  let duration = (new Date(iso).getTime() - now) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RELATIVE.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  // Unreachable for anything this function is allowed to receive: DIVISIONS ends at
  // POSITIVE_INFINITY, so the loop always returns unless `duration` is NaN — and that needs
  // an `iso` that is not the ISO 8601 UTC string the contract guarantees (public contract line
  // 15, enforced by `isoTimestampSchema`). TypeScript still requires a terminal return, so
  // this says what went wrong rather than rendering "" and hiding a broken timestamp behind
  // a blank byline.
  throw new TypeError(`timeAgo expects an ISO 8601 timestamp, received ${JSON.stringify(iso)}`);
}

const DATE_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

/** Compact count: 1200 -> "1.2k". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
