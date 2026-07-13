import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-20 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page does not exist.</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        It may have been removed, made private, or the link may be incorrect.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to the feed</Link>
      </Button>
    </section>
  );
}
