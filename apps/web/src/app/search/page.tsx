import type { Metadata } from "next";

import { searchLs, searchUsers } from "@/lib/api";
import { redirectIfCredentialRejected } from "@/lib/public-read";
import { SearchClient } from "@/components/search/search-client";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.q ? `Search: ${sp.q}` : "Search" };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type === "users" ? "users" : "ls";

  const returnTo = `/search?q=${encodeURIComponent(q)}`;
  // A transient failure is left to the client query to retry; only a rejected credential
  // is fatal here, because every later fetch would fail the same way.
  const swallow = (err: unknown) => {
    redirectIfCredentialRejected(err, returnTo);
    return undefined;
  };

  const initialLs = q && type === "ls" ? await searchLs(q).catch(swallow) : undefined;
  const initialUsers = q && type === "users" ? await searchUsers(q).catch(swallow) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <SearchClient key={q} q={q} type={type} initialLs={initialLs} initialUsers={initialUsers} />
    </div>
  );
}
