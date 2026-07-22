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
});
