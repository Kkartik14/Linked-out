import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getL } from "@/lib/api";
import { publicReadFailure } from "@/lib/public-read";
import { LComposer } from "@/components/l/l-composer";

export const metadata: Metadata = { title: "Edit L" };

export default async function EditLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Called once, and this route's `metadata` is static — a React `cache()` wrapper here would
  // memoize a single call. (`ls/[id]` does wrap, and there it earns it: its
  // `generateMetadata` and page body both load the same resource.)
  const l = await getL(id).catch((err: unknown) => publicReadFailure(err, `/ls/${id}/edit`));
  if (!l.viewer.canEdit) redirect(`/ls/${id}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit your L</h1>
      <LComposer initial={l} />
    </div>
  );
}
