import { Injectable } from '@nestjs/common';
import {
  JOURNEY_STATUS_META,
  L_TYPE_META,
  NOTIFICATION_TYPE_META,
  REACTION_TYPE_META,
  REPUTATION_META,
  VISIBILITY_META,
  type MetaEnumsResponse,
  type OperationalHealthResponse,
} from '@linkedout/contracts';

import { OPEN_API_DOCUMENT, type OpenApiDocument } from './openapi';
import { HealthRepository } from './health.repository';

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
  constructor(private readonly health: HealthRepository) {}

  getEnums(): MetaEnumsResponse {
    return META_ENUMS_RESPONSE;
  }

  getOpenApi(): OpenApiDocument {
    return OPEN_API_DOCUMENT;
  }

  privateApiHealth(): OperationalHealthResponse {
    return { status: 'ok', component: 'private-api' };
  }

  async databaseHealth(): Promise<OperationalHealthResponse> {
    await this.health.assertDatabaseAvailable();
    return { status: 'ok', component: 'database' };
  }

  async sessionAuthorityHealth(): Promise<OperationalHealthResponse> {
    await this.health.assertSessionAuthorityAvailable();
    return { status: 'ok', component: 'session-authority' };
  }

}
