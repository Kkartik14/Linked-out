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
import { buildOpenApiDocument, type OpenApiDocument } from './openapi';

@Injectable()
export class MetaService {
  constructor(private readonly repo: MetaRepository) {}

  getEnums(): MetaEnumsResponse {
    return {
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
    };
  }

  getOpenApi(): OpenApiDocument {
    return buildOpenApiDocument();
  }

  async popularTags(query: PopularTagsQuery): Promise<PopularTagsResponse> {
    return { tags: await this.repo.popularTags(query.q, query.limit) };
  }
}
