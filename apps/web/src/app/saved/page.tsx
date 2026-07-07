import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { SavedList } from "@/components/saved-list";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const session = await getSession();
  if (!session.user) redirect("/login?returnTo=/saved");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Saved</h1>
      <SavedList />
    </div>
  );
}
