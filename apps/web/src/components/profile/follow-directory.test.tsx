import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FollowListUser, FollowResult, Paginated } from "@linkedout/contracts";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  };
});

import { FollowDirectory } from "@/components/profile/follow-directory";
import { follow, getFollowers, getFollowing, unfollow } from "@/lib/api";

const loggedIn: Session = { status: "authenticated", user: mockUser, needsOnboarding: false };

function row(o: {
  id: string;
  username: string;
  name?: string | null;
  isFollowing?: boolean;
  isSelf?: boolean;
}): FollowListUser {
  return {
    user: { id: o.id, username: o.username, name: o.name ?? null, image: null, status: null },
    viewer: { isFollowing: o.isFollowing ?? false, isSelf: o.isSelf ?? false },
  };
}

const page = (data: FollowListUser[]): Paginated<FollowListUser> => ({ data, nextCursor: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FollowDirectory", () => {
  it("fetches the followers endpoint and renders rows for that variant", async () => {
    vi.mocked(getFollowers).mockResolvedValue(
      page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB1", username: "ann", name: "Ann" })]),
    );
    renderWithProviders(<FollowDirectory username="sam" variant="followers" />, {
      session: loggedIn,
    });

    expect(await screen.findByText("Ann")).toBeInTheDocument();
    expect(screen.getByText("@ann")).toBeInTheDocument();
    expect(getFollowers).toHaveBeenCalledWith("sam", undefined);
    expect(getFollowing).not.toHaveBeenCalled();
  });

  it("renders the server-seeded first page immediately", () => {
    const seeded = page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB2", username: "bob", name: "Bob" })]);
    vi.mocked(getFollowing).mockResolvedValue(seeded);
    renderWithProviders(
      <FollowDirectory username="sam" variant="following" initial={seeded} />,
      { session: loggedIn },
    );

    // Seeded from the server component: visible on first render, no skeleton to await.
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows a variant-specific empty state", async () => {
    vi.mocked(getFollowing).mockResolvedValue(page([]));
    renderWithProviders(<FollowDirectory username="sam" variant="following" />, {
      session: loggedIn,
    });

    expect(await screen.findByText("Not following anyone yet.")).toBeInTheDocument();
    // Symmetric to the followers case: the following variant hits /following, never /followers.
    expect(getFollowing).toHaveBeenCalledWith("sam", undefined);
    expect(getFollowers).not.toHaveBeenCalled();
  });

  it("omits the follow control on the viewer's own row", async () => {
    vi.mocked(getFollowers).mockResolvedValue(
      page([
        row({ id: mockUser.id, username: "kartik", name: "Kartik", isSelf: true }),
        row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB3", username: "ann", name: "Ann" }),
      ]),
    );
    renderWithProviders(<FollowDirectory username="sam" variant="followers" />, {
      session: loggedIn,
    });

    await screen.findByText("Kartik");
    // Exactly one Follow control — for Ann, never for the self row.
    expect(screen.getAllByRole("button", { name: "Follow" })).toHaveLength(1);
  });

  it("follows a not-followed row with optimistic state", async () => {
    const user = userEvent.setup();
    vi.mocked(getFollowers).mockResolvedValue(
      page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB4", username: "ann", name: "Ann" })]),
    );
    vi.mocked(follow).mockResolvedValue({
      isFollowing: true,
      counts: { followers: 1, following: 0 },
    });
    renderWithProviders(<FollowDirectory username="sam" variant="followers" />, {
      session: loggedIn,
    });

    await user.click(await screen.findByRole("button", { name: "Follow" }));

    expect(follow).toHaveBeenCalledWith(mockUser.id, "ann");
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();
  });

  it("optimistically flips, then rolls back when the follow fails", async () => {
    const user = userEvent.setup();
    let rejectFollow!: (reason: Error) => void;
    vi.mocked(getFollowers).mockResolvedValue(
      page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB7", username: "ann", name: "Ann" })]),
    );
    // A request we control, so the optimistic state is observable before it settles.
    vi.mocked(follow).mockReturnValue(
      new Promise<FollowResult>((_resolve, reject) => {
        rejectFollow = reject;
      }),
    );
    renderWithProviders(<FollowDirectory username="sam" variant="followers" />, {
      session: loggedIn,
    });

    await user.click(await screen.findByRole("button", { name: "Follow" }));
    // Optimistic: the row flips to Following before the request resolves.
    expect(await screen.findByRole("button", { name: "Following" })).toBeInTheDocument();

    rejectFollow(new Error("nope"));
    // Rolled back: a failed request restores the pre-click state.
    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();
  });

  it("unfollows a followed row", async () => {
    const user = userEvent.setup();
    vi.mocked(getFollowing).mockResolvedValue(
      page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB5", username: "bob", name: "Bob", isFollowing: true })]),
    );
    vi.mocked(unfollow).mockResolvedValue({
      isFollowing: false,
      counts: { followers: 0, following: 0 },
    });
    renderWithProviders(<FollowDirectory username="sam" variant="following" />, {
      session: loggedIn,
    });

    await user.click(await screen.findByRole("button", { name: "Following" }));

    expect(unfollow).toHaveBeenCalledWith(mockUser.id, "bob");
    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();
  });

  it("sends a signed-out viewer to login instead of mutating", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(getFollowers).mockResolvedValue(
      page([row({ id: "01ARZ3NDEKTSV4RRFFQ69G5FB6", username: "ann", name: "Ann" })]),
    );
    renderWithProviders(<FollowDirectory username="sam" variant="followers" />, {
      router: { push },
      pathname: "/u/sam/followers",
    });

    await user.click(await screen.findByRole("button", { name: "Follow" }));

    expect(push).toHaveBeenCalledWith("/login?returnTo=%2Fu%2Fsam%2Ffollowers");
    expect(follow).not.toHaveBeenCalled();
  });
});
