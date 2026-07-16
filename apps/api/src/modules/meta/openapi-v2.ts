import { z } from 'zod';
import {
  feedSortSchema,
  lTypeSchema,
  reactionTypeSchema,
  searchTypeSchema,
} from '@linkedout/contracts/v2';

import {
  API_COMPONENT_SCHEMAS_V2,
  API_ROUTE_CONTRACT_BY_KEY_V2,
} from '../../common/contracts/api-route-contracts-v2';
import type { OpenApiDocument } from './openapi';

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(name: string, description = 'OK') {
  return { description, content: { 'application/json': { schema: ref(name) } } };
}

function parameter(
  name: string,
  location: 'path' | 'query',
  schema: Record<string, unknown> = { type: 'string' },
  required = location === 'path',
) {
  return { name, in: location, required, schema };
}

type Operation = {
  security?: Array<Record<string, unknown>>;
  parameters?: Record<string, unknown>[];
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
};

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

const pagination = [
  parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 50, default: 20 }, false),
  parameter('cursor', 'query', { type: 'string', minLength: 1 }, false),
];
const journeyPagination = [
  parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 30 }, false),
  parameter('cursor', 'query', { type: 'string', minLength: 1 }, false),
];
const optionalAuth = [{}, { accessCookie: [] }];

export function buildOpenApiV2Document(): OpenApiDocument {
  const schemas = Object.fromEntries(
    Object.entries(API_COMPONENT_SCHEMAS_V2).map(([name, schema]) => {
      const json = z.toJSONSchema(schema, { unrepresentable: 'any' });
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
        get: { security: optionalAuth, parameters: [parameter('username', 'path')] },
      },
      '/ls': { post: {} },
      '/ls/{id}': {
        get: { security: optionalAuth, parameters: [parameter('id', 'path')] },
        patch: { parameters: [parameter('id', 'path')] },
        delete: { parameters: [parameter('id', 'path')] },
      },
      '/me/saved': { get: { parameters: pagination } },
      '/feed': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('sort', 'query', { type: 'string', enum: feedSortSchema.options, default: 'latest' }, false),
            ...pagination,
          ],
        },
      },
      '/feed/following': {
        get: {
          parameters: [
            parameter('sort', 'query', { type: 'string', enum: feedSortSchema.options, default: 'latest' }, false),
            ...pagination,
          ],
        },
      },
      '/feed/sidebar': { get: { security: optionalAuth } },
      '/users/{username}/ls': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('username', 'path'),
            parameter('type', 'query', { type: 'string', enum: lTypeSchema.options }, false),
            ...pagination,
          ],
        },
      },
      '/users/{username}/journey': {
        get: {
          security: optionalAuth,
          parameters: [parameter('username', 'path'), ...journeyPagination],
        },
      },
      '/users/{username}/collections': {
        get: {
          security: optionalAuth,
          parameters: [parameter('username', 'path'), ...pagination],
        },
      },
      '/users/{username}/followers': {
        get: {
          security: optionalAuth,
          parameters: [parameter('username', 'path'), ...pagination],
        },
      },
      '/users/{username}/following': {
        get: {
          security: optionalAuth,
          parameters: [parameter('username', 'path'), ...pagination],
        },
      },
      '/users/{username}/follow': {
        put: { parameters: [parameter('username', 'path')] },
        delete: { parameters: [parameter('username', 'path')] },
      },
      '/ls/{id}/reactions/{type}': {
        put: {
          parameters: [
            parameter('id', 'path'),
            parameter('type', 'path', { type: 'string', enum: reactionTypeSchema.options }),
          ],
        },
        delete: {
          parameters: [
            parameter('id', 'path'),
            parameter('type', 'path', { type: 'string', enum: reactionTypeSchema.options }),
          ],
        },
      },
      '/ls/{id}/comments': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path'), ...pagination],
        },
        post: { parameters: [parameter('id', 'path')] },
      },
      '/comments/{id}/replies': {
        get: {
          security: optionalAuth,
          parameters: [parameter('id', 'path'), ...pagination],
        },
        post: { parameters: [parameter('id', 'path')] },
      },
      '/comments/{id}': { delete: { parameters: [parameter('id', 'path')] } },
      '/collections': { post: {} },
      '/collections/{id}': {
        get: { security: optionalAuth, parameters: [parameter('id', 'path')] },
        patch: { parameters: [parameter('id', 'path')] },
        delete: { parameters: [parameter('id', 'path')] },
      },
      '/collections/{id}/ls/{lId}': {
        put: { parameters: [parameter('id', 'path'), parameter('lId', 'path')] },
        delete: { parameters: [parameter('id', 'path'), parameter('lId', 'path')] },
      },
      '/search': {
        get: {
          security: optionalAuth,
          parameters: [
            parameter('q', 'query', { type: 'string', minLength: 1, maxLength: 100 }, true),
            parameter('type', 'query', { type: 'string', enum: searchTypeSchema.options, default: 'ls' }, false),
            ...pagination,
          ],
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
        post: { parameters: [parameter('id', 'path')] },
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
