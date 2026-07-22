import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { reconcileOwnProfile } from "@/lib/profile-cache";
import { queryKeys } from "@/lib/query-keys";
import { mockUser } from "@/test/utils";

describe("reconcileOwnProfile", () => {
  it("replaces the exact profile and invalidates only caches scoped to that principal", async () => {
    const queryClient = new QueryClient();
    const principal = mockUser.id;
    const profileKey = queryKeys.profiles.detail(principal, mockUser.username);
    const sidebarKey = queryKeys.feedSidebar.detail(principal);
    const ownSearchKey = queryKeys.search.preview.users(principal, "builder");
    const otherPrincipalKey = queryKeys.search.preview.users("another-principal", principal);
    const updated = { ...mockUser, status: "WORKING" as const };

    queryClient.setQueryData(profileKey, mockUser);
    queryClient.setQueryData(sidebarKey, { people: [] });
    queryClient.setQueryData(ownSearchKey, { items: [] });
    // The edited principal appears as search text, but this cache belongs to someone else.
    // A substring/includes-based predicate would incorrectly invalidate it.
    queryClient.setQueryData(otherPrincipalKey, { items: [] });

    await reconcileOwnProfile(queryClient, principal, updated);

    expect(queryClient.getQueryData(profileKey)).toEqual(updated);
    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(sidebarKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(ownSearchKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherPrincipalKey)?.isInvalidated).toBe(false);
  });
});
