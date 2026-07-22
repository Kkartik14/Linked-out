import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsForm } from "@/components/settings/settings-form";
import { patchMe } from "@/lib/api";
import { mockUser, renderWithProviders } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    patchMe: vi.fn(),
    presignAvatar: vi.fn(),
  };
});

const session = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(patchMe).mockResolvedValue(mockUser);
});

describe("SettingsForm", () => {
  it("does not render or resubmit the profile's current chapter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsForm user={mockUser} />, { session });

    expect(screen.queryByText(/Journey status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current chapter/i)).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "New name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(patchMe).toHaveBeenCalledWith(mockUser.id, {
        name: "New name",
        bio: null,
      }),
    );
  });

  it("redirects to the updated profile and refreshes after a successful save", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    const refresh = vi.fn();
    // The canonical username comes from the response, not the form — a rename must be honored.
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push, refresh },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the button disabled through a successful navigation", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("stays on Settings and re-enables saving when the save fails", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(patchMe).mockRejectedValue(new Error("boom"));

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
