import type { Metadata } from "next";

import { getSession, requireViewer } from "@/lib/session";
import { LComposer } from "@/components/l/l-composer";

export const metadata: Metadata = { title: "Share an L" };

export default async function NewLPage() {
  requireViewer(await getSession(), "/new");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Share an L</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Document a career event honestly — the loss, and what it taught you.
      </p>
      <LComposer />
    </div>
  );
}
