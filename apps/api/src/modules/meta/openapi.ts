import { z } from 'zod';
import {
  feedQuerySchema,
  paginationQuerySchema,
  PRINCIPAL_BINDING_HEADER,
  reactionTypeSchema,
  searchQuerySchema,
  ulidSchema,
  userLsQuerySchema,
  usernameInputSchema,
} from '@linkedout/contracts';

import {
  API_COMPONENT_SCHEMAS,
  API_ROUTE_CONTRACT_BY_KEY,
} from '../../common/contracts/api-route-contracts';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type OpenApiDocument = JsonObject;

function ref(name: string): JsonObject {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(name: string, description = 'OK'): JsonObject {
  return { description, content: { 'application/json': { schema: ref(name) } } };
}

function parameter(
  name: string,
  location: 'header' | 'path' | 'query',
  schema: JsonObject = { type: 'string' },
  required = location === 'path',
): JsonObject {
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

/** Project OpenAPI parameters from the same Zod query objects used by controllers. */
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
  for (const contract of API_ROUTE_CONTRACT_BY_KEY.values()) {
    const separator = contract.key.indexOf(' ');
    const method = contract.key.slice(0, separator);
    const path = contract.key.slice(separator + 1);
    const operation = paths[path]?.[method];
    if (!operation) throw new Error(`Route contract has no OpenAPI operation: ${contract.key}`);
    if (contract.body) {
      operation.requestBody = {
        required: contract.body.required,
        content: { 'application/json': { schema: ref(contract.body.name) } },
      };
    }
    const security = operation.security ?? [{ accessCookie: [] }];
    const bindsPrincipal =
      ['delete', 'patch', 'post', 'put'].includes(method) &&
      security.some((requirement) => 'accessCookie' in requirement);
    if (bindsPrincipal) {
      operation.parameters = [
        ...(operation.parameters ?? []),
        parameter(PRINCIPAL_BINDING_HEADER, 'header', schemaObject(ulidSchema), true),
      ];
    }
    operation.responses = {
      400: jsonResponse('ErrorEnvelope', 'Invalid request'),
      401: jsonResponse('ErrorEnvelope', 'Authentication failed'),
      404: jsonResponse('ErrorEnvelope', 'Resource not found'),
      ...(bindsPrincipal
        ? { 409: jsonResponse('ErrorEnvelope', 'Authenticated principal changed') }
        : {}),
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
const optionalAuth: JsonObject[] = [{}, { accessCookie: [] }];
const usernamePath = () => parameter('username', 'path', schemaObject(usernameInputSchema));
const idPath = (name = 'id') => parameter(name, 'path', schemaObject(ulidSchema));

export function buildOpenApiDocument(): OpenApiDocument {
  const schemas = Object.fromEntries(
    Object.entries(API_COMPONENT_SCHEMAS).map(([name, schema]) => {
      const json = schemaObject(schema);
      if (name === 'UpdateLInput' || name === 'UpdateUserInput') {
        Object.assign(json, { minProperties: 1 });
      }
      return [name, json];
    }),
  );

  return {
    openapi: '3.1.0',
    info: { title: 'LinkedOut API', version: '1.1.2' },
    servers: [{ url: '/v1' }],
    security: [{ accessCookie: [] }],
    paths: applyContracts({
      '/auth/google': {
        get: {
          security: [],
          parameters: [
            parameter(
              'returnTo',
              'query',
              {
                type: 'string',
                maxLength: 512,
                pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
              },
              false,
            ),
          ],
        },
      },
      '/auth/github': {
        get: {
          security: [],
          parameters: [
            parameter(
              'returnTo',
              'query',
              {
                type: 'string',
                maxLength: 512,
                pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
              },
              false,
            ),
          ],
        },
      },
      '/auth/google/callback': { get: { security: [] } },
      '/auth/github/callback': { get: { security: [] } },
      '/auth/me': { get: { security: optionalAuth } },
      '/auth/refresh': { post: { security: [{ refreshCookie: [] }] } },
      '/auth/logout': { post: { security: [] } },
      '/auth/email/signup': { post: { security: [] } },
      '/auth/email/verify': { post: { security: [] } },
      '/auth/email/login': { post: { security: [] } },
      '/auth/email/resend': { post: { security: [] } },
      '/auth/email/password/forgot': { post: { security: [] } },
      '/auth/email/password/reset': { post: { security: [] } },
      '/auth/email/otp/inspect': {
        post: {
          security: [{ otpInspectionSecret: [] }],
          tags: ['internal-auth'],
          'x-internal': true,
          description: 'Temporary stub-only OTP inspection. Remove when email delivery is live.',
        },
      },
      '/auth/oauth/handoff/exchange': {
        post: {
          security: [{ bffCallerAssertion: [] }],
          tags: ['internal-auth'],
          'x-internal': true,
          description: 'Private BFF exchange; deployment also requires network isolation.',
        },
      },
      '/auth/sessions/resolve': {
        post: {
          security: [{ bffCallerAssertion: [] }],
          tags: ['internal-auth'],
          'x-internal': true,
          description: 'Private BFF session resolution; deployment also requires network isolation.',
        },
      },
      '/auth/sessions/revoke': {
        post: {
          security: [{ bffCallerAssertion: [] }],
          tags: ['internal-auth'],
          'x-internal': true,
          description: 'Private BFF session revocation; deployment also requires network isolation.',
        },
      },
      '/users/me': { patch: {} },
      '/users/{username}': {
        get: { security: optionalAuth, parameters: [usernamePath()] },
      },
      '/users/{username}/ls': {
        get: {
          security: optionalAuth,
          parameters: [usernamePath(), ...queryParameters(userLsQuerySchema)],
        },
      },
      '/users/{username}/collections': {
        get: { security: optionalAuth, parameters: [usernamePath(), ...pagination] },
      },
      '/users/{username}/followers': {
        get: { security: optionalAuth, parameters: [usernamePath(), ...pagination] },
      },
      '/users/{username}/following': {
        get: { security: optionalAuth, parameters: [usernamePath(), ...pagination] },
      },
      '/users/{username}/follow': {
        put: { parameters: [usernamePath()] },
        delete: { parameters: [usernamePath()] },
      },
      '/ls': { post: {} },
      '/ls/{id}': {
        get: { security: optionalAuth, parameters: [idPath()] },
        patch: { parameters: [idPath()] },
        delete: { parameters: [idPath()] },
      },
      '/ls/{id}/reactions/{type}': {
        put: { parameters: [idPath(), parameter('type', 'path', schemaObject(reactionTypeSchema))] },
        delete: {
          parameters: [idPath(), parameter('type', 'path', schemaObject(reactionTypeSchema))],
        },
      },
      '/me/saved': { get: { parameters: pagination } },
      '/feed': { get: { security: optionalAuth, parameters: queryParameters(feedQuerySchema) } },
      '/feed/following': { get: { parameters: queryParameters(feedQuerySchema) } },
      '/feed/sidebar': { get: { security: optionalAuth } },
      '/ls/{id}/comments': {
        get: { security: optionalAuth, parameters: [idPath(), ...pagination] },
        post: { parameters: [idPath()] },
      },
      '/comments/{id}/replies': {
        get: { security: optionalAuth, parameters: [idPath(), ...pagination] },
        post: { parameters: [idPath()] },
      },
      '/comments/{id}': { delete: { parameters: [idPath()] } },
      '/collections': { post: {} },
      '/collections/{id}': {
        get: { security: optionalAuth, parameters: [idPath()] },
        patch: { parameters: [idPath()] },
        delete: { parameters: [idPath()] },
      },
      '/collections/{id}/ls/{lId}': {
        put: { parameters: [idPath(), idPath('lId')] },
        delete: { parameters: [idPath(), idPath('lId')] },
      },
      '/uploads/avatar': {
        post: { responses: { 503: jsonResponse('ErrorEnvelope', 'Uploads disabled') } },
      },
      '/search': {
        get: { security: optionalAuth, parameters: queryParameters(searchQuerySchema) },
      },
      '/notifications': { get: { parameters: pagination } },
      '/notifications/unread-count': { get: {} },
      '/notifications/{id}/read': { post: { parameters: [idPath()] } },
      '/notifications/read-all': { post: {} },
      '/meta/enums': { get: { security: [] } },
      '/health/private-api': {
        get: { security: [], tags: ['operations'], 'x-internal': true },
      },
      '/health/database': {
        get: { security: [], tags: ['operations'], 'x-internal': true },
      },
      '/health/session-authority': {
        get: { security: [], tags: ['operations'], 'x-internal': true },
      },
      '/openapi.json': { get: { security: [] } },
    }),
    components: {
      securitySchemes: {
        accessCookie: { type: 'apiKey', in: 'cookie', name: 'lo_access' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'lo_refresh' },
        bffCallerAssertion: { type: 'apiKey', in: 'header', name: 'X-Internal-Auth' },
        otpInspectionSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'X-LinkedOut-OTP-Inspection',
        },
      },
      schemas,
    },
  };
}

/** Zod-to-JSON conversion is deterministic and expensive; build it once per API process. */
export const OPEN_API_DOCUMENT = buildOpenApiDocument();
