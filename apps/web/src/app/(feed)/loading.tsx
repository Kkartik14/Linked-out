/**
 * Mirrors the grid in `page.tsx` — same track sizes, same breakpoints, same rail visibility.
 * A skeleton that doesn't resemble the page it stands in for is worse than none: this was a
 * single `max-w-2xl` column standing in for a three-column `max-w-[80rem]` grid, so the route
 * jumped sideways the moment it resolved.
 *
 * Rail block heights match `RailSkeleton` in feed-sidebar.tsx, which takes over from here once
 * the page itself is streaming.
 */
export default function FeedLoading() {
  return (
    <div
      role="status"
      aria-label="Loading feed"
      className="mx-auto grid w-full max-w-[80rem] animate-pulse grid-cols-1 items-start gap-6 px-4 py-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,42rem)_19rem]"
    >
      <div className="hidden flex-col gap-3 lg:flex">
        <div className="bg-muted h-[210px] rounded-xl" />
        <div className="bg-muted h-[260px] rounded-xl" />
      </div>

      <div>
        <div className="bg-muted h-8 w-48 rounded" />
        <div className="mt-3 space-y-2">
          <div className="bg-muted h-4 w-full rounded" />
          <div className="bg-muted h-4 w-2/3 rounded" />
        </div>
        <div className="mt-6 space-y-4">
          <div className="bg-muted h-40 rounded-xl" />
          <div className="bg-muted h-40 rounded-xl" />
        </div>
      </div>

      <div className="hidden flex-col gap-3 xl:flex">
        <div className="bg-muted h-[280px] rounded-xl" />
        <div className="bg-muted h-[190px] rounded-xl" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
