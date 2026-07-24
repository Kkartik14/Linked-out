import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, useQuery } from "@tanstack/react-query";

import { SettingsForm } from "@/components/settings/settings-form";
import { patchMe } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { mockUser, renderWithProviders } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    patchMe: vi.fn(),
    presignAvatar: vi.fn(),
  };
});

const session = { status: "authenticated", user: mockUser, needsOnboarding: false } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(patchMe).mockResolvedValue(mockUser);
});

describe("SettingsForm", () => {
  it("does not render or resubmit the profile's current chapter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsForm user={mockUser} />, { session });

    expect(screen.queryByText(/Journey status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current chapter/i)).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "New name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(patchMe).toHaveBeenCalledWith(mockUser.id, {
        name: "New name",
        bio: null,
      }),
    );
  });

  it("redirects to the updated profile and refreshes after a successful save", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    const refresh = vi.fn();
    // The canonical username comes from the response, not the form — a rename must be honored.
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push, refresh },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    expect(refresh).toHaveBeenCalled();
  });

  it("publishes the saved profile and stales every other viewer cache before returning", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const updated = { ...mockUser, name: "Kartik G", bio: "Building carefully." };
    const profileKey = queryKeys.profiles.detail(mockUser.id, mockUser.username);
    const sidebarKey = queryKeys.feedSidebar.detail(mockUser.id);
    const searchKey = queryKeys.search.preview.users(mockUser.id, "kartik");
    queryClient.setQueryData(profileKey, mockUser);
    queryClient.setQueryData(sidebarKey, { viewer: mockUser });
    queryClient.setQueryData(searchKey, { data: [mockUser], nextCursor: null });
    vi.mocked(patchMe).mockResolvedValue(updated);

    renderWithProviders(<SettingsForm user={mockUser} />, { session, queryClient });

    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), updated.name);
    await user.type(screen.getByRole("textbox", { name: "Bio" }), updated.bio);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(queryClient.getQueryData(profileKey)).toEqual(updated));
    expect(queryClient.getQueryState(sidebarKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(searchKey)?.isInvalidated).toBe(true);
  });

  it("keeps the button disabled through a successful navigation", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik-new" });

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/u/kartik-new"));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("returns to the profile without waiting for unrelated active cache refetches", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    let finishRefetch!: () => void;
    const refetch = vi.fn(
      () => new Promise<{ count: number }>((resolve) => {
        finishRefetch = () => resolve({ count: 0 });
      }),
    );

    function ActiveUnrelatedQuery() {
      useQuery({
        queryKey: queryKeys.notifications.unreadCount(mockUser.id),
        queryFn: refetch,
        initialData: { count: 1 },
      });
      return null;
    }

    renderWithProviders(
      <>
        <ActiveUnrelatedQuery />
        <SettingsForm user={mockUser} />
      </>,
      { session, router: { push } },
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(`/u/${mockUser.username}`);
    finishRefetch();
  });

  it("stays on Settings and re-enables saving when the save fails", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(patchMe).mockRejectedValue(new Error("boom"));

    renderWithProviders(<SettingsForm user={mockUser} />, {
      session,
      router: { push },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
