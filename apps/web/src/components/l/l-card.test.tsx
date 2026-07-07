import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { LCard as LCardType } from "@linkedout/contracts";

import { LCard } from "@/components/l/l-card";
import { renderWithProviders } from "@/test/utils";

function makeCard(overrides: Partial<LCardType> = {}): LCardType {
  return {
    id: "l1",
    title: "Rejected after the final round at Google",
    storyPreview: "Four rounds in, strong signals, and then silence…",
    lessonLearned: "Optimize for signal, not for hope.",
    type: "STORY",
    category: "INTERVIEWS",
    company: "Google",
    tags: ["interview"],
    eventDate: null,
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
  it("renders the title, author, and lesson, and links to the author's profile", () => {
    renderWithProviders(<LCard l={makeCard()} />);

    expect(screen.getByText("Rejected after the final round at Google")).toBeInTheDocument();
    expect(screen.getByText("Anaya Rao")).toBeInTheDocument();
    expect(screen.getByText("Optimize for signal, not for hope.")).toBeInTheDocument();

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
});
