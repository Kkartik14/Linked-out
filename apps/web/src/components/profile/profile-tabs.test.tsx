import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockUser, renderWithProviders } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getUserLs: vi.fn() };
});

import { ProfileTabs } from "@/components/profile/profile-tabs";
import { getUserLs } from "@/lib/api";

const session = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;

describe("ProfileTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserLs).mockResolvedValue({ data: [], nextCursor: null });
  });

  it("exposes exactly the six active type sections and defaults to L", async () => {
    renderWithProviders(<ProfileTabs username="kartik" isSelf />, { session });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Ls",
      "Wins",
      "Stories",
      "Scars",
      "Plot Twists",
      "Battles",
    ]);
    expect(screen.getByRole("tab", { name: "Ls" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Collections" })).not.toBeInTheDocument();

    await waitFor(() => expect(getUserLs).toHaveBeenCalledWith("kartik", "L", undefined));
  });
});
