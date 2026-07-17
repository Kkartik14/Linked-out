"use client";

import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * A destructive confirmation, opened programmatically rather than from a `DialogTrigger`.
 *
 * That distinction is the whole reason this file manages focus by hand. Radix restores focus
 * on close by calling `triggerRef.current?.focus()` — and `triggerRef` is populated *only* by
 * `<DialogTrigger>`. Opened from a plain button, the ref is null, so Radix's own restore is a
 * no-op *and* its `preventDefault()` has already disabled the focus-scope fallback that would
 * otherwise have returned focus to wherever it came from. Focus lands on `<body>`: the viewer
 * confirms a delete and is silently dumped at the top of the document (WCAG 2.4.3).
 *
 * Verified against `@radix-ui/react-dialog@1.1.19` rather than assumed, because the two hooks
 * behave differently and the difference decides the implementation:
 *
 *  - `onCloseAutoFocus` is wrapped in `composeEventHandlers`, which runs Radix's handler after
 *    ours *unless ours prevents default*. So the `preventDefault()` below is load-bearing, not
 *    ceremony — without it Radix would still run and stomp whatever we just focused. Omitting
 *    it only appears to work while no `DialogTrigger` exists; add one later and focus silently
 *    starts jumping.
 *  - `onOpenAutoFocus` is passed straight through (`onMountAutoFocus: onOpenAutoFocus`), not
 *    composed. Ours is the only handler, and because it does not prevent default the focus
 *    scope still focuses into the dialog as normal. So it is a safe place to *read* the
 *    outgoing element: the scope samples `document.activeElement` before dispatching, and our
 *    handler runs synchronously inside that dispatch, so nothing has moved yet.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const openedFrom = React.useRef<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          openedFrom.current = active instanceof HTMLElement ? active : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = openedFrom.current;
          // Guarded rather than focused blindly: Radix has no `isConnected` check anywhere,
          // and `.focus()` on a detached or disabled element is a silent no-op. Cancelling —
          // by far the common path — always lands here, because the opener is still there.
          // Confirming a delete that unmounts its own opener (a comment row) still ends at
          // `<body>`; that needs a stable fallback target this component cannot invent, and
          // is tracked in the local TODO rather than papered over with a prop nobody passes.
          if (previous?.isConnected && !previous.matches(":disabled")) {
            previous.focus({ preventScroll: true });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
