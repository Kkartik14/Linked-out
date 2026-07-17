import { cache } from "react";
import type { Metadata } from "next";

import { getL } from "@/lib/api";
import { publicReadFailure } from "@/lib/public-read";
import { truncate } from "@/lib/format";
import { LDetailView } from "@/components/l/l-detail-view";
import { CommentsSection } from "@/components/comments/comments-section";

const loadL = cache((id: string) => getL(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const l = await loadL(id);
    return { title: l.title, description: truncate(l.story, 155) };
  } catch {
    return { title: "L" };
  }
}

export default async function LPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await loadL(id).catch((err: unknown) => publicReadFailure(err, `/ls/${id}`));

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-6">
      <LDetailView l={l} />
      <div id="comments" className="mt-10 scroll-mt-20">
        <CommentsSection lId={l.id} commentCount={l.commentCount} />
      </div>
    </article>
  );
}
