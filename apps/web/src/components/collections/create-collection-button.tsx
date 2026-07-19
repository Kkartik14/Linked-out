"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { createCollection, errorMessage } from "@/lib/api";
import { assertComposedPrincipal, useComposedPrincipal } from "@/components/session-provider";
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

export function CreateCollectionButton({
  queryKey,
  label = "New collection",
}: {
  queryKey: QueryKey;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const composedAs = useComposedPrincipal();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");

  const create = useMutation({
    mutationFn: (nextTitle: string) => createCollection(assertComposedPrincipal(composedAs), nextTitle),
    onSuccess: () => {
      setTitle("");
      setOpen(false);
      toast.success("Collection created.");
      void queryClient.invalidateQueries({ queryKey });
      router.refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create the collection.")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A real trigger, not a sibling button that happens to set state. `DialogTrigger` is
          what populates Radix's `triggerRef`, and that ref is the only thing its close-time
          focus restore uses — with a bare button the restore is a no-op and focus falls to
          `<body>` (WCAG 2.4.3). It also supplies `aria-haspopup`/`aria-expanded`/
          `aria-controls` for free. */}
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      {/* No `DialogDescription` here, so the id Radix always generates would dangle. Passing
          `undefined` is what the docs prescribe to drop the attribute entirely. */}
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
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
  );
}
