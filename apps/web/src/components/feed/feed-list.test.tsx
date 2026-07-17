import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { lCardSchema, type LCard as LCardType, type Paginated } from "@linkedout/contracts/v2";

import { renderWithProviders } from "@/test/utils";

// Stubbed so a test never reaches the network: the harness's QueryClient runs at staleTime 0
// and refetches on mount, so the real `getFeed` would fire on every render below.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getFeed: vi.fn().mockResolvedValue({ data: [], nextCursor: null }) };
});

import { FeedList } from "@/components/feed/feed-list";

function card(id: string, title: string): LCardType {
  // Parsed, not asserted: the contract is the oracle, so a fixture that drifts from `LCard`
  // fails here rather than quietly proving nothing.
  return lCardSchema.parse({
    id,
    title,
    storyPreview: "Four rounds in, strong signals, and then silence…",
    type: "STORY",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    author: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", username: "anaya", name: "Anaya Rao", image: null, status: "INTERVIEWING" },
    reactions: { total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
    commentCount: 0,
    viewer: { reactions: [], canEdit: false },
    createdAt: "2026-07-01T00:00:00.000Z",
  });
}

function page(data: LCardType[], nextCursor: string | null = null): Paginated<LCardType> {
  return { data, nextCursor };
}

const FIRST = card("01ARZ3NDEKTSV4RRFFQ69G5FA1", "Rejected after the final round");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedList", () => {
  // Synchronously, with no `waitFor`: the server already fetched this page, so it must paint
  // from `initial` rather than flashing a skeleton while the client re-fetches it.
  //
  // Deliberately not asserted: that `getFeed` is never called. Under the app's real
  // `staleTime: 60_000` it wouldn't be — but `renderWithProviders` builds its own QueryClient
  // carrying only `retry: false`, so tests run at `staleTime: 0` and always refetch on mount.
  // That assertion would pin the harness's defaults, not the app's.
  it("paints the server's first page immediately", () => {
    renderWithProviders(<FeedList initial={page([FIRST])} scope="global" sort="latest" />);

    expect(screen.getByText("Rejected after the final round")).toBeInTheDocument();
  });

  it("tells a signed-out reader the global feed is empty", () => {
    renderWithProviders(<FeedList initial={page([])} scope="global" sort="latest" />);

    expect(screen.getByText("No Ls to show yet.")).toBeInTheDocument();
  });

  // The empty copy is scope-specific: an empty Following feed is a prompt to follow someone,
  // not a statement that the product has no content.
  it("tells a reader with an empty Following feed to follow someone", () => {
    renderWithProviders(<FeedList initial={page([])} scope="following" sort="latest" />);

    expect(
      screen.getByText("Follow some builders and their Ls will show up here."),
    ).toBeInTheDocument();
  });

  it("marks the end of the feed once every page has arrived", () => {
    renderWithProviders(<FeedList initial={page([FIRST], null)} scope="global" sort="latest" />);

    expect(screen.getByText(/reached the end/)).toBeInTheDocument();
  });

  it("does not claim the end while another page is still available", () => {
    renderWithProviders(
      <FeedList initial={page([FIRST], "cursor-2")} scope="global" sort="latest" />,
    );

    expect(screen.queryByText(/reached the end/)).not.toBeInTheDocument();
  });

  it("does not mark the end of an empty feed", () => {
    renderWithProviders(<FeedList initial={page([])} scope="global" sort="latest" />);

    expect(screen.queryByText(/reached the end/)).not.toBeInTheDocument();
  });

  // Not covered here: the "Couldn't load the feed." fallback and the retry button. Both only
  // appear once a *next-page* fetch rejects, and that fetch is triggered by the sentinel
  // scrolling into view — which jsdom, having no layout, cannot do (see src/test/setup.ts).
  // Faking an intersection would assert the error UI against a scroll that never happened.
  // That path belongs in e2e/feed.spec.ts, against a real viewport.
});
