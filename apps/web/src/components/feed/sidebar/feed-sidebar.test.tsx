import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  feedSidebarResponseSchema,
  type AuthMeResponse,
  type FeedSidebarResponse,
  type LCard,
  type UserSummary,
} from "@linkedout/contracts/v2";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getFeedSidebar: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  };
});

import { FeedSidebarLeft, FeedSidebarRight } from "@/components/feed/sidebar/feed-sidebar";
import { follow, getFeedSidebar } from "@/lib/api";

const loggedIn: Session = { user: mockUser, needsOnboarding: false };
const signedOut: Session = { user: null, needsOnboarding: false };

const RUPA: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC0",
  username: "rupa",
  name: "Rupa Iyer",
  image: null,
  status: "RECOVERING",
};
const DEV: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC1",
  username: "devansh",
  name: "Devansh Mehta",
  image: null,
  status: "INTERVIEWING",
};

function card(over: Pick<LCard, "id" | "title" | "author" | "isAnonymous">): LCard {
  return {
    storyPreview: "A short account of what happened, and what it taught.",
    type: "STORY",
    visibility: "PUBLIC",
    resolvedAt: null,
    reactions: { total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
    commentCount: 0,
    viewer: { reactions: [], canEdit: false },
    createdAt: "2026-07-14T09:30:00.000Z",
    ...over,
  };
}

/**
 * A response shaped exactly as the endpoint sends it. Built here rather than imported,
 * because it is test data: it exists to pin these components' behaviour, and it is
 * validated against the real contract below so it cannot quietly drift from the wire.
 */
function sidebar(me: AuthMeResponse): FeedSidebarResponse {
  const ready = me.user !== null && !me.needsOnboarding;
  const viewer: FeedSidebarResponse["viewer"] = !me.user
    ? { state: "SIGNED_OUT", profile: null }
    : me.needsOnboarding
      ? { state: "ONBOARDING_REQUIRED", profile: me.user }
      : { state: "READY", profile: me.user };

  return {
    contractVersion: 2,
    generatedAt: "2026-07-17T02:00:00.000Z",
    refreshAfter: "2026-07-17T02:01:00.000Z",
    viewer,
    peopleToFollow: {
      personalized: ready,
      items: [
        {
          user: RUPA,
          reason: { code: "MUTUAL_FOLLOWS", count: 3, text: "3 mutual follows" },
          viewer: { canFollow: ready },
        },
        {
          user: DEV,
          reason: { code: "ACTIVE_BUILDER", text: "Active builder this week" },
          viewer: { canFollow: ready },
        },
      ],
    },
    topLs: {
      basis: "MOST_INTERACTED",
      // Exactly seven days, so the derived caption is assertable.
      window: { startsAt: "2026-07-10T02:00:00.000Z", endsAt: "2026-07-17T02:00:00.000Z" },
      items: [
        {
          l: card({
            id: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
            title: "We shipped to 40,000 users with a migration that had never been tested",
            author: DEV,
            isAnonymous: false,
          }),
          interactionCount: 34,
          interactionLabel: "34 builders interacted",
        },
        {
          // Anonymous Ls are eligible for Top Ls and stay unattributed (contract §2).
          l: card({
            id: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
            title: "I burned out and told nobody for seven months",
            author: null,
            isAnonymous: true,
          }),
          interactionCount: 27,
          interactionLabel: "27 builders interacted",
        },
      ],
    },
    lOfTheDay: {
      selectedFor: "2026-07-17",
      basis: "MOST_INTERACTED",
      window: { startsAt: "2026-07-16T00:00:00.000Z", endsAt: "2026-07-17T00:00:00.000Z" },
      item: {
        l: {
          ...card({
            id: "01ARZ3NDEKTSV4RRFFQ69G5FB5",
            title: "The startup died on a Tuesday. I want to talk about the Wednesday.",
            author: RUPA,
            isAnonymous: false,
          }),
          isAnonymous: false as const,
          author: RUPA,
        },
        interactionCount: 41,
        interactionLabel: "41 builders interacted",
      },
    },
  };
}

function guestSidebar(): FeedSidebarResponse {
  return sidebar({ user: null, needsOnboarding: false });
}

function memberSidebar(): FeedSidebarResponse {
  return sidebar({ user: mockUser, needsOnboarding: false });
}

describe("the test data matches the wire", () => {
  it("satisfies the contract schema, so these tests cannot drift from the endpoint", () => {
    expect(() => feedSidebarResponseSchema.parse(guestSidebar())).not.toThrow();
    expect(() => feedSidebarResponseSchema.parse(memberSidebar())).not.toThrow();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFeedSidebar).mockResolvedValue(guestSidebar());
});

describe("FeedSidebarRight — Top Ls", () => {
  it("renders the backend's order verbatim and never re-ranks it", () => {
    const sidebar = guestSidebar();
    renderWithProviders(<FeedSidebarRight initial={sidebar} />, { session: signedOut });

    const rendered = within(screen.getByRole("region", { name: /top ls/i }))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    // `items` order is authoritative (contract v2 §2).
    sidebar.topLs.items.forEach((item, index) => {
      expect(rendered[index]).toContain(item.l.title);
    });
  });

  it("shows each interactionLabel verbatim rather than composing its own copy", () => {
    const sidebar = guestSidebar();
    renderWithProviders(<FeedSidebarRight initial={sidebar} />, { session: signedOut });

    for (const item of sidebar.topLs.items) {
      expect(screen.getAllByText(item.interactionLabel).length).toBeGreaterThan(0);
    }
  });

  it("keeps an anonymous Top L unattributed and unlinked", () => {
    const sidebar = guestSidebar();
    const anon = sidebar.topLs.items.find((item) => item.l.author === null);
    expect(anon, "fixture must cover the anonymous branch").toBeDefined();

    renderWithProviders(<FeedSidebarRight initial={sidebar} />, { session: signedOut });

    const row = screen.getByText(anon!.l.title).closest("li");
    expect(within(row!).getByText("Anonymous builder")).toBeInTheDocument();
    const hrefs = within(row!)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/u/"))).toBe(false);
    expect(hrefs).toContain(`/ls/${anon!.l.id}`);
  });

  it("links each Top L to its detail page", () => {
    const sidebar = guestSidebar();
    renderWithProviders(<FeedSidebarRight initial={sidebar} />, { session: signedOut });

    const first = sidebar.topLs.items[0]!;
    expect(screen.getByRole("link", { name: new RegExp(first.l.title.slice(0, 30), "i") })).toHaveAttribute(
      "href",
      `/ls/${first.l.id}`,
    );
  });

  it("captions the rail with the window the backend actually returned", () => {
    renderWithProviders(<FeedSidebarRight initial={guestSidebar()} />, { session: signedOut });

    // Derived from window.startsAt/endsAt, not hardcoded — if the backend widens the
    // window, the caption follows it.
    expect(screen.getByText("Past 7 days")).toBeInTheDocument();
  });

  it("hides the Top Ls section entirely when the backend returns none", () => {
    const empty = { ...guestSidebar(), topLs: { ...guestSidebar().topLs, items: [] } };
    renderWithProviders(<FeedSidebarRight initial={empty} />, { session: signedOut });

    expect(screen.queryByRole("region", { name: /top ls/i })).not.toBeInTheDocument();
  });
});

describe("FeedSidebarRight — L of the day", () => {
  it("renders the attributed daily L with its author and verbatim label", () => {
    const sidebar = guestSidebar();
    const daily = sidebar.lOfTheDay!;
    renderWithProviders(<FeedSidebarRight initial={sidebar} />, { session: signedOut });

    const region = screen.getByRole("region", { name: /l of the day/i });
    expect(within(region).getByText(daily.item.l.title)).toBeInTheDocument();
    expect(within(region).getByText(daily.item.interactionLabel)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: daily.item.l.author.name! })).toHaveAttribute(
      "href",
      `/u/${daily.item.l.author.username}`,
    );
  });

  it("omits the section when no candidate qualified, rather than filling the slot", () => {
    const none = { ...guestSidebar(), lOfTheDay: null };
    renderWithProviders(<FeedSidebarRight initial={none} />, { session: signedOut });

    expect(screen.queryByRole("region", { name: /l of the day/i })).not.toBeInTheDocument();
  });
});

