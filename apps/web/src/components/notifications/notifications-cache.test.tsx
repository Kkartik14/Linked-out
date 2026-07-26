import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Notification } from "@linkedout/contracts";

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

const notificationState = vi.hoisted(() => ({ readAt: null as string | null }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getNotifications: vi.fn(async () => ({
      data: [{ ...notification, readAt: notificationState.readAt }],
      nextCursor: null,
    })),
    getUnreadCount: vi.fn(async () => ({ count: notificationState.readAt ? 0 : 1 })),
    markNotificationRead: vi.fn(async () => {
      notificationState.readAt = "2026-07-25T00:00:00.000Z";
      return { ok: true as const };
    }),
    markAllNotificationsRead: vi.fn(async () => {
      notificationState.readAt = "2026-07-25T00:00:00.000Z";
      return { ok: true as const };
    }),
  };
});

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
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
  beforeEach(() => {
    notificationState.readAt = null;
    vi.clearAllMocks();
  });

  it("loads the preview lazily and keeps it distinct from the infinite page", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NotificationsBell />
        <NotificationsList />
      </>,
      { session: { status: "authenticated", user: mockUser, needsOnboarding: false } },
    );

    // The infinite page rendered its item - its `{ pages }` shape was not clobbered by the
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

  it("reconciles mark-all-read across the page, bell preview, and unread count", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <section aria-label="Header notifications">
          <NotificationsBell />
        </section>
        <section aria-label="Page notifications">
          <NotificationsList />
        </section>
      </>,
      { session: { status: "authenticated", user: mockUser, needsOnboarding: false } },
    );

    const header = within(screen.getByRole("region", { name: "Header notifications" }));
    const page = within(screen.getByRole("region", { name: "Page notifications" }));

    expect(await page.findByText(notification.message)).toBeInTheDocument();
    await user.click(await header.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findAllByText(notification.message)).toHaveLength(2);

    await user.click(screen.getByRole("menuitem", { name: "Mark all read" }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(page.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
      expect(header.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });
  });

  it("marks the opened notification read and reconciles the active page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsList />, {
      session: { status: "authenticated", user: mockUser, needsOnboarding: false },
    });

    await user.click(
      await screen.findByRole("link", { name: new RegExp(notification.message) }),
    );

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith(mockUser.id, "n_1"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument(),
    );
  });
});
