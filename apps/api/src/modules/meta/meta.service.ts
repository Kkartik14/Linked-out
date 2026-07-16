import { Injectable } from '@nestjs/common';
import {
  JOURNEY_STATUS_META,
  L_CATEGORY_META,
  L_TYPE_META,
  NOTIFICATION_TYPE_META,
  REACTION_TYPE_META,
  REPUTATION_META,
  VISIBILITY_META,
  type MetaEnumsResponse,
  type PopularTagsQuery,
  type PopularTagsResponse,
} from '@linkedout/contracts';

import { MetaRepository } from './meta.repository';
import { OPEN_API_DOCUMENT, type OpenApiDocument } from './openapi';
import { OPEN_API_V2_DOCUMENT } from './openapi-v2';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Enum display metadata has no principal, locale, tenant, or database variability. Build one
 * immutable process-wide value so both Nest instances and repeated requests share it safely.
 */
const META_ENUMS_RESPONSE: MetaEnumsResponse = deepFreeze({
  reactionType: REACTION_TYPE_META.map((m) => ({
    value: m.value,
    label: m.label,
    emoji: m.emoji,
  })),
  journeyStatus: JOURNEY_STATUS_META.map((m) => ({ value: m.value, label: m.label, dot: m.dot })),
  lType: L_TYPE_META.map((m) => ({
    value: m.value,
    label: m.label,
    sectionLabel: m.sectionLabel,
  })),
  lCategory: L_CATEGORY_META.map((m) => ({ value: m.value, label: m.label })),
  visibility: VISIBILITY_META.map((m) => ({
    value: m.value,
    label: m.label,
    description: m.description,
  })),
  notificationType: NOTIFICATION_TYPE_META.map((m) => ({ value: m.value, label: m.label })),
  reputation: REPUTATION_META.map((m) => ({ key: m.key, label: m.label })),
});

@Injectable()
export class MetaService {
  constructor(private readonly repo: MetaRepository) {}

  getEnums(): MetaEnumsResponse {
    return META_ENUMS_RESPONSE;
  }

  getOpenApi(): OpenApiDocument {
    return OPEN_API_DOCUMENT;
  }

  getV2OpenApi(): OpenApiDocument {
    return OPEN_API_V2_DOCUMENT;
  }

  async popularTags(query: PopularTagsQuery): Promise<PopularTagsResponse> {
    return { tags: await this.repo.popularTags(query.q, query.limit) };
  }
}
