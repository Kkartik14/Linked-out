import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { FeedCentre } from "@/components/feed/feed-centre";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getFeed: vi.fn().mockResolvedValue({ data: [], nextCursor: null }) };
});

const EMPTY_PAGE = { data: [], nextCursor: null };

describe("FeedCentre", () => {
  it("introduces the standalone feed by default", () => {
    renderWithProviders(
      <FeedCentre
        initial={EMPTY_PAGE}
        scope="global"
        sort="latest"
        canUseFollowingFeed={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "The Feed" })).toBeInTheDocument();
    expect(screen.getByText(/honest career stories/i)).toBeInTheDocument();
  });

  it("omits repeated introductory copy when embedded while retaining feed controls", () => {
    renderWithProviders(
      <FeedCentre
        initial={EMPTY_PAGE}
        scope="global"
        sort="latest"
        canUseFollowingFeed={false}
        showIntroduction={false}
      />,
      { pathname: "/search" },
    );

    expect(screen.queryByRole("heading", { name: "The Feed" })).not.toBeInTheDocument();
    expect(screen.queryByText(/honest career stories/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Latest" })).toBeInTheDocument();
  });
});
