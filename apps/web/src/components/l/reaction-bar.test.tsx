import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

const loggedIn: Session = { status: "authenticated", user: mockUser, needsOnboarding: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReactionBar", () => {
  it("shows only the add control when no expressive reaction has been used", () => {
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={{ total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 }}
        viewerReactions={[]}
        commentCount={0}
        commentHref="#comments"
      />,
      { session: loggedIn },
    );

    expect(screen.getByRole("button", { name: "Add reaction" })).toHaveTextContent("+");
    expect(screen.queryByRole("button", { name: /been there/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /helpful/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it.each([
    {
      label: "one",
      reactions: { total: 1, beenThere: 1, helpful: 0, respect: 0, pain: 0, saved: 0 },
      visible: [/been there/i],
    },
    {
      label: "three",
      reactions: { total: 13, beenThere: 3, helpful: 2, respect: 1, pain: 0, saved: 7 },
      visible: [/been there/i, /helpful/i, /respect/i],
    },
  ])("shows every used chip when $label reaction type is used", ({ reactions, visible }) => {
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={reactions}
        viewerReactions={[]}
        commentCount={0}
        commentHref="#comments"
      />,
      { session: loggedIn },
    );

    for (const name of visible) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /pain/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add reaction" })).toBeInTheDocument();
  });

  it("shows two chips plus an overflow picker when all four reactions are used", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={{ total: 10, beenThere: 4, helpful: 3, respect: 2, pain: 1, saved: 0 }}
        viewerReactions={["BEEN_THERE", "RESPECT"]}
        commentCount={0}
        commentHref="#comments"
      />,
      { session: loggedIn },
    );

    expect(screen.getByRole("button", { name: /been there/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /helpful/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /respect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pain/i })).not.toBeInTheDocument();

    const overflow = screen.getByRole("button", { name: "2 more reactions" });
    expect(overflow).toHaveTextContent("+2");
    await user.click(overflow);

    expect(screen.getByRole("menuitemcheckbox", { name: /been there/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: /helpful/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: /respect/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: /pain/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("adds an unused fixed reaction from the picker without replacing existing selections", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={{ total: 3, beenThere: 3, helpful: 0, respect: 0, pain: 0, saved: 0 }}
        viewerReactions={["BEEN_THERE"]}
        commentCount={0}
        commentHref="#comments"
      />,
      { session: loggedIn },
    );

    expect(screen.getByRole("button", { name: /been there/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Add reaction" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /helpful/i }));

    expect(addReaction).toHaveBeenCalledWith(mockUser.id, "l1", "HELPFUL");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("sends a signed-out Save attempt to login with the current L as return destination", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={{ total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 }}
        viewerReactions={[]}
        commentCount={0}
        commentHref="#comments"
      />,
      { pathname: "/ls/l1", router: { push } },
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(push).toHaveBeenCalledWith("/login?returnTo=%2Fls%2Fl1");
  });

  it("serializes near-simultaneous mutations from duplicate mounted views", async () => {
    let finishFirst!: (value: Awaited<ReturnType<typeof addReaction>>) => void;
    const firstResponse = new Promise<Awaited<ReturnType<typeof addReaction>>>((resolve) => {
      finishFirst = resolve;
    });
    vi.mocked(addReaction)
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({
        reactions: { total: 4, beenThere: 4, helpful: 2, respect: 0, pain: 0, saved: 1 },
        viewer: { reactions: ["BEEN_THERE"] },
      });

    renderWithProviders(
      <>
        <ReactionBar
          lId="l1"
          reactions={{ total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 }}
          viewerReactions={[]}
          commentCount={0}
          commentHref="#first"
        />
        <ReactionBar
          lId="l1"
          reactions={{ total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 }}
          viewerReactions={[]}
          commentCount={0}
          commentHref="#second"
        />
      </>,
      { session: loggedIn },
    );

    const buttons = screen.getAllByRole("button", { name: /been there/i });
    act(() => {
      fireEvent.click(buttons[0]!);
      fireEvent.click(buttons[1]!);
    });

    await waitFor(() => expect(addReaction).toHaveBeenCalledTimes(1));
    finishFirst({
      reactions: { total: 4, beenThere: 4, helpful: 2, respect: 0, pain: 0, saved: 1 },
      viewer: { reactions: ["BEEN_THERE"] },
    });
    await waitFor(() => expect(addReaction).toHaveBeenCalledTimes(2));
  });

  it("reconciles a newer server snapshot for the same L after navigation", async () => {
    const first = {
      total: 3,
      beenThere: 3,
      helpful: 0,
      respect: 0,
      pain: 0,
      saved: 0,
    };
    const newer = { ...first, total: 8, beenThere: 8 };
    const view = renderWithProviders(
      <ReactionBar
        lId="l1"
        reactions={first}
        viewerReactions={[]}
        commentCount={0}
        commentHref="#first"
      />,
      { session: loggedIn },
    );
    expect(screen.getByRole("button", { name: /been there/i })).toHaveTextContent("3");

    view.rerender(
      <ReactionBar
        lId="l1"
        reactions={newer}
        viewerReactions={["BEEN_THERE"]}
        commentCount={0}
        commentHref="#second"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /been there/i })).toHaveTextContent("8");
      expect(screen.getByRole("button", { name: /been there/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("does not let a late sibling's stale server props revert the shared cache", async () => {
    const stale = {
      total: 3,
      beenThere: 3,
      helpful: 0,
      respect: 0,
      pain: 0,
      saved: 0,
    };
    const newer = { ...stale, total: 8, beenThere: 8 };

    function Views({
      primary,
      showLateStale,
    }: {
      primary: typeof stale;
      showLateStale: boolean;
    }) {
      return (
        <>
          <ReactionBar
            key="primary"
            lId="l1"
            reactions={primary}
            viewerReactions={primary === newer ? ["BEEN_THERE"] : []}
            commentCount={0}
            commentHref="#primary"
          />
          {showLateStale ? (
            <ReactionBar
              key="late-stale"
              lId="l1"
              reactions={stale}
              viewerReactions={[]}
              commentCount={0}
              commentHref="#late"
            />
          ) : null}
        </>
      );
    }

    const view = renderWithProviders(<Views primary={stale} showLateStale={false} />, {
      session: loggedIn,
    });
    view.rerender(<Views primary={newer} showLateStale={false} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /been there/i })).toHaveTextContent("8"),
    );

    view.rerender(<Views primary={newer} showLateStale />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /been there/i });
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toHaveTextContent("8");
        expect(button).toHaveAttribute("aria-pressed", "true");
      }
    });
  });

  it("updates every mounted view of an L through its canonical reaction cache", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ReactionBar
          lId="l1"
          reactions={{ total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 }}
          viewerReactions={[]}
          commentCount={0}
          commentHref="#first"
        />
        <ReactionBar
          lId="l1"
          reactions={{ total: 3, beenThere: 3, helpful: 2, respect: 0, pain: 0, saved: 1 }}
          viewerReactions={[]}
          commentCount={0}
          commentHref="#second"
        />
      </>,
      { session: loggedIn },
    );

    await user.click(screen.getAllByRole("button", { name: /been there/i })[0]!);

    expect(addReaction).toHaveBeenCalledWith(mockUser.id, "l1", "BEEN_THERE");
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /been there/i })).toHaveLength(2);
      for (const button of screen.getAllByRole("button", { name: /been there/i })) {
        expect(button).toHaveAttribute("aria-pressed", "true");
        expect(button).toHaveTextContent("4");
      }
    });
  });
});
