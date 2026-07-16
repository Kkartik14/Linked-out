import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One box in a feed rail.
 *
 * Pass `title` for a visible heading, or `label` when the box speaks for itself and only
 * a screen reader needs the name (the viewer card, whose avatar and name are the header).
 * Either way the section gets an accessible name, so it is a landmark rather than an
 * anonymous div.
 */
export function SidebarSection({
  title,
  label,
  caption,
  children,
  className,
}: {
  title?: string;
  label?: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : label}
      className={cn("bg-card rounded-xl border", className)}
    >
      {title ? (
        <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 id={headingId} className="text-sm font-medium tracking-tight">
            {title}
          </h2>
          {caption ? (
            <p className="text-muted-foreground shrink-0 text-xs">{caption}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
