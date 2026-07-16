import { z } from 'zod';
import { errorEnvelopeSchema, feedSidebarResponseSchema } from '@linkedout/contracts/v2';

import type { OpenApiDocument } from './openapi';

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { unrepresentable: 'any' });
}

export function buildOpenApiV2Document(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'LinkedOut API', version: '2.0.0' },
    servers: [{ url: '/v2' }],
    paths: {
      '/feed/sidebar': {
        get: {
          security: [{}, { accessCookie: [] }],
          responses: {
            200: {
              description: 'Feed discovery rails',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeedSidebarResponse' },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          security: [],
          responses: { 200: { description: 'OpenAPI 3.1 document' } },
        },
      },
    },
    components: {
      securitySchemes: {
        accessCookie: { type: 'apiKey', in: 'cookie', name: 'lo_access' },
      },
      schemas: {
        ErrorEnvelope: jsonSchema(errorEnvelopeSchema),
        FeedSidebarResponse: jsonSchema(feedSidebarResponseSchema),
      },
    },
  };
}

export const OPEN_API_V2_DOCUMENT = buildOpenApiV2Document();