describe("FeedSidebarLeft — viewer card", () => {
  it("invites a signed-out visitor to log in", () => {
    renderWithProviders(<FeedSidebarLeft initial={guestSidebar()} />, { session: signedOut });

    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  it("shows a signed-in builder their profile and reputation, not their follower count", () => {
    renderWithProviders(<FeedSidebarLeft initial={memberSidebar()} />, { session: loggedIn });

    const region = screen.getByRole("region", { name: /your profile/i });
    expect(within(region).getByText(mockUser.name!)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /view profile/i })).toHaveAttribute(
      "href",
      `/u/${mockUser.username}`,
    );
    // product.md: reputation over vanity metrics.
    expect(within(region).getByText(/Ls Shared/)).toBeInTheDocument();
    expect(within(region).queryByText(/followers/i)).not.toBeInTheDocument();
  });

  it("sends a half-onboarded viewer to finish onboarding", () => {
    renderWithProviders(<FeedSidebarLeft initial={sidebar({ user: mockUser, needsOnboarding: true })} />, {
      session: { user: mockUser, needsOnboarding: true },
    });

    expect(screen.getByRole("link", { name: /finish/i })).toHaveAttribute("href", "/onboarding");
  });
});

describe("FeedSidebarLeft — people to follow", () => {
  it("renders each suggestion's reason text verbatim, on its own row", () => {
    const sidebar = memberSidebar();
    renderWithProviders(<FeedSidebarLeft initial={sidebar} />, { session: loggedIn });

    // Asserted per row: two suggestions can legitimately share the same reason copy.
    const rows = within(screen.getByRole("region", { name: /people to follow/i })).getAllByRole(
      "listitem",
    );
    sidebar.peopleToFollow.items.forEach((item, index) => {
      expect(within(rows[index]!).getByText(item.reason.text)).toBeInTheDocument();
    });
  });

  it("keeps the backend's suggestion order", () => {
    const sidebar = memberSidebar();
    renderWithProviders(<FeedSidebarLeft initial={sidebar} />, { session: loggedIn });

    const rendered = within(screen.getByRole("region", { name: /people to follow/i }))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    sidebar.peopleToFollow.items.forEach((item, index) => {
      expect(rendered[index]).toContain(item.user.name);
    });
  });

  it("routes a guest to log in instead of attempting a follow it cannot perform", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedSidebarLeft initial={guestSidebar()} />, { session: signedOut });

    // canFollow is false for guests, so the write must never fire.
    await user.click(screen.getAllByRole("link", { name: /^follow/i })[0]!);
    expect(follow).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: /^follow/i })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/login?returnTo="),
    );
  });

  it("drops the suggestion optimistically, before the write settles", async () => {
    const sidebar = memberSidebar();
    const target = sidebar.peopleToFollow.items[0]!;
    // Never resolves: whatever the row does now, it did without waiting for the server.
    vi.mocked(follow).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    renderWithProviders(<FeedSidebarLeft initial={sidebar} />, { session: loggedIn });

    await user.click(
      screen.getByRole("button", { name: new RegExp(`follow ${target.user.name}`, "i") }),
    );

    expect(follow).toHaveBeenCalledWith(target.user.username);
    await waitFor(() => expect(screen.queryByText(target.user.name!)).not.toBeInTheDocument());
  });

  it("refetches the aggregate after a follow so the backend can backfill the slot", async () => {
    const sidebar = memberSidebar();
    const target = sidebar.peopleToFollow.items[0]!;
    vi.mocked(follow).mockResolvedValue({
      isFollowing: true,
      counts: { followers: 1, following: 1 },
    });
    // A followed builder is no longer an eligible suggestion, so the next response drops
    // them and ranks someone else in. Only the backend decides that.
    vi.mocked(getFeedSidebar).mockResolvedValue({
      ...sidebar,
      peopleToFollow: {
        ...sidebar.peopleToFollow,
        items: sidebar.peopleToFollow.items.filter((item) => item.user.id !== target.user.id),
      },
    });
    const user = userEvent.setup();

    renderWithProviders(<FeedSidebarLeft initial={sidebar} />, { session: loggedIn });

    await user.click(
      screen.getByRole("button", { name: new RegExp(`follow ${target.user.name}`, "i") }),
    );

    await waitFor(() => expect(getFeedSidebar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(target.user.name!)).not.toBeInTheDocument());
  });

  it("restores the suggestion if the follow fails", async () => {
    const sidebar = memberSidebar();
    const target = sidebar.peopleToFollow.items[0]!;
    vi.mocked(follow).mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();

    renderWithProviders(<FeedSidebarLeft initial={sidebar} />, { session: loggedIn });

    await user.click(
      screen.getByRole("button", { name: new RegExp(`follow ${target.user.name}`, "i") }),
    );

    await waitFor(() => expect(screen.getByText(target.user.name!)).toBeInTheDocument());
  });

  it("hides the section when the backend suggests nobody", () => {
    const base = memberSidebar();
    const empty = { ...base, peopleToFollow: { ...base.peopleToFollow, items: [] } };
    renderWithProviders(<FeedSidebarLeft initial={empty} />, { session: loggedIn });

    expect(screen.queryByRole("region", { name: /people to follow/i })).not.toBeInTheDocument();
  });
});

