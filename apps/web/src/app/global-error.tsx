"use client";

import * as React from "react";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-4 text-center">
          {/* The alert goes on a wrapper, not on <main>: `role` would replace the main
              landmark rather than add to it, and the one page a lost user most needs a
              landmark on is this one. */}
          <div role="alert" className="flex flex-col items-center">
            <p className="text-sm font-medium text-neutral-500">LinkedOut hit an unexpected error</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">The app could not start.</h1>
            <p className="mt-2 max-w-md text-sm text-neutral-600">
              Retry once. If the problem continues, reload the page after a moment.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
