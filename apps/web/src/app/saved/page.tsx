import type { Metadata } from "next";

import { getSession, requireViewer } from "@/lib/session";
import { SavedList } from "@/components/saved-list";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  requireViewer(await getSession(), "/saved");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Saved</h1>
      <SavedList />
    </div>
  );
}
