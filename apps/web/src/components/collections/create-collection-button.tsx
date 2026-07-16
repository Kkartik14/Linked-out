"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Collection } from "@linkedout/contracts/v2";

import { createCollection, errorMessage } from "@/lib/api";
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

export function CreateCollectionButton({
  queryKey,
  onCreated,
  label = "New collection",
}: {
  queryKey?: QueryKey;
  onCreated?: (collection: Collection) => void;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");

  const create = useMutation({
    mutationFn: (nextTitle: string) => createCollection(nextTitle),
    onSuccess: (collection) => {
      setTitle("");
      setOpen(false);
      toast.success("Collection created.");
      if (queryKey) void queryClient.invalidateQueries({ queryKey });
      onCreated?.(collection);
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create the collection.")),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = title.trim();
              if (value) create.mutate(value);
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Create collection</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="collection-title">Collection title</Label>
              <Input
                id="collection-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                autoFocus
                placeholder="My startup journey"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || create.isPending}>
                {create.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
