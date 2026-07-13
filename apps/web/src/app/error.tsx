"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center">
      <p className="text-muted-foreground text-sm font-medium">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page could not be loaded.</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        The problem may be temporary. Retry this route without losing the rest of your session.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
