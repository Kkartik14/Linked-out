import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    addReaction: vi.fn(async () => ({
      reactions: { total: 4, beenThere: 4, helpful: 2, respect: 0, pain: 0, saved: 1 },
      viewer: { reactions: ["BEEN_THERE"] },
    })),
    removeReaction: vi.fn(async () => ({
      reactions: { total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 },
      viewer: { reactions: [] },
    })),
  };
});

import { ReactionBar } from "@/components/l/reaction-bar";
import { addReaction } from "@/lib/api";

const loggedIn: Session = { user: mockUser, needsOnboarding: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReactionBar", () => {
  it("optimistically increments a reaction and calls the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={{ total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 }}
        viewerReactions={[]}
        commentCount={0}
        commentHref="#"
      />,
      { session: loggedIn },
    );

    await user.click(screen.getByRole("button", { name: /been there/i }));

    expect(addReaction).toHaveBeenCalledWith("l1", "BEEN_THERE");
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /been there/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
