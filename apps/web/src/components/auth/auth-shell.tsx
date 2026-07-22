import * as React from "react";

/**
 * The shared frame for the three auth entry points (`/login`, `/signup`, `/forgot-password`).
 *
 * Extracted so the pages cannot drift the way the login and callback copy once did: one logo, one
 * vertical rhythm, one place to change the heading treatment. Purely presentational — no hooks — so
 * it composes inside both the server pages and their client forms.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="text-center">
        <div className="bg-foreground text-background mx-auto grid size-10 place-items-center rounded-lg text-lg font-bold">
          L
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
      </div>

      {children}

      {footer ? <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div> : null}
    </div>
  );
}
