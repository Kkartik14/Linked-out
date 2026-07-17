import { z } from 'zod';
import {
  feedFilterSchema,
  feedSortSchema,
  lTypeSchema,
  reactionTypeSchema,
  searchTypeSchema,
} from '@linkedout/contracts';

import {
  API_COMPONENT_SCHEMAS,
  API_ROUTE_CONTRACT_BY_KEY,
} from '../../common/contracts/api-route-contracts';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type OpenApiDocument = JsonObject;

function schemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(schemaName: string, description = 'OK'): JsonObject {
  return {
    description,
    content: { 'application/json': { schema: schemaRef(schemaName) } },
  };
}

function jsonBody(schemaName: string, required = true): JsonObject {
  return {
    required,
    content: { 'application/json': { schema: schemaRef(schemaName) } },
  };
}

function pathParam(
  name: string,
  schema: JsonObject = { type: 'string' },
): JsonObject {
  return { name, in: 'path', required: true, schema };
}

function queryParam(
  name: string,
  schema: JsonObject = { type: 'string' },
  required = false,
) {
  return { name, in: 'query', required, schema };
}

function jsonSchemas(): Record<string, JsonObject> {
  return Object.fromEntries(
    Object.entries(API_COMPONENT_SCHEMAS).map(([name, schema]) => {
      const jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any' });
      // Zod refinements are not representable in JSON Schema. Preserve the non-empty PATCH
      // invariant explicitly at the one component-generation seam.
      if (name === 'UpdateLInput' || name === 'UpdateUserInput') {
        Object.assign(jsonSchema, { minProperties: 1 });
      }
      return [name, jsonSchema as JsonObject];
    }),
  );
}

type OpenApiOperation = JsonObject & {
  requestBody?: JsonObject;
  responses?: Record<string, JsonObject>;
};

function applyRouteContracts(
  paths: Record<string, Record<string, OpenApiOperation>>,
): Record<string, Record<string, OpenApiOperation>> {
  for (const contract of API_ROUTE_CONTRACT_BY_KEY.values()) {
    const separator = contract.key.indexOf(' ');
    const method = contract.key.slice(0, separator);
    const path = contract.key.slice(separator + 1);
    const operation = paths[path]?.[method];
    if (!operation) throw new Error(`Route contract has no OpenAPI operation: ${contract.key}`);
    if (operation.requestBody !== undefined) {
      throw new Error(`OpenAPI request body must come from the route contract: ${contract.key}`);
    }
    if (contract.body) {
      operation.requestBody = jsonBody(contract.body.name, contract.body.required);
    }

    const responses = operation.responses ?? {};
    const status = String(contract.status);
    if (responses[status] !== undefined) {
      throw new Error(`OpenAPI success response must come from the route contract: ${contract.key}`);
    }
    responses[status] = contract.response.name
      ? jsonResponse(contract.response.name, contract.response.description)
      : { description: contract.response.description };
    operation.responses = responses;
  }
  return paths;
}

const paginationParams = [
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
  queryParam('cursor', { type: 'string', minLength: 1 }),
];
const journeyPaginationParams = [
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 30 }),
  queryParam('cursor', { type: 'string', minLength: 1 }),
];
const oauthReturnToParam = queryParam('returnTo', {
  type: 'string',
  maxLength: 512,
  pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
});
const feedSortParam = queryParam('sort', {
  type: 'string',
  enum: feedSortSchema.options,
  default: 'latest',
});

