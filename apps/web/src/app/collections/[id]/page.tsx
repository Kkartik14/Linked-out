import { cache } from "react";
import type { Metadata } from "next";

import { getCollection } from "@/lib/api";
import { publicReadFailure } from "@/lib/public-read";
import { CollectionDetailView } from "@/components/collections/collection-detail-view";

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

  const collection = await loadCollection(id).catch((err: unknown) =>
    publicReadFailure(err, `/collections/${id}`),
  );
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <CollectionDetailView collection={collection} />
    </div>
  );
}
