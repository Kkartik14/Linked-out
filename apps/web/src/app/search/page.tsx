import type { Metadata } from "next";
import { feedFilterSchema } from "@linkedout/contracts";

import { searchLs, searchUsers } from "@/lib/api";
import { SearchClient } from "@/components/search/search-client";

const FILTERS = new Set<string>(feedFilterSchema.options);

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
  searchParams: Promise<{ q?: string; type?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type === "users" ? "users" : "ls";
  const filter =
    type === "ls" && sp.filter && FILTERS.has(sp.filter.toLowerCase())
      ? sp.filter.toLowerCase()
      : null;

  const initialLs =
    q && type === "ls" ? await searchLs(q, filter ?? undefined).catch(() => undefined) : undefined;
  const initialUsers =
    q && type === "users" ? await searchUsers(q).catch(() => undefined) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <SearchClient
        key={q}
        q={q}
        type={type}
        filter={filter}
        initialLs={initialLs}
        initialUsers={initialUsers}
      />
    </div>
  );
}
