export function EmptyState({ title, description }: { title?: string; description: string }) {
  return (
    <div className="border-border/60 rounded-xl border border-dashed py-16 text-center">
      {title ? <p className="font-medium">{title}</p> : null}
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
