import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, patchMe: vi.fn() };
});

import { SettingsForm } from "@/components/settings/settings-form";
import { patchMe } from "@/lib/api";

const loggedIn: Session = { status: "authenticated", user: mockUser, needsOnboarding: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsForm save", () => {
  it("redirects to the updated profile and refreshes after a successful save", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    const refresh = vi.fn();
    // The canonical username comes from the response, not the form — a rename must be honored.
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session: loggedIn,
      router: { push, refresh },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the button disabled through a successful navigation (no double-submit)", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    const refresh = vi.fn();
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session: loggedIn,
      router: { push, refresh },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    // `saving` stays set through the route transition so the form cannot be re-submitted while
    // navigation is pending. A `finally { setSaving(false) }` regression re-enables it — and fails
    // this. Only a failed save re-enables the button (covered by the test below).
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("stays on Settings and re-enables saving when the save fails", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(patchMe).mockRejectedValue(new Error("boom"));

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session: loggedIn,
      router: { push },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
