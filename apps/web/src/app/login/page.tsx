import type { Metadata } from "next";

import { oauthLoginUrl } from "@/lib/api";
import { oauthErrorMessage, safeReturnTo } from "@/lib/auth-entry";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
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
    <AuthShell title="Welcome to LinkedOut" subtitle="LinkedIn for your Ls. Log in to share yours.">
      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive mt-6 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <LoginForm returnTo={returnTo} />

        <div className="my-6 flex items-center gap-3">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs tracking-wide uppercase">
            or continue with
          </span>
          <span className="bg-border h-px flex-1" />
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild variant="outline" size="lg">
            <a href={oauthLoginUrl("google", returnTo)}>Continue with Google</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={oauthLoginUrl("github", returnTo)}>Continue with GitHub</a>
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground mt-8 text-center text-xs">
        No résumé polish required. Just the truth.
      </p>
    </AuthShell>
  );
}
