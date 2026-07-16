import type { Metadata } from "next";

import { searchLs, searchUsers } from "@/lib/api";
import { SearchClient } from "@/components/search/search-client";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  return searchParams.then((sp) => ({
    title: sp.q ? `Search: ${sp.q}` : "Search",
  }));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type === "users" ? "users" : "ls";

  const initialLs = q && type === "ls" ? await searchLs(q).catch(() => undefined) : undefined;
  const initialUsers =
    q && type === "users" ? await searchUsers(q).catch(() => undefined) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <SearchClient key={q} q={q} type={type} initialLs={initialLs} initialUsers={initialUsers} />
    </div>
  );
}
