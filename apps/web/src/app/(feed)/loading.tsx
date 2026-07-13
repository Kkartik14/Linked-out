export default function FeedLoading() {
  return (
    <div
      role="status"
      aria-label="Loading feed"
      className="mx-auto w-full max-w-2xl animate-pulse px-4 py-6"
    >
      <div className="bg-muted h-8 w-48 rounded" />
      <div className="mt-3 space-y-2">
        <div className="bg-muted h-4 w-full rounded" />
        <div className="bg-muted h-4 w-2/3 rounded" />
      </div>
      <div className="mt-6 space-y-4">
        <div className="bg-muted h-40 rounded-xl" />
        <div className="bg-muted h-40 rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
