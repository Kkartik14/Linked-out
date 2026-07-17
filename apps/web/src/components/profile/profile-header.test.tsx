import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserProfile } from "@linkedout/contracts/v2";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getProfile: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  };
});

import { ProfileHeader } from "@/components/profile/profile-header";
import { follow, getProfile } from "@/lib/api";

const loggedIn: Session = { status: "authenticated", user: mockUser, needsOnboarding: false };
const profile: UserProfile = {
  ...mockUser,
  id: "target-user",
  username: "sam",
  name: "Sam Builder",
  counts: { followers: 7, following: 2 },
  viewer: { isFollowing: false, isSelf: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(profile);
  vi.mocked(follow).mockResolvedValue({
    isFollowing: true,
    counts: { followers: 11, following: 4 },
  });
});

describe("ProfileHeader follow state", () => {
  it("uses the fresh RSC profile without a mount refetch and still honors invalidation", async () => {
    const refreshed = {
      ...profile,
      counts: { followers: 9, following: 3 },
    };
    vi.mocked(getProfile).mockResolvedValue(refreshed);
    const { queryClient } = renderWithProviders(<ProfileHeader profile={profile} />, {
      session: loggedIn,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/7 followers/)).toHaveTextContent("7 followers · 2 following");

    await queryClient.invalidateQueries({
      queryKey: ["profiles", mockUser.id, "sam"],
      exact: true,
    });
    await waitFor(() => expect(getProfile).toHaveBeenCalledOnce());
    expect(screen.getByText(/9 followers/)).toHaveTextContent("9 followers · 3 following");
  });

  it("reconciles the profile cache with the counts returned by follow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileHeader profile={profile} />, { session: loggedIn });

    await user.click(screen.getByRole("button", { name: "Follow" }));

    expect(follow).toHaveBeenCalledWith(mockUser.id, "sam");
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(screen.getByText(/11 followers/)).toHaveTextContent("11 followers · 4 following");
  });
});
