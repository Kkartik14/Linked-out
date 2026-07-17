import {
  JOURNEY_STATUS_META,
  L_TYPE_META,
  NOTIFICATION_TYPE_META,
  REACTION_TYPE_META,
  REPUTATION_META,
  VISIBILITY_META,
  type MetaEnumsResponse,
} from "@linkedout/contracts/v2";

/**
 * Canonical enum display metadata, mirroring the v2 contract §3. The app fetches
 * `GET /meta/enums` at boot; this is the resilient fallback if that request
 * fails, so labels/emoji never come back empty.
 *
 * v2 has no `lCategory` member: the category concept is removed from the wire.
 */
export const DEFAULT_META: MetaEnumsResponse = {
  reactionType: [...REACTION_TYPE_META],
  journeyStatus: [...JOURNEY_STATUS_META],
  lType: [...L_TYPE_META],
  visibility: [...VISIBILITY_META],
  notificationType: [...NOTIFICATION_TYPE_META],
  reputation: [...REPUTATION_META],
};
