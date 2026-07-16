import { feedSidebarResponseSchema } from '@linkedout/contracts/v2';
import { z } from 'zod';

import type { ApiRouteContract } from './api-route-contracts';

export const API_ROUTE_CONTRACTS_V2 = {
  feedSidebar: {
    key: 'get /feed/sidebar',
    status: 200,
    response: {
      schema: feedSidebarResponseSchema,
      description: 'Feed discovery rails',
    },
  },
  openApi: {
    key: 'get /openapi.json',
    status: 200,
    response: {
      schema: z.record(z.string(), z.unknown()),
      description: 'OpenAPI 3.1 document',
    },
  },
} as const satisfies Record<string, ApiRouteContract>;

export const API_ROUTE_CONTRACT_BY_KEY_V2 = new Map<string, ApiRouteContract>(
  Object.values(API_ROUTE_CONTRACTS_V2).map((contract) => [contract.key, contract]),
);
