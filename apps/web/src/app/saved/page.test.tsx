import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { FeedSidebarResponse } from "@linkedout/contracts";

import { mockUser, renderWithProviders } from "@/test/utils";

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getFeedSidebar: vi.fn(),
    getSaved: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  };
});

import SavedPage from "@/app/saved/page";
import { getFeedSidebar } from "@/lib/api";
import { getSession } from "@/lib/session";

const SESSION = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;
const GENERATED_AT_MS = Date.now();
const SIDEBAR: FeedSidebarResponse = {
  contractVersion: 1,
  generatedAt: new Date(GENERATED_AT_MS).toISOString(),
  refreshAfter: new Date(GENERATED_AT_MS + 60_000).toISOString(),
  viewer: { state: "READY", profile: mockUser },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(getFeedSidebar).mockResolvedValue(SIDEBAR);
});

describe("SavedPage", () => {
  it("renders Saved inside the shared two-rail discovery shell", async () => {
    renderWithProviders(await SavedPage(), { session: SESSION, pathname: "/saved" });

    expect(screen.getByRole("heading", { name: "Saved" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /profile and discovery/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /top ls and l of the day/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it("keeps Saved and static navigation usable when the ancillary rails fail", async () => {
    vi.mocked(getFeedSidebar).mockRejectedValue(new Error("sidebar unavailable"));

    renderWithProviders(await SavedPage(), { session: SESSION, pathname: "/saved" });

    expect(screen.getByRole("heading", { name: "Saved" })).toBeInTheDocument();
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute(
      "href",
      "/search?focus=1",
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("complementary", { name: /top ls and l of the day/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("authorizes the viewer before requesting viewer-dependent rails", async () => {
    vi.mocked(getSession).mockResolvedValue({ status: "guest" });

    await expect(SavedPage()).rejects.toThrow();
    expect(getFeedSidebar).not.toHaveBeenCalled();
  });
});
