import type { Metadata } from "next";

import { oauthLoginUrl } from "@/lib/api";
import { oauthErrorMessage, safeReturnTo } from "@/lib/auth-entry";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(sp.returnTo);
  const error = oauthErrorMessage(sp.error);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="text-center">
        <div className="bg-foreground text-background mx-auto grid size-10 place-items-center rounded-lg text-lg font-bold">
          L
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Welcome to LinkedOut</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          LinkedIn for your Ls. Sign in to share yours.
        </p>
      </div>

      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive mt-6 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        <Button asChild size="lg">
          <a href={oauthLoginUrl("google", returnTo)}>Continue with Google</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={oauthLoginUrl("github", returnTo)}>Continue with GitHub</a>
        </Button>
      </div>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        No résumé polish required. Just the truth.
      </p>
    </div>
  );
}