describe("rails are hidden on narrow viewports", () => {
  // Regression guard. `cn` is tailwind-merge, so composing "hidden lg:flex" with a RAIL
  // string that itself carried `flex` silently deleted the `hidden` — same conflict slot,
  // later wins — and the rails rendered on mobile, under an infinite feed, where the
  // layout never intended them. jsdom applies no CSS, so a visibility assertion cannot
  // see this; the merged class list is the only observable that can.
  it("keeps `hidden` on the left rail after class merging", () => {
    renderWithProviders(<FeedSidebarLeft initial={guestSidebar()} />, { session: signedOut });

    const rail = screen.getByRole("complementary", { name: /your profile/i });
    expect(rail).toHaveClass("hidden");
    expect(rail).toHaveClass("lg:flex");
  });

  it("keeps `hidden` on the right rail after class merging", () => {
    renderWithProviders(<FeedSidebarRight initial={guestSidebar()} />, { session: signedOut });

    const rail = screen.getByRole("complementary", { name: /top ls/i });
    expect(rail).toHaveClass("hidden");
    expect(rail).toHaveClass("xl:flex");
  });
});

describe("sidebar failure is independent of the feed", () => {
  it("renders nothing at all when the aggregate is unavailable", async () => {
    vi.mocked(getFeedSidebar).mockRejectedValue(new Error("500"));
    const { container } = renderWithProviders(<FeedSidebarRight initial={undefined} />, {
      session: signedOut,
    });

    // The contract permits hiding the rails; the centre feed is rendered by its own page.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
