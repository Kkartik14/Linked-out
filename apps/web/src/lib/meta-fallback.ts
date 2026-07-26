import {
  JOURNEY_STATUS_META,
  L_TYPE_META,
  NOTIFICATION_TYPE_META,
  REACTION_TYPE_META,
  REPUTATION_META,
  VISIBILITY_META,
  type MetaEnumsResponse,
} from "@linkedout/contracts";

/**
 * Canonical enum display metadata, mirroring what `GET /meta/enums` serves. The app fetches
 * that at boot; this is the resilient fallback if the request fails, so labels/emoji never
 * come back empty.
 *
 * The public API has no `lCategory` member: the category concept is removed from the wire.
 */
export const DEFAULT_META: MetaEnumsResponse = {
  reactionType: [...REACTION_TYPE_META],
  journeyStatus: [...JOURNEY_STATUS_META],
  lType: [...L_TYPE_META],
  visibility: [...VISIBILITY_META],
  notificationType: [...NOTIFICATION_TYPE_META],
  reputation: [...REPUTATION_META],
};