export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'LinkedOut API', version: '1.1.0' },
    servers: [{ url: '/v1' }],
    // Authenticated is the safe default. Public and optionally-authenticated operations
    // override this locally; the route-parity test checks the effective value against guards.
    security: [{ accessCookie: [] }],
    paths: applyRouteContracts({
      '/auth/google': {
        get: {
          security: [],
          parameters: [oauthReturnToParam],
        },
      },
      '/auth/github': {
        get: {
          security: [],
          parameters: [oauthReturnToParam],
        },
      },
      '/auth/google/callback': {
        get: {
          security: [],
        },
      },
      '/auth/github/callback': {
        get: {
          security: [],
        },
      },
      '/auth/me': {
        get: {
          security: [{}, { accessCookie: [] }],
        },
      },
      '/auth/refresh': {
        post: {
          security: [{ refreshCookie: [] }],
        },
      },
      '/auth/logout': { post: { security: [] } },

      '/users/me': {
        patch: {
        },
      },
      '/users/{username}': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('username')],
        },
      },
      '/users/{username}/ls': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [
            pathParam('username'),
            queryParam('type', { type: 'string', enum: lTypeSchema.options }),
            ...paginationParams,
          ],
        },
      },
      '/users/{username}/journey': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('username'), ...journeyPaginationParams],
        },
      },
      '/users/{username}/collections': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('username'), ...paginationParams],
        },
      },
      '/users/{username}/followers': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('username'), ...paginationParams],
        },
      },
      '/users/{username}/following': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('username'), ...paginationParams],
        },
      },
      '/users/{username}/follow': {
        put: {
          parameters: [pathParam('username')],
        },
        delete: {
          parameters: [pathParam('username')],
        },
      },

      '/ls': {
        post: {},
      },
      '/ls/{id}': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('id')],
        },
        patch: {
          parameters: [pathParam('id')],
        },
        delete: {
          parameters: [pathParam('id')],
        },
      },
      '/ls/{id}/reactions/{type}': {
        put: {
          parameters: [
            pathParam('id'),
            pathParam('type', { type: 'string', enum: reactionTypeSchema.options }),
          ],
        },
        delete: {
          parameters: [
            pathParam('id'),
            pathParam('type', { type: 'string', enum: reactionTypeSchema.options }),
          ],
        },
      },
      '/me/saved': {
        get: {
          parameters: paginationParams,
        },
      },

      '/feed': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [
            feedSortParam,
            queryParam('filter', { type: 'string', enum: feedFilterSchema.options }),
            ...paginationParams,
          ],
        },
      },
      '/feed/following': {
        get: {
          parameters: [
            feedSortParam,
            queryParam('filter', { type: 'string', enum: feedFilterSchema.options }),
            ...paginationParams,
          ],
        },
      },

      '/ls/{id}/comments': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('id'), ...paginationParams],
        },
        post: {
          parameters: [pathParam('id')],
        },
      },
      '/comments/{id}/replies': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('id'), ...paginationParams],
        },
        post: {
          parameters: [pathParam('id')],
        },
      },
      '/comments/{id}': {
        delete: {
          parameters: [pathParam('id')],
        },
      },

      '/collections': {
        post: {},
      },
      '/collections/{id}': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [pathParam('id')],
        },
        patch: {
          parameters: [pathParam('id')],
        },
        delete: {
          parameters: [pathParam('id')],
        },
      },
      '/collections/{id}/ls/{lId}': {
        put: {
          parameters: [pathParam('id'), pathParam('lId')],
        },
        delete: {
          parameters: [pathParam('id'), pathParam('lId')],
        },
      },

      '/uploads/avatar': {
        post: {
          responses: {
            503: jsonResponse('ErrorEnvelope', 'Uploads disabled'),
          },
        },
      },
      '/search': {
        get: {
          security: [{}, { accessCookie: [] }],
          parameters: [
            queryParam('q', { type: 'string', minLength: 1, maxLength: 100 }, true),
            queryParam('type', {
              type: 'string',
              enum: searchTypeSchema.options,
              default: 'ls',
            }),
            queryParam('filter', {
              type: 'string',
              enum: feedFilterSchema.options,
            }),
            ...paginationParams,
          ],
        },
      },
      '/notifications': {
        get: {
          parameters: paginationParams,
        },
      },
      '/notifications/unread-count': {
        get: {},
      },
      '/notifications/{id}/read': {
        post: {
          parameters: [pathParam('id')],
        },
      },
      '/notifications/read-all': {
        post: {},
      },
      '/meta/enums': {
        get: { security: [] },
      },
      '/tags/popular': {
        get: {
          security: [],
          parameters: [
            queryParam('q', { type: 'string', maxLength: 30 }),
            queryParam('limit', { type: 'integer', minimum: 1, maximum: 20, default: 10 }),
          ],
        },
      },
      '/openapi.json': {
        get: { security: [] },
      },
    }),
    components: {
      securitySchemes: {
        accessCookie: { type: 'apiKey', in: 'cookie', name: 'lo_access' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'lo_refresh' },
      },
      schemas: jsonSchemas(),
      responses: {
        Error: {
          description: 'Standard error envelope',
          content: { 'application/json': { schema: schemaRef('ErrorEnvelope') } },
        },
      },
    },
  };
}

/** Zod-to-JSON conversion is deterministic and expensive; build it once per API process. */
export const OPEN_API_DOCUMENT = buildOpenApiDocument();
