import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FeedSidebarResponse, UserProfile } from "@linkedout/contracts";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getProfile: vi.fn(),
    getFeedSidebar: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    patchMe: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ProfileHeader } from "@/components/profile/profile-header";
import { FeedSidebarLeft } from "@/components/feed/sidebar/feed-sidebar";
import { follow, getFeedSidebar, getProfile, patchMe } from "@/lib/api";
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

function viewerSidebar(following: number): FeedSidebarResponse {
  const generatedAt = Date.now();
  return {
    contractVersion: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    refreshAfter: new Date(generatedAt + 60_000).toISOString(),
    viewer: {
      state: "READY",
      profile: { ...mockUser, counts: { ...mockUser.counts, following } },
    },
    peopleToFollow: { personalized: true, items: [] },
    topLs: {
      basis: "MOST_INTERACTED",
      window: {
        startsAt: "2026-07-16T00:00:00.000Z",
        endsAt: "2026-07-23T00:00:00.000Z",
      },
      windowLabel: "Past 7 days",
      items: [],
    },
    lOfTheDay: null,
  };
}

function followingMetricValue(): string | null | undefined {
  return screen
    .getByRole("link", { name: "Following" })
    .closest("div")
    ?.querySelector("dd")?.textContent;
}

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
  vi.mocked(getFeedSidebar).mockResolvedValue(viewerSidebar(1));
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

  it("links the follower and following counts to their directories", () => {
    renderWithProviders(<ProfileHeader profile={profile} />, { session: loggedIn });

    expect(screen.getByRole("link", { name: /7 followers/ })).toHaveAttribute(
      "href",
      "/u/sam/followers",
    );
    expect(screen.getByRole("link", { name: /2 following/ })).toHaveAttribute(
      "href",
      "/u/sam/following",
    );
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
    expect(screen.getByRole("link", { name: /7 followers/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2 following/ })).toBeInTheDocument();

    await queryClient.invalidateQueries({
      queryKey: ["profiles", mockUser.id, "sam"],
      exact: true,
    });
    await waitFor(() => expect(getProfile).toHaveBeenCalledOnce());
    expect(screen.getByRole("link", { name: /9 followers/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3 following/ })).toBeInTheDocument();
  });

  it("reconciles both the profile and active viewer-card counts after follow", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FeedSidebarLeft initial={viewerSidebar(0)} />
        <ProfileHeader profile={profile} />
      </>,
      { session: loggedIn },
    );

    expect(followingMetricValue()).toBe("0");

    await user.click(screen.getByRole("button", { name: "Follow" }));

    expect(follow).toHaveBeenCalledWith(mockUser.id, "sam");
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /11 followers/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /4 following/ })).toBeInTheDocument();
    await waitFor(() => expect(getFeedSidebar).toHaveBeenCalledOnce());
    await waitFor(() => expect(followingMetricValue()).toBe("1"));
  });

  it("reconciles the active viewer card even when follow reports a failure", async () => {
    vi.mocked(follow).mockRejectedValueOnce(new Error("response lost"));
    vi.mocked(getFeedSidebar).mockResolvedValueOnce(viewerSidebar(1));
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FeedSidebarLeft initial={viewerSidebar(0)} />
        <ProfileHeader profile={profile} />
      </>,
      { session: loggedIn },
    );

    await user.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => expect(getFeedSidebar).toHaveBeenCalledOnce());
    await waitFor(() => expect(followingMetricValue()).toBe("1"));
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
    expect(screen.getByText("Updating current chapter…")).toHaveAttribute("aria-live", "polite");

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
