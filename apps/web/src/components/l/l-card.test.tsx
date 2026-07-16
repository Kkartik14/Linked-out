import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { LCard as LCardType } from "@linkedout/contracts/v2";

import { LCard } from "@/components/l/l-card";
import { renderWithProviders } from "@/test/utils";

function makeCard(overrides: Partial<LCardType> = {}): LCardType {
  return {
    id: "l1",
    title: "Rejected after the final round at Google",
    storyPreview: "Four rounds in, strong signals, and then silence…",
    type: "STORY",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    author: { id: "u1", username: "anaya", name: "Anaya Rao", image: null, status: "INTERVIEWING" },
    reactions: { total: 5, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 },
    commentCount: 2,
    viewer: { reactions: [], canEdit: false },
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("LCard", () => {
  it("renders the title and author, and links to the author's profile", () => {
    renderWithProviders(<LCard l={makeCard()} />);

    expect(screen.getByText("Rejected after the final round at Google")).toBeInTheDocument();
    expect(screen.getByText("Anaya Rao")).toBeInTheDocument();

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/u/anaya");
    expect(hrefs).toContain("/ls/l1");
  });

  it("shows an Anonymous placeholder and never links to a profile", () => {
    renderWithProviders(<LCard l={makeCard({ isAnonymous: true, author: null })} />);

    expect(screen.getByText("Anonymous builder")).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/u/"))).toBe(false);
  });

  it("marks an unresolved battle as Ongoing", () => {
    renderWithProviders(<LCard l={makeCard({ type: "BATTLE", resolvedAt: null })} />);
    expect(screen.getByText("Ongoing")).toBeInTheDocument();
  });

  // v2 removed category, company, tags, and eventDate from the wire, but the live v1
  // endpoint still sends them during the migration. Assert the card ignores them rather
  // than trusting that they merely stopped arriving.
  it("renders no category, company, event date, or tags, even when v1 still sends them", () => {
    const withLegacyFields = {
      ...makeCard(),
      category: "INTERVIEWS",
      company: "Google",
      tags: ["interview", "faang"],
      eventDate: "2026-05-10T00:00:00.000Z",
    } as LCardType;

    renderWithProviders(<LCard l={withLegacyFields} />);

    expect(screen.queryByText("Interviews")).not.toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("#interview")).not.toBeInTheDocument();
    expect(screen.queryByText("#faang")).not.toBeInTheDocument();
    expect(screen.queryByText("May 10, 2026")).not.toBeInTheDocument();
    // Tag chips were the only thing linking a card into search.
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/search"))).toBe(false);
  });
});
