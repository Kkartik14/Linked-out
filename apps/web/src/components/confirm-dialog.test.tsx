import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { renderWithProviders } from "@/test/utils";

/**
 * jsdom has no layout, but it does have real focus semantics and it runs Radix's actual
 * focus-scope timers — which is exactly what these turn on. A Playwright pass is still the
 * stronger oracle for focus, but the failure here is structural (a null `triggerRef` making
 * Radix's restore a no-op), so it reproduces without a viewport.
 */
function Harness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete this L
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this L?"
        description="This cannot be undone."
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}

describe("ConfirmDialog focus", () => {
  it("returns focus to the control that opened it when cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const opener = screen.getByRole("button", { name: "Delete this L" });

    opener.focus();
    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    // Without the explicit restore this is `document.body`: the dialog is opened
    // programmatically, so Radix's `triggerRef` is null, its own restore is a no-op, and its
    // `preventDefault()` has already disabled the focus-scope fallback.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus to the opener after confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<Harness onConfirm={onConfirm} />);
    const opener = screen.getByRole("button", { name: "Delete this L" });

    opener.focus();
    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus when dismissed with Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const opener = screen.getByRole("button", { name: "Delete this L" });

    opener.focus();
    await user.click(opener);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("moves focus into the dialog, landing on the non-destructive choice", async () => {
    // The capture handler must not disturb the focus scope's own entry behaviour — it only
    // reads `document.activeElement`. Cancel first is APG's guidance for a destructive step.
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Delete this L" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });
});
