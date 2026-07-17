export function EmptyState({ description }: { description: string }) {
  return (
    <div className="border-border/60 rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
