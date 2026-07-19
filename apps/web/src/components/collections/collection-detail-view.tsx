"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CollectionDetail, LCard as LCardType } from "@linkedout/contracts";

import {
  deleteCollection,
  errorMessage,
  removeLFromCollection,
  renameCollection,
} from "@/lib/api";
import { LCard } from "@/components/l/l-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { assertComposedPrincipal, useComposedPrincipal } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CollectionDetailView({
  collection,
}: {
  collection: CollectionDetail;
}) {
  const router = useRouter();
  const composedAs = useComposedPrincipal();
  const [title, setTitle] = React.useState(collection.title);
  const [items, setItems] = React.useState<LCardType[]>(collection.ls);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(collection.title);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const canManage = collection.viewer.canEdit;

  const rename = useMutation({
    mutationFn: (nextTitle: string) => renameCollection(assertComposedPrincipal(composedAs), collection.id, nextTitle),
    onSuccess: (updated) => {
      setTitle(updated.title);
      setDraftTitle(updated.title);
      setRenameOpen(false);
      toast.success("Collection renamed.");
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not rename the collection.")),
  });

  const del = useMutation({
    mutationFn: () => deleteCollection(assertComposedPrincipal(composedAs), collection.id),
    onSuccess: () => {
      toast.success("Collection deleted.");
      router.push(`/u/${collection.owner.username}`);
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete the collection.")),
  });

  const remove = useMutation({
    mutationFn: (lId: string) => removeLFromCollection(assertComposedPrincipal(composedAs), collection.id, lId),
    onSuccess: (_res, lId) => {
      setItems((current) => current.filter((item) => item.id !== lId));
      toast.success("Removed from collection.");
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update the collection.")),
  });

  return (
    <>
      <header className="mb-6">
        <p className="text-muted-foreground text-sm">
          Collection by{" "}
          <Link href={`/u/${collection.owner.username}`} className="hover:underline">
            {collection.owner.name ?? collection.owner.username}
          </Link>
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {items.length} {items.length === 1 ? "L" : "Ls"}
            </p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
                <Pencil className="size-4" />
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {items.length > 0 ? (
        <div className="flex flex-col gap-4">
          {items.map((l) => (
            <div key={l.id} className="flex flex-col gap-2">
              {canManage ? (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(l.id)}
                    disabled={remove.isPending}
                  >
                    <X className="size-4" />
                    Remove
                  </Button>
                </div>
              ) : null}
              <LCard l={l} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="This collection is empty." />
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = draftTitle.trim();
              if (value) rename.mutate(value);
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Rename collection</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="rename-collection-title">Collection title</Label>
              <Input
                id="rename-collection-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draftTitle.trim() || rename.isPending}>
                {rename.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this collection?"
        description="This removes the collection, not the Ls inside it."
        onConfirm={() => del.mutate()}
        busy={del.isPending}
      />
    </>
  );
}
