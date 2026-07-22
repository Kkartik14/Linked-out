import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LCard, Paginated, UserSummary } from "@linkedout/contracts";

import { HeaderSearch } from "@/components/search/header-search";
import { Header } from "@/components/layout/header";
import { searchLs, searchUsers } from "@/lib/api";
import { mockUser, renderWithProviders } from "@/test/utils";

const loggedIn = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, searchLs: vi.fn(), searchUsers: vi.fn() };
});

function l(overrides: Partial<LCard> = {}): LCard {
  return {
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
    ...overrides,
  };
}

function person(index: number): UserSummary {
  return {
    id: `01ARZ3NDEKTSV4RRFFQ69G5FC${index}`,
    username: `builder${index}`,
    name: `Builder ${index}`,
    image: null,
    status: "BUILDING",
  };
}

function page<T>(data: T[]): Paginated<T> {
  return { data, nextCursor: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(searchLs).mockResolvedValue(page([l()]));
  vi.mocked(searchUsers).mockResolvedValue(page([person(1), person(2), person(3), person(4)]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HeaderSearch", () => {
  it("keeps the desktop combobox and provides a mobile entry to the full search", () => {
    renderWithProviders(<Header />);

    expect(screen.getByRole("combobox", { name: /search ls and people/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /search ls and people/i })).toHaveAttribute(
      "href",
      "/search?focus=1",
    );
  });

  it("leaves search ownership to the full search route", () => {
    renderWithProviders(<Header />, { pathname: "/search", session: loggedIn });

    expect(screen.queryByRole("combobox", { name: /search ls and people/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /search ls and people/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Feed" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /linkedout home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /share an l/i })).toHaveAttribute("href", "/new");
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle light and dark theme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account menu/i })).toBeInTheDocument();
  });

  it("starts both grouped previews from the first character with bounded limits", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HeaderSearch />);

    const input = screen.getByRole("combobox", { name: /search ls and people/i });
    await user.type(input, "r");
    expect(searchLs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(searchLs).toHaveBeenCalledTimes(1));
    expect(searchLs).toHaveBeenCalledWith("r", undefined, 1, {
      signal: expect.any(AbortSignal),
    });
    expect(searchUsers).toHaveBeenCalledWith("r", undefined, 3, {
      signal: expect.any(AbortSignal),
    });

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Ls" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "People" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.queryByText("Builder 4")).not.toBeInTheDocument();
  });

  it("keeps focus on the combobox while arrows and Enter activate the flattened option order", async () => {
    const push = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HeaderSearch />, { router: { push } });
    const input = screen.getByRole("combobox");

    await user.type(input, "r");
    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringMatching(/option-0$/));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(push).toHaveBeenCalledWith("/search?q=r");
  });

  it("hides an obsolete response immediately while a newer query is debouncing", async () => {
    let resolveOld: ((value: Paginated<LCard>) => void) | undefined;
    vi.mocked(searchLs).mockImplementation((query) => {
      if (query === "r") {
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve(page([l({ title: "Running the new rollout" })]));
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HeaderSearch />);
    const input = screen.getByRole("combobox");

    await user.type(input, "r");
    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(searchLs).toHaveBeenCalledWith("r", undefined, 1, expect.anything()));

    await user.type(input, "unning");
    resolveOld?.(page([l({ title: "Obsolete result" })]));
    await Promise.resolve();
    expect(screen.queryByText("Obsolete result")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Searching");

    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(screen.getByText("Running the new rollout")).toBeInTheDocument());
  });

  it("closes on Escape without clearing the query or moving focus", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HeaderSearch />);
    const input = screen.getByRole("combobox");

    await user.type(input, "r");
    await vi.advanceTimersByTimeAsync(180);
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard("{Escape}");

    expect(input).toHaveValue("r");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
