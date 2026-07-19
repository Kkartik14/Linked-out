"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getMe } from "@/lib/api";
import { oauthErrorMessage, safeReturnTo } from "@/lib/auth-entry";
import { publishSessionChanged } from "@/lib/session-channel";
import { Button } from "@/components/ui/button";
import { exchangeHandoff } from "./actions";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      {children}
    </div>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [fetchFailed, setFetchFailed] = React.useState(false);

  const returnTo = safeReturnTo(params.get("returnTo"));
  // Kept separate from `error`: the effect below skips the session fetch on any OAuth error,
  // and it must key off the raw code, not the composed message.
  const errorCode = params.get("error");
  // Present only in handoff mode: Nest returns `?code=` to be exchanged here for the session,
  // whereas legacy returns `?returnTo=` because Nest already set the cookies.
  const handoffCode = params.get("code");
  const error =
    oauthErrorMessage(errorCode) ??
    (fetchFailed ? "We couldn't complete sign-in. Please try again." : null);

  React.useEffect(() => {
    if (errorCode) return;

    let cancelled = false;

    // Shared tail: confirm who the (now-established) session belongs to and route accordingly.
    // A new principal owns the shared cookies, so announce it before navigating — other tabs are
    // still rendering the previous viewer. Onboarding-required is still a completed sign-in.
    const confirmAndRoute = async (destination: string) => {
      const me = await getMe();
      if (cancelled) return;
      if (!me.user) {
        router.replace(`/login?returnTo=${encodeURIComponent(destination)}`);
        return;
      }
      publishSessionChanged();
      router.replace(
        me.needsOnboarding
          ? `/onboarding?returnTo=${encodeURIComponent(destination)}`
          : destination,
      );
    };

    const run = handoffCode
      ? // Handoff: exchange the one-time code (sets lo_sid) before confirming the session, and use
        // the server-bound returnTo the exchange returns rather than a destination read off the URL.
        exchangeHandoff(handoffCode).then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            setFetchFailed(true);
            return;
          }
          return confirmAndRoute(result.returnTo);
        })
      : // Legacy: Nest already set the cookies, so just confirm and route.
        confirmAndRoute(returnTo);

    run.catch(() => {
      if (!cancelled) setFetchFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [errorCode, handoffCode, returnTo, router]);

  if (error) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Sign-in failed</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button asChild className="mt-2">
          <Link href="/login">Back to login</Link>
        </Button>
      </Centered>
    );
  }

  return (
    <Centered>
      <div
        aria-hidden
        className="border-muted-foreground/30 border-t-foreground size-6 animate-spin rounded-full border-2"
      />
      <p className="text-muted-foreground text-sm">Signing you in…</p>
    </Centered>
  );
}

export default function AuthCallbackPage() {
  return (
    <React.Suspense
      fallback={
        <Centered>
          <p className="text-muted-foreground text-sm">Signing you in…</p>
        </Centered>
      }
    >
      <CallbackInner />
    </React.Suspense>
  );
}
