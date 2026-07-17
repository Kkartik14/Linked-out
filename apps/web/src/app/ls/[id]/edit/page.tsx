import { cache } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getL } from "@/lib/api";
import { publicReadFailure } from "@/lib/public-read";
import { LComposer } from "@/components/l/l-composer";

const loadL = cache((id: string) => getL(id));

export const metadata: Metadata = { title: "Edit L" };

export default async function EditLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const l = await loadL(id).catch((err: unknown) => publicReadFailure(err, `/ls/${id}/edit`));
  if (!l.viewer.canEdit) redirect(`/ls/${id}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit your L</h1>
      <LComposer initial={l} />
    </div>
  );
}
