"use client";

import * as React from "react";
import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserProfile } from "@linkedout/contracts";

import {
  addLToCollection,
  createCollection,
  errorMessage,
  getUserCollections,
} from "@/lib/api";
import { useComposedPrincipal, usePrincipal, useViewer } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SaveToCollectionProps = {
  lId: string;
  existingCollectionIds: string[];
  className?: string;
};

/** Resolves the viewer before any hook runs, so the inner component always has one. */
export function SaveToCollectionButton(props: SaveToCollectionProps) {
  const user = useViewer();
  if (!user) return null;
  return <SaveToCollection {...props} user={user} />;
}

function SaveToCollection({
  lId,
  existingCollectionIds,
  className,
  user,
}: SaveToCollectionProps & { user: UserProfile }) {
  const principal = usePrincipal();
  const composedAs = useComposedPrincipal();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");

  const existing = React.useMemo(() => new Set(existingCollectionIds), [existingCollectionIds]);
  const collections = useInfiniteQuery({
    queryKey: queryKeys.users.collections(principal, user.username),
    queryFn: ({ pageParam }) => getUserCollections(user.username, pageParam),
    enabled: open,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const afterChange = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.users.collections(principal, user.username),
    });
    setOpen(false);
    router.refresh();
  };

  const addExisting = useMutation({
    mutationFn: (collectionId: string) => addLToCollection(composedAs, collectionId, lId),
    onSuccess: () => {
      toast.success("Added to collection.");
      afterChange();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update the collection.")),
  });

  const createAndAdd = useMutation({
    mutationFn: async (nextTitle: string) => {
      const collection = await createCollection(composedAs, nextTitle);
      await addLToCollection(composedAs, collection.id, lId);
      return collection;
    },
    onSuccess: () => {
      setTitle("");
      toast.success("Collection created.");
      afterChange();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create the collection.")),
  });

  const items = collections.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={className}>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A real trigger: it is what populates the `triggerRef` Radix restores focus to on
            close. A sibling button leaves that ref null, so focus falls to `<body>`. */}
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderPlus className="size-4" />
            Add to collection
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add to collection</DialogTitle>
          </DialogHeader>

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {collections.isLoading ? (
              <p className="text-muted-foreground text-sm">Loading collections...</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No collections yet.</p>
            ) : (
              items.map((collection) => {
                const alreadyAdded = existing.has(collection.id);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    disabled={alreadyAdded || addExisting.isPending}
                    onClick={() => addExisting.mutate(collection.id)}
                    className="hover:bg-accent disabled:text-muted-foreground flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="truncate">{collection.title}</span>
                    <span className="text-muted-foreground ml-3 shrink-0 text-xs">
                      {alreadyAdded ? "Added" : `${collection.lCount} ${collection.lCount === 1 ? "L" : "Ls"}`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {collections.hasNextPage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => collections.fetchNextPage()}
              disabled={collections.isFetchingNextPage}
            >
              {collections.isFetchingNextPage ? "Loading..." : "Load more collections"}
            </Button>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = title.trim();
              if (value) createAndAdd.mutate(value);
            }}
            className="grid gap-3 border-t pt-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="new-collection-title">New collection title</Label>
              <Input
                id="new-collection-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="My startup journey"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || createAndAdd.isPending}>
                {createAndAdd.isPending ? "Creating..." : "Create and add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
