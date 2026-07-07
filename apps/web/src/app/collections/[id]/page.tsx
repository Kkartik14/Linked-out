import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCollection, isApiError } from "@/lib/api";
import { LCard } from "@/components/l/l-card";
import { EmptyState } from "@/components/empty-state";

const loadCollection = cache((id: string) => getCollection(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const c = await loadCollection(id);
    return { title: c.title, description: `A collection of ${c.lCount} Ls` };
  } catch {
    return { title: "Collection" };
  }
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let collection;
  try {
    collection = await loadCollection(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-6">
        <p className="text-muted-foreground text-sm">
          Collection by{" "}
          <Link href={`/u/${collection.owner.username}`} className="hover:underline">
            {collection.owner.name ?? collection.owner.username}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{collection.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {collection.lCount} {collection.lCount === 1 ? "L" : "Ls"}
        </p>
      </header>

      {collection.ls.length > 0 ? (
        <div className="flex flex-col gap-4">
          {collection.ls.map((l) => (
            <LCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <EmptyState description="This collection is empty." />
      )}
    </div>
  );
}
