import { z } from 'zod';
import {
  feedQuerySchema,
  journeyQuerySchema,
  paginationQuerySchema,
  reactionTypeSchema,
  searchQuerySchema,
  ulidSchema,
  userLsQuerySchema,
  usernameInputSchema,
} from '@linkedout/contracts/v2';

import {
  API_COMPONENT_SCHEMAS_V2,
  API_ROUTE_CONTRACT_BY_KEY_V2,
} from '../../common/contracts/api-route-contracts-v2';
import type { JsonObject, JsonValue, OpenApiDocument } from './openapi';

function ref(name: string): JsonObject {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(name: string, description = 'OK'): JsonObject {
  return { description, content: { 'application/json': { schema: ref(name) } } };
}

function parameter(
  name: string,
  location: 'path' | 'query',
  schema: JsonObject = { type: 'string' },
  required = location === 'path',
) {
  return { name, in: location, required, schema };
}

type Operation = JsonObject & {
  security?: JsonObject[];
  parameters?: JsonObject[];
  requestBody?: JsonObject;
  responses?: Record<string, JsonObject>;
};

function schemaObject(schema: z.ZodType): JsonObject {
  return z.toJSONSchema(schema, { unrepresentable: 'any' }) as JsonObject;
}

function inputSchemaObject(schema: z.ZodType): JsonObject {
  return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as JsonObject;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** OpenAPI query parameters are projected from the same Zod objects used by controllers. */
function queryParameters(schema: z.ZodType): JsonObject[] {
  const json = inputSchemaObject(schema);
  if (!isJsonObject(json.properties)) throw new Error('Query schema must expose object properties');
  const required = new Set(
    Array.isArray(json.required)
      ? json.required.filter((name): name is string => typeof name === 'string')
      : [],
  );
  return Object.entries(json.properties).map(([name, propertySchema]) => {
    if (!isJsonObject(propertySchema)) {
      throw new Error(`Query parameter ${name} must have an object schema`);
    }
    return parameter(name, 'query', propertySchema, required.has(name));
  });
}

function applyContracts(paths: Record<string, Record<string, Operation>>) {
  for (const contract of API_ROUTE_CONTRACT_BY_KEY_V2.values()) {
    const separator = contract.key.indexOf(' ');
    const method = contract.key.slice(0, separator);
    const path = contract.key.slice(separator + 1);
    const operation = paths[path]?.[method];
    if (!operation) throw new Error(`V2 route contract has no OpenAPI operation: ${contract.key}`);
    if (contract.body) {
      operation.requestBody = {
        required: contract.body.required,
        content: { 'application/json': { schema: ref(contract.body.name) } },
      };
    }
    operation.responses = {
      400: jsonResponse('ErrorEnvelope', 'Invalid request'),
      401: jsonResponse('ErrorEnvelope', 'Authentication failed'),
      404: jsonResponse('ErrorEnvelope', 'Resource not found'),
      429: {
        ...jsonResponse('ErrorEnvelope', 'Rate limited'),
        headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
      },
      500: jsonResponse('ErrorEnvelope', 'Internal server error'),
      ...operation.responses,
    };
    const success = contract.response.name
      ? jsonResponse(contract.response.name, contract.response.description)
      : { description: contract.response.description };
    if (contract.key === 'get /feed/sidebar') {
      Object.assign(success, {
        headers: {
          'Cache-Control': {
            schema: { type: 'string', const: 'private, no-store, max-age=0' },
          },
        },
      });
    }
    operation.responses[String(contract.status)] = success;
  }
  return paths;
}

const pagination = queryParameters(paginationQuerySchema());
const journeyPagination = queryParameters(journeyQuerySchema);
const optionalAuth: JsonObject[] = [{}, { accessCookie: [] }];

export function buildOpenApiV2Document(): OpenApiDocument {
  const schemas = Object.fromEntries(
    Object.entries(API_COMPONENT_SCHEMAS_V2).map(([name, schema]) => {
      const json = schemaObject(schema);
      if (name === 'UpdateLInput' || name === 'UpdateUserInput') {
        Object.assign(json, { minProperties: 1 });
      }
      return [name, json];
    }),
  );

  return {
    openapi: '3.1.0',
    info: { title: 'LinkedOut API', version: '2.0.0' },
    servers: [{ url: '/v2' }],
    security: [{ accessCookie: [] }],
    paths: applyContracts({
      '/auth/google': {
        get: {
          security: [],
          parameters: [
            parameter('returnTo', 'query', {
              type: 'string',
              maxLength: 512,
              pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
            }, false),
          ],
        },
      },
      '/auth/github': {
        get: {
          security: [],
          parameters: [
            parameter('returnTo', 'query', {
              type: 'string',
              maxLength: 512,
              pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
            }, false),
          ],
        },
      },
      '/auth/google/callback': { get: { security: [] } },
      '/auth/github/callback': { get: { security: [] } },
      '/auth/me': { get: { security: optionalAuth } },
      '/auth/refresh': { post: { security: [{ refreshCookie: [] }] } },
      '/auth/logout': { post: {} },
      '/users/me': { patch: {} },
      '/users/{username}': {
        get: {
          security: optionalAuth,
          parameters: [parameter('username', 'path', schemaObject(usernameInputSchema))],
        },
      },
      '/ls': { post: {} },
      '/ls/{id}': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path', schemaObject(ulidSchema))],
        },
        patch: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
        delete: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/me/saved': { get: { parameters: pagination } },
      '/feed': {
        get: {
          security: optionalAuth,
          parameters: queryParameters(feedQuerySchema),
        },
      },
      '/feed/following': {
        get: { parameters: queryParameters(feedQuerySchema) },
      },
      '/feed/sidebar': { get: { security: optionalAuth } },
      '/users/{username}/ls': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path', schemaObject(usernameInputSchema)),
            ...queryParameters(userLsQuerySchema),
          ],
        },
      },
      '/users/{username}/journey': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path', schemaObject(usernameInputSchema)),
            ...journeyPagination,
          ],
        },
      },
      '/users/{username}/collections': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path', schemaObject(usernameInputSchema)),
            ...pagination,
          ],
        },
      },
      '/users/{username}/followers': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path', schemaObject(usernameInputSchema)),
            ...pagination,
          ],
        },
      },
      '/users/{username}/following': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path', schemaObject(usernameInputSchema)),
            ...pagination,
          ],
        },
      },
      '/users/{username}/follow': {
        put: { parameters: [parameter('username', 'path', schemaObject(usernameInputSchema))] },
        delete: { parameters: [parameter('username', 'path', schemaObject(usernameInputSchema))] },
      },
      '/ls/{id}/reactions/{type}': {
        put: {
          parameters: [
            parameter('id', 'path', schemaObject(ulidSchema)),
            parameter('type', 'path', schemaObject(reactionTypeSchema)),
          ],
        },
        delete: {
          parameters: [
            parameter('id', 'path', schemaObject(ulidSchema)),
            parameter('type', 'path', schemaObject(reactionTypeSchema)),
          ],
        },
      },
      '/ls/{id}/comments': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path', schemaObject(ulidSchema)), ...pagination],
        },
        post: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/comments/{id}/replies': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path', schemaObject(ulidSchema)), ...pagination],
        },
        post: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/comments/{id}': {
        delete: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/collections': { post: {} },
      '/collections/{id}': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path', schemaObject(ulidSchema))],
        },
        patch: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
        delete: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/collections/{id}/ls/{lId}': {
        put: {
          parameters: [
            parameter('id', 'path', schemaObject(ulidSchema)),
            parameter('lId', 'path', schemaObject(ulidSchema)),
          ],
        },
        delete: {
          parameters: [
            parameter('id', 'path', schemaObject(ulidSchema)),
            parameter('lId', 'path', schemaObject(ulidSchema)),
          ],
        },
      },
      '/search': {
        get: {
          security: optionalAuth,
          parameters: queryParameters(searchQuerySchema),
        },
      },
      '/uploads/avatar': {
        post: {
          responses: { 503: jsonResponse('ErrorEnvelope', 'Uploads disabled') },
        },
      },
      '/notifications': { get: { parameters: pagination } },
      '/notifications/unread-count': { get: {} },
      '/notifications/{id}/read': {
        post: { parameters: [parameter('id', 'path', schemaObject(ulidSchema))] },
      },
      '/notifications/read-all': { post: {} },
      '/meta/enums': { get: { security: [] } },
      '/openapi.json': { get: { security: [] } },
    }),
    components: {
      securitySchemes: {
        accessCookie: { type: 'apiKey', in: 'cookie', name: 'lo_access' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'lo_refresh' },
      },
      schemas,
    },
  };
}

export const OPEN_API_V2_DOCUMENT = buildOpenApiV2Document();
