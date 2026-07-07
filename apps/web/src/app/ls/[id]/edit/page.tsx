import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getL, isApiError } from "@/lib/api";
import { LComposer } from "@/components/l/l-composer";

const loadL = cache((id: string) => getL(id));

export const metadata: Metadata = { title: "Edit L" };

export default async function EditLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let l;
  try {
    l = await loadL(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }
  if (!l.viewer.canEdit) redirect(`/ls/${id}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit your L</h1>
      <LComposer mode="edit" initial={l} />
    </div>
  );
}
