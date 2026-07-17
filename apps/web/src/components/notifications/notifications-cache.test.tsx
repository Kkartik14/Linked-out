import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Notification } from "@linkedout/contracts/v2";

import { mockUser, renderWithProviders } from "@/test/utils";

const notification: Notification = {
  id: "n_1",
  type: "RELATED",
  actor: null,
  target: { lId: "l_1", title: "Rejected after the final round" },
  message: "3 builders related to your story.",
  readAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getNotifications: vi.fn(async () => ({ data: [notification], nextCursor: null })),
    getUnreadCount: vi.fn(async () => ({ count: 1 })),
    markNotificationRead: vi.fn(async () => ({ ok: true as const })),
    markAllNotificationsRead: vi.fn(async () => ({ ok: true as const })),
  };
});

import { getNotifications } from "@/lib/api";
import {
  NotificationsBell,
  notificationPollIntervalMs,
} from "@/components/layout/notifications-bell";
import { NotificationsList } from "@/components/notifications/notifications-list";

// FRONTEND-01: the header bell (finite useQuery) and the page list (useInfiniteQuery) used to
// share the key ["notifications","list"], which stores incompatible shapes. On /notifications
// both mount together; the collision could crash the infinite list's `.pages.flatMap`. With
// distinct principal-scoped keys they coexist. This renders both under one QueryClient to prove it.
describe("notifications bell + page share a QueryClient without colliding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the preview lazily and keeps it distinct from the infinite page", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NotificationsBell />
        <NotificationsList />
      </>,
      { session: { status: "authenticated", user: mockUser, needsOnboarding: false } },
    );

    // The infinite page rendered its item — its `{ pages }` shape was not clobbered by the
    // finite preview's `Paginated` shape.
    expect(await screen.findByText(notification.message)).toBeInTheDocument();
    expect(getNotifications).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    // Distinct keys ⇒ both queries fetch independently. A SHARED key would let React Query
    // dedupe them to a single fetch, so exactly-two calls proves the collision is gone.
    await waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(2));
    expect(getNotifications).toHaveBeenNthCalledWith(2, undefined, 5);
  });

  it("jitters each poll within the bounded interval", () => {
    expect(notificationPollIntervalMs(() => 0)).toBe(40_000);
    expect(notificationPollIntervalMs(() => 0.5)).toBe(45_000);
    expect(notificationPollIntervalMs(() => 0.999_999)).toBe(50_000);
  });
});
