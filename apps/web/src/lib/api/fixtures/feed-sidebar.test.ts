import { describe, expect, it } from "vitest";
import { feedSidebarResponseSchema, type UserProfile } from "@linkedout/contracts/v2";

import { makeFeedSidebarFixture } from "./feed-sidebar";

const NOW = new Date("2026-07-17T02:00:00.000Z");
const SIGNED_OUT = { user: null, needsOnboarding: false };

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    username: "kartik",
    name: "Kartik Gupta",
    image: null,
    bio: "Building in public. Surviving my Ls.",
    status: "BUILDING",
    reputation: {
      storiesShared: 12,
      lessonsShared: 30,
      buildersHelped: 184,
      lsShared: 47,
      collectionsCreated: 5,
    },
    counts: { followers: 320, following: 210 },
    viewer: { isFollowing: false, isSelf: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("feed sidebar fixture", () => {
  // The whole point of the fixture: if it drifts from the contract it fails loudly
  // here, rather than rendering a shape the real endpoint would never send.
  it("satisfies the contract schema when signed out (contract v2 §4)", () => {
    expect(() =>
      feedSidebarResponseSchema.parse(makeFeedSidebarFixture(NOW, SIGNED_OUT)),
    ).not.toThrow();
  });

  it("satisfies the contract schema when signed in", () => {
    expect(() =>
      feedSidebarResponseSchema.parse(
        makeFeedSidebarFixture(NOW, { user: profile(), needsOnboarding: false }),
      ),
    ).not.toThrow();
  });

  it("dates the Top Ls window to the rolling seven days ending at generatedAt", () => {
    const { generatedAt, topLs } = makeFeedSidebarFixture(NOW, SIGNED_OUT);

    expect(generatedAt).toBe("2026-07-17T02:00:00.000Z");
    expect(topLs.window.endsAt).toBe("2026-07-17T02:00:00.000Z");
    expect(topLs.window.startsAt).toBe("2026-07-10T02:00:00.000Z");
  });

  it("selects L of the day for today from the previous completed UTC day", () => {
    const daily = makeFeedSidebarFixture(NOW, SIGNED_OUT).lOfTheDay;

    expect(daily?.selectedFor).toBe("2026-07-17");
    expect(daily?.window.startsAt).toBe("2026-07-16T00:00:00.000Z");
    expect(daily?.window.endsAt).toBe("2026-07-17T00:00:00.000Z");
  });

  it("never de-anonymizes the daily L, and never repeats an L across the rails", () => {
    const { topLs, lOfTheDay } = makeFeedSidebarFixture(NOW, SIGNED_OUT);

    expect(lOfTheDay?.item.l.isAnonymous).toBe(false);
    expect(lOfTheDay?.item.l.author).not.toBeNull();

    const ids = topLs.items.map((item) => item.l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(lOfTheDay?.item.l.id);
  });

  it("exercises the anonymous Top L branch so dev sees it", () => {
    const { topLs } = makeFeedSidebarFixture(NOW, SIGNED_OUT);

    expect(topLs.items.some((item) => item.l.author === null)).toBe(true);
  });

  it("ranks Top Ls by interaction count descending, as the backend would", () => {
    const counts = makeFeedSidebarFixture(NOW, SIGNED_OUT).topLs.items.map(
      (item) => item.interactionCount,
    );

    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts.every((count) => count > 0)).toBe(true);
  });

  it("reports a signed-out viewer as SIGNED_OUT with no follow permission", () => {
    const { viewer, peopleToFollow } = makeFeedSidebarFixture(NOW, SIGNED_OUT);

    expect(viewer).toEqual({ state: "SIGNED_OUT", profile: null });
    expect(peopleToFollow.personalized).toBe(false);
    expect(peopleToFollow.items.every((item) => item.viewer.canFollow)).toBe(false);
  });

  it("reports an onboarded viewer as READY, personalized, and able to follow", () => {
    const me = profile();
    const { viewer, peopleToFollow } = makeFeedSidebarFixture(NOW, {
      user: me,
      needsOnboarding: false,
    });

    expect(viewer.state).toBe("READY");
    expect(viewer.profile).toEqual(me);
    expect(peopleToFollow.personalized).toBe(true);
    expect(peopleToFollow.items.every((item) => item.viewer.canFollow)).toBe(true);
  });

  it("reports a half-onboarded viewer as ONBOARDING_REQUIRED and not personalized", () => {
    const { viewer, peopleToFollow } = makeFeedSidebarFixture(NOW, {
      user: profile({ username: "", viewer: { isFollowing: false, isSelf: true } }),
      needsOnboarding: true,
    });

    expect(viewer.state).toBe("ONBOARDING_REQUIRED");
    expect(peopleToFollow.personalized).toBe(false);
  });

  it("never suggests the viewer to themselves", () => {
    const me = profile();
    const { peopleToFollow } = makeFeedSidebarFixture(NOW, { user: me, needsOnboarding: false });

    expect(peopleToFollow.items.some((item) => item.user.id === me.id)).toBe(false);
  });

  it("gives a positive count to every MUTUAL_FOLLOWS reason, and covers both reason codes", () => {
    const { peopleToFollow } = makeFeedSidebarFixture(NOW, {
      user: profile(),
      needsOnboarding: false,
    });
    const codes = peopleToFollow.items.map((item) => item.reason.code);

    expect(codes).toContain("MUTUAL_FOLLOWS");
    expect(codes).toContain("ACTIVE_BUILDER");
    for (const item of peopleToFollow.items) {
      if (item.reason.code === "MUTUAL_FOLLOWS") expect(item.reason.count).toBeGreaterThan(0);
    }
  });
});
