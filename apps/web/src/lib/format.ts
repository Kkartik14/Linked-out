/** Small, dependency-free formatting helpers used across the UI. */

/** Two-letter initials for an avatar fallback. */
export function initials(name: string | null | undefined, username?: string): string {
  const base = (name && name.trim()) || username || "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
  return "";
}

const DATE_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

const MONTH_YEAR_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
});
export function formatMonthYear(iso: string): string {
  return MONTH_YEAR_FMT.format(new Date(iso));
}

/** Compact count: 1200 -> "1.2k". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
