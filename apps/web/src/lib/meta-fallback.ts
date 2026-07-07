import {
  JOURNEY_STATUS_META,
  L_CATEGORY_META,
  L_TYPE_META,
  NOTIFICATION_TYPE_META,
  REACTION_TYPE_META,
  REPUTATION_META,
  VISIBILITY_META,
  type MetaEnumsResponse,
} from "@linkedout/contracts";

/**
 * Canonical enum display metadata, mirroring contract.md §4.12. The app fetches
 * `GET /meta/enums` at boot; this is the resilient fallback if that request
 * fails, so labels/emoji never come back empty.
 */
export const DEFAULT_META: MetaEnumsResponse = {
  reactionType: [...REACTION_TYPE_META],
  journeyStatus: [...JOURNEY_STATUS_META],
  lType: [...L_TYPE_META],
  lCategory: [...L_CATEGORY_META],
  visibility: [...VISIBILITY_META],
  notificationType: [...NOTIFICATION_TYPE_META],
  reputation: [...REPUTATION_META],
};
