"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isSafeReturnTo } from "@linkedout/contracts";

import { getMe } from "@/lib/api";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the sign-in.",
  oauth_failed: "Something went wrong with the provider.",
  email_taken: "That email is already linked to a different login method.",
};

function safeReturnTo(value: string | null): string {
  return value && isSafeReturnTo(value) ? value : "/";
}

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
  const errorCode = params.get("error");
  const error = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? "Sign-in failed. Please try again.")
    : fetchFailed
      ? "We couldn't complete sign-in. Please try again."
      : null;

  React.useEffect(() => {
    if (errorCode) return;

    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.user) {
          router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        } else if (me.needsOnboarding) {
          router.replace(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
        } else {
          router.replace(returnTo);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [errorCode, returnTo, router]);

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
