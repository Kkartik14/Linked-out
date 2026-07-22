import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LCard, Paginated, UserSummary } from "@linkedout/contracts";

import { SearchClient } from "@/components/search/search-client";
import { searchLs, searchUsers } from "@/lib/api";
import { mockUser, renderWithProviders } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, searchLs: vi.fn(), searchUsers: vi.fn() };
});

const RESULT: LCard = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
  title: "Running a careful migration",
  storyPreview: "What changed during the rollout.",
  type: "STORY",
  visibility: "PUBLIC",
  isAnonymous: false,
  resolvedAt: null,
  author: mockUser,
  reactions: { total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
  commentCount: 0,
  viewer: { reactions: [], canEdit: false },
  createdAt: "2026-07-21T00:00:00.000Z",
};

const PERSON: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC1",
  username: "runner",
  name: "Rina Runner",
  image: null,
  status: "BUILDING",
};

function page<T>(data: T[]): Paginated<T> {
  return { data, nextCursor: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState(null, "", "/search");
  vi.mocked(searchLs).mockResolvedValue(page([RESULT]));
  vi.mocked(searchUsers).mockResolvedValue(page([PERSON]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchClient", () => {
  it("renders the normal feed centre beneath an empty search", () => {
    renderWithProviders(
      <SearchClient q="" type="ls" emptyContent={<p>Normal feed content</p>} />,
      { pathname: "/search" },
    );

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByText("Normal feed content")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(searchLs).not.toHaveBeenCalled();
  });

  it("searches live from one character and mirrors the settled query into the URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <SearchClient q="" type="ls" emptyContent={<p>Normal feed content</p>} />,
      { pathname: "/search" },
    );

    await user.type(screen.getByRole("searchbox", { name: /search ls and people/i }), "r");
    expect(screen.queryByText(RESULT.title)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(180);

    await waitFor(() => expect(screen.getByText(RESULT.title)).toBeInTheDocument());
    expect(searchLs).toHaveBeenCalledWith("r", undefined, undefined, {
      signal: expect.any(AbortSignal),
    });
    expect(window.location.pathname + window.location.search).toBe("/search?q=r");
  });

  it("switches to people without losing the query and preserves unrelated URL state", async () => {
    window.history.replaceState(null, "", "/search?focus=1");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <SearchClient q="" type="ls" emptyContent={<p>Normal feed content</p>} />,
      { pathname: "/search" },
    );

    await user.type(screen.getByRole("searchbox", { name: /search ls and people/i }), "r");
    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(screen.getByRole("tab", { name: "People" })).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "People" }));

    await waitFor(() => expect(screen.getByText("Rina Runner")).toBeInTheDocument());
    expect(searchUsers).toHaveBeenCalledWith("r", undefined, undefined, {
      signal: expect.any(AbortSignal),
    });
    const params = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(params)).toEqual({ focus: "1", q: "r", type: "users" });
  });

  it("focuses only when the entry route asks it to", () => {
    renderWithProviders(
      <SearchClient q="" type="ls" focusInput emptyContent={<p>Normal feed content</p>} />,
      { pathname: "/search" },
    );

    expect(screen.getByRole("searchbox", { name: /search ls and people/i })).toHaveFocus();
  });

  it("reveals the feed slot when a deep-linked query is cleared", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <SearchClient
        q="running"
        type="ls"
        initialLs={page([RESULT])}
        emptyContent={<p>Lazy feed content</p>}
      />,
      { pathname: "/search" },
    );

    expect(screen.queryByText("Lazy feed content")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ls" })).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: /search ls and people/i }));

    expect(screen.getByText("Lazy feed content")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("synchronizes query, result type, and empty content on browser history traversal", async () => {
    renderWithProviders(
      <SearchClient
        q="running"
        type="ls"
        initialLs={page([RESULT])}
        emptyContent={<p>Normal feed content</p>}
      />,
      { pathname: "/search" },
    );

    act(() => {
      window.history.pushState(null, "", "/search?q=runner&type=users");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByRole("searchbox", { name: /search ls and people/i })).toHaveValue(
      "runner",
    );
    expect(screen.getByRole("tab", { name: "People" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(screen.getByText(PERSON.name!)).toBeInTheDocument());

    act(() => {
      window.history.pushState(null, "", "/search");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByRole("searchbox", { name: /search ls and people/i })).toHaveValue("");
    expect(screen.getByText("Normal feed content")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
