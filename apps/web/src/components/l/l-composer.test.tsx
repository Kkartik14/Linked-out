import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LDetail } from "@linkedout/contracts";

import { LComposer } from "@/components/l/l-composer";
import { mockUser, renderWithProviders } from "@/test/utils";

const session = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  });
});

const existing: LDetail = {
  id: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  title: "A hard-earned lesson",
  story: "What happened and what changed.",
  type: "SCAR",
  visibility: "PUBLIC",
  isAnonymous: false,
  resolvedAt: null,
  author: mockUser,
  reactions: { total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
  commentCount: 0,
  viewer: { reactions: [], canEdit: true },
  createdAt: "2026-01-02T00:00:00.000Z",
};

describe.each([
  ["create", undefined],
  ["edit", existing],
] as const)("LComposer %s mode", (_mode, initial) => {
  it("offers exactly the six active L types", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LComposer initial={initial} />, { session });

    screen.getByRole("combobox", { name: "Type" }).focus();
    await user.keyboard("{ArrowDown}");

    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "L",
      "Win",
      "Story",
      "Scar",
      "Plot Twist",
      "Battle",
    ]);
  });
});
