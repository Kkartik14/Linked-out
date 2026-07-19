import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Collection } from "@linkedout/contracts";

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="hover:bg-accent/50 flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{collection.title}</p>
        <p className="text-muted-foreground text-sm">
          {collection.lCount} {collection.lCount === 1 ? "L" : "Ls"}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}
