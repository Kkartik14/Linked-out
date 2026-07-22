import { type QueryClient } from "@tanstack/react-query";
import { type UserProfile } from "@linkedout/contracts";

import { queryKeys } from "@/lib/query-keys";

/**
 * Reconcile an edit to the signed-in user's profile across viewer-dependent views.
 *
 * The profile page gets the authoritative mutation response immediately. Other cached
 * responses embed smaller user summaries (feed cards, comments, discovery rails, and
 * notifications), so mark every other cache owned by this principal stale. Keeping this
 * policy here prevents each profile editor from learning the full list of consumers.
 */
export function reconcileOwnProfile(
  queryClient: QueryClient,
  principal: string,
  profile: UserProfile,
): Promise<void> {
  const profileKey = queryKeys.profiles.detail(principal, profile.username);
  queryClient.setQueryData(profileKey, profile);

  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      const isUpdatedProfile =
        key[0] === profileKey[0] && key[1] === profileKey[1] && key[2] === profileKey[2];
      return key[1] === principal && !isUpdatedProfile;
    },
  });
}
