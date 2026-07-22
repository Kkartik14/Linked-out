import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserProfile } from "@linkedout/contracts";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getProfile: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    patchMe: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ProfileHeader } from "@/components/profile/profile-header";
import { follow, getProfile, patchMe } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";

const loggedIn: Session = { status: "authenticated", user: mockUser, needsOnboarding: false };
const profile: UserProfile = {
  ...mockUser,
  id: "target-user",
  username: "sam",
  name: "Sam Builder",
  counts: { followers: 7, following: 2 },
  viewer: { isFollowing: false, isSelf: false },
};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(profile);
  vi.mocked(follow).mockResolvedValue({
    isFollowing: true,
    counts: { followers: 11, following: 4 },
  });
  vi.mocked(patchMe).mockResolvedValue(mockUser);
});

describe("ProfileHeader follow state", () => {
  it("does not present the retired Builders Helped metric", () => {
    renderWithProviders(<ProfileHeader profile={profile} />, { session: loggedIn });

    expect(screen.getByText(/Ls Shared/i)).toBeInTheDocument();
    expect(screen.queryByText(/Builders Helped/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Current chapter" })).not.toBeInTheDocument();
  });

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

describe("ProfileHeader current chapter", () => {
  it("shows the control directly after Edit profile on the owner's profile", () => {
    renderWithProviders(<ProfileHeader profile={mockUser} />, { session: loggedIn });

    const editProfile = screen.getByRole("link", { name: "Edit profile" });
    const chapter = screen.getByRole("combobox", { name: "Current chapter" });

    expect(editProfile.nextElementSibling).toContainElement(chapter);
    expect(chapter).toHaveTextContent("Building");
  });

  it("offers clearing plus every metadata-owned chapter choice in order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileHeader profile={mockUser} />, { session: loggedIn });

    screen.getByRole("combobox", { name: "Current chapter" }).focus();
    await user.keyboard("{ArrowDown}");

    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Not set",
      "🟡 Interviewing",
      "🔵 Building",
      "🟢 Working",
      "🟣 Starting Up",
      "🔴 Recovering",
      "⚫ Taking a Break",
    ]);
  });

  it("sets a chapter and reconciles every other cache owned by the principal", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const updated = { ...mockUser, status: "WORKING" as const };
    vi.mocked(patchMe).mockResolvedValue(updated);
    const { queryClient } = renderWithProviders(<ProfileHeader profile={mockUser} />, {
      session: loggedIn,
      router: { refresh },
    });
    const profileKey = queryKeys.profiles.detail(mockUser.id, mockUser.username);
    const sidebarKey = queryKeys.feedSidebar.detail(mockUser.id);
    const searchKey = queryKeys.search.preview.users(mockUser.id, "sam");
    queryClient.setQueryData(sidebarKey, { people: [] });
    queryClient.setQueryData(searchKey, { items: [] });

    screen.getByRole("combobox", { name: "Current chapter" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: /Working/ }));

    await waitFor(() => {
      expect(patchMe).toHaveBeenCalledWith(mockUser.id, { status: "WORKING" });
      expect(queryClient.getQueryData(profileKey)).toEqual(updated);
      expect(queryClient.getQueryState(sidebarKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(searchKey)?.isInvalidated).toBe(true);
      expect(refresh).toHaveBeenCalledOnce();
    });
    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(false);
  });

  it("clears the chapter with an explicit null", async () => {
    const user = userEvent.setup();
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, status: null });
    renderWithProviders(<ProfileHeader profile={mockUser} />, { session: loggedIn });

    screen.getByRole("combobox", { name: "Current chapter" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Not set" }));

    await waitFor(() => expect(patchMe).toHaveBeenCalledWith(mockUser.id, { status: null }));
  });

  it("locks the picker and announces progress while the mutation is pending", async () => {
    const user = userEvent.setup();
    let finishUpdate: ((profile: UserProfile) => void) | undefined;
    vi.mocked(patchMe).mockImplementation(
      () =>
        new Promise<UserProfile>((resolve) => {
          finishUpdate = resolve;
        }),
    );
    renderWithProviders(<ProfileHeader profile={mockUser} />, { session: loggedIn });
    const chapter = screen.getByRole("combobox", { name: "Current chapter" });

    chapter.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: /Working/ }));

    await waitFor(() => expect(chapter).toBeDisabled());
    expect(screen.getByText("Updating current chapter…")).toBeInTheDocument();

    await act(async () => finishUpdate?.({ ...mockUser, status: "WORKING" }));
    await waitFor(() => expect(chapter).not.toBeDisabled());
  });

  it("keeps the authoritative chapter and reports an error when the mutation fails", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    vi.mocked(patchMe).mockRejectedValue(new Error("Update refused"));
    const { queryClient } = renderWithProviders(<ProfileHeader profile={mockUser} />, {
      session: loggedIn,
      router: { refresh },
    });
    const chapter = screen.getByRole("combobox", { name: "Current chapter" });

    chapter.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: /Working/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Update refused"));
    expect(chapter).toHaveTextContent("Building");
    expect(
      queryClient.getQueryData<UserProfile>(
        queryKeys.profiles.detail(mockUser.id, mockUser.username),
      )?.status,
    ).toBe("BUILDING");
    expect(refresh).not.toHaveBeenCalled();
  });
});
