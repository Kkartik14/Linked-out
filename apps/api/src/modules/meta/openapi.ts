import { z } from 'zod';
import {
  addLToCollectionInputSchema,
  authMeResponseSchema,
  avatarUploadRequestSchema,
  avatarUploadResponseSchema,
  collectionDetailSchema,
  collectionSchema,
  commentSchema,
  createCollectionInputSchema,
  createCommentInputSchema,
  createLInputSchema,
  errorEnvelopeSchema,
  followResultSchema,
  journeyNodeSchema,
  lCardSchema,
  lDetailSchema,
  metaEnumsResponseSchema,
  notificationSchema,
  paginatedSchema,
  popularTagsResponseSchema,
  reactionResultSchema,
  unreadCountSchema,
  updateCollectionInputSchema,
  updateLInputSchema,
  updateUserInputSchema,
  userProfileSchema,
  userSummarySchema,
} from '@linkedout/contracts';

export type OpenApiDocument = Record<string, unknown>;

const okSchema = z.object({ ok: z.literal(true) });

function schemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(schemaName: string, description = 'OK'): Record<string, unknown> {
  return {
    description,
    content: { 'application/json': { schema: schemaRef(schemaName) } },
  };
}

function jsonBody(schemaName: string, required = true): Record<string, unknown> {
  return {
    required,
    content: { 'application/json': { schema: schemaRef(schemaName) } },
  };
}

function pathParam(name: string): Record<string, unknown> {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

function queryParam(
  name: string,
  schema: Record<string, unknown> = { type: 'string' },
  required = false,
) {
  return { name, in: 'query', required, schema };
}

const paginatedLCardSchema = paginatedSchema(lCardSchema);
const paginatedJourneyNodeSchema = paginatedSchema(journeyNodeSchema);
const paginatedCommentSchema = paginatedSchema(commentSchema);
const paginatedCollectionSchema = paginatedSchema(collectionSchema);
const paginatedUserSummarySchema = paginatedSchema(userSummarySchema);
const paginatedNotificationSchema = paginatedSchema(notificationSchema);

const componentSchemas = {
  AddLToCollectionInput: addLToCollectionInputSchema,
  AuthMeResponse: authMeResponseSchema,
  AvatarUploadRequest: avatarUploadRequestSchema,
  AvatarUploadResponse: avatarUploadResponseSchema,
  Collection: collectionSchema,
  CollectionDetail: collectionDetailSchema,
  Comment: commentSchema,
  CreateCollectionInput: createCollectionInputSchema,
  CreateCommentInput: createCommentInputSchema,
  CreateLInput: createLInputSchema,
  ErrorEnvelope: errorEnvelopeSchema,
  FollowResult: followResultSchema,
  LCard: lCardSchema,
  LDetail: lDetailSchema,
  MetaEnumsResponse: metaEnumsResponseSchema,
  OkResponse: okSchema,
  PaginatedCollection: paginatedCollectionSchema,
  PaginatedComment: paginatedCommentSchema,
  PaginatedJourneyNode: paginatedJourneyNodeSchema,
  PaginatedLCard: paginatedLCardSchema,
  PaginatedNotification: paginatedNotificationSchema,
  PaginatedUserSummary: paginatedUserSummarySchema,
  PopularTagsResponse: popularTagsResponseSchema,
  ReactionResult: reactionResultSchema,
  UnreadCount: unreadCountSchema,
  UpdateCollectionInput: updateCollectionInputSchema,
  UpdateLInput: updateLInputSchema,
  UpdateUserInput: updateUserInputSchema,
  UserProfile: userProfileSchema,
  UserSummary: userSummarySchema,
} as const;

function jsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(componentSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { unrepresentable: 'any' }),
    ]),
  );
}

const paginationParams = [
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
  queryParam('cursor'),
];
const journeyPaginationParams = [
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 30 }),
  queryParam('cursor'),
];
const oauthReturnToParam = queryParam('returnTo', {
  type: 'string',
  maxLength: 512,
  pattern: '^/(?!/)(?!.*\\\\)(?!.*[\\x00-\\x1f\\x7f]).*',
});

export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'LinkedOut API', version: '1.1.0' },
    servers: [{ url: '/v1' }],
    paths: {
      '/auth/google': {
        get: {
          parameters: [oauthReturnToParam],
          responses: { 302: { description: 'Redirect to Google OAuth' } },
        },
      },
      '/auth/github': {
        get: {
          parameters: [oauthReturnToParam],
          responses: { 302: { description: 'Redirect to GitHub OAuth' } },
        },
      },
      '/auth/me': { get: { responses: { 200: jsonResponse('AuthMeResponse') } } },
      '/auth/refresh': { post: { responses: { 200: jsonResponse('OkResponse') } } },
      '/auth/logout': { post: { responses: { 200: jsonResponse('OkResponse') } } },

      '/users/me': {
        patch: {
          requestBody: jsonBody('UpdateUserInput'),
          responses: { 200: jsonResponse('UserProfile') },
        },
      },
      '/users/{username}': {
        get: {
          parameters: [pathParam('username')],
          responses: { 200: jsonResponse('UserProfile') },
        },
      },
      '/users/{username}/ls': {
        get: {
          parameters: [pathParam('username'), queryParam('type'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedLCard') },
        },
      },
      '/users/{username}/journey': {
        get: {
          parameters: [pathParam('username'), ...journeyPaginationParams],
          responses: { 200: jsonResponse('PaginatedJourneyNode') },
        },
      },
      '/users/{username}/collections': {
        get: {
          parameters: [pathParam('username'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedCollection') },
        },
      },
      '/users/{username}/followers': {
        get: {
          parameters: [pathParam('username'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedUserSummary') },
        },
      },
      '/users/{username}/following': {
        get: {
          parameters: [pathParam('username'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedUserSummary') },
        },
      },
      '/users/{username}/follow': {
        put: {
          parameters: [pathParam('username')],
          responses: { 200: jsonResponse('FollowResult') },
        },
        delete: {
          parameters: [pathParam('username')],
          responses: { 200: jsonResponse('FollowResult') },
        },
      },

      '/ls': {
        post: {
          requestBody: jsonBody('CreateLInput'),
          responses: { 201: jsonResponse('LDetail', 'Created') },
        },
      },
      '/ls/{id}': {
        get: { parameters: [pathParam('id')], responses: { 200: jsonResponse('LDetail') } },
        patch: {
          parameters: [pathParam('id')],
          requestBody: jsonBody('UpdateLInput'),
          responses: { 200: jsonResponse('LDetail') },
        },
        delete: {
          parameters: [pathParam('id')],
          responses: { 200: jsonResponse('OkResponse') },
        },
      },
      '/ls/{id}/reactions/{type}': {
        put: {
          parameters: [pathParam('id'), pathParam('type')],
          responses: { 200: jsonResponse('ReactionResult') },
        },
        delete: {
          parameters: [pathParam('id'), pathParam('type')],
          responses: { 200: jsonResponse('ReactionResult') },
        },
      },
      '/me/saved': {
        get: {
          parameters: paginationParams,
          responses: { 200: jsonResponse('PaginatedLCard') },
        },
      },

      '/feed': {
        get: {
          parameters: [queryParam('sort'), queryParam('filter'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedLCard') },
        },
      },
      '/feed/following': {
        get: {
          parameters: [queryParam('sort'), queryParam('filter'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedLCard') },
        },
      },

      '/ls/{id}/comments': {
        get: {
          parameters: [pathParam('id'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedComment') },
        },
        post: {
          parameters: [pathParam('id')],
          requestBody: jsonBody('CreateCommentInput'),
          responses: { 201: jsonResponse('Comment', 'Created') },
        },
      },
      '/comments/{id}/replies': {
        get: {
          parameters: [pathParam('id'), ...paginationParams],
          responses: { 200: jsonResponse('PaginatedComment') },
        },
        post: {
          parameters: [pathParam('id')],
          requestBody: jsonBody('CreateCommentInput'),
          responses: { 201: jsonResponse('Comment', 'Created') },
        },
      },
      '/comments/{id}': {
        delete: {
          parameters: [pathParam('id')],
          responses: { 200: jsonResponse('OkResponse') },
        },
      },

      '/collections': {
        post: {
          requestBody: jsonBody('CreateCollectionInput'),
          responses: { 201: jsonResponse('Collection', 'Created') },
        },
      },
      '/collections/{id}': {
        get: {
          parameters: [pathParam('id')],
          responses: { 200: jsonResponse('CollectionDetail') },
        },
        patch: {
          parameters: [pathParam('id')],
          requestBody: jsonBody('UpdateCollectionInput'),
          responses: { 200: jsonResponse('Collection') },
        },
        delete: {
          parameters: [pathParam('id')],
          responses: { 200: jsonResponse('OkResponse') },
        },
      },
      '/collections/{id}/ls/{lId}': {
        put: {
          parameters: [pathParam('id'), pathParam('lId')],
          requestBody: jsonBody('AddLToCollectionInput', false),
          responses: { 200: jsonResponse('CollectionDetail') },
        },
        delete: {
          parameters: [pathParam('id'), pathParam('lId')],
          responses: { 200: jsonResponse('CollectionDetail') },
        },
      },

      '/uploads/avatar': {
        post: {
          requestBody: jsonBody('AvatarUploadRequest'),
          responses: {
            200: jsonResponse('AvatarUploadResponse'),
            503: jsonResponse('ErrorEnvelope', 'Uploads disabled'),
          },
        },
      },
      '/search': {
        get: {
          parameters: [
            queryParam('q', { type: 'string', minLength: 1, maxLength: 100 }, true),
            queryParam('type', { type: 'string', enum: ['ls', 'users'], default: 'ls' }),
            queryParam('filter', {
              type: 'string',
              enum: ['interviews', 'startups', 'layoffs', 'production', 'career', 'learning'],
            }),
            ...paginationParams,
          ],
          responses: {
            200: {
              description: 'Paginated L cards or user summaries',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [schemaRef('PaginatedLCard'), schemaRef('PaginatedUserSummary')],
                  },
                },
              },
            },
          },
        },
      },
      '/notifications': {
        get: {
          parameters: paginationParams,
          responses: { 200: jsonResponse('PaginatedNotification') },
        },
      },
      '/notifications/unread-count': {
        get: { responses: { 200: jsonResponse('UnreadCount') } },
      },
      '/notifications/{id}/read': {
        post: {
          parameters: [pathParam('id')],
          responses: { 200: jsonResponse('OkResponse') },
        },
      },
      '/notifications/read-all': {
        post: { responses: { 200: jsonResponse('OkResponse') } },
      },
      '/meta/enums': { get: { responses: { 200: jsonResponse('MetaEnumsResponse') } } },
      '/tags/popular': {
        get: {
          parameters: [
            queryParam('q'),
            queryParam('limit', { type: 'integer', minimum: 1, maximum: 20, default: 10 }),
          ],
          responses: { 200: jsonResponse('PopularTagsResponse') },
        },
      },
      '/openapi.json': {
        get: { responses: { 200: { description: 'OpenAPI 3.1 document' } } },
      },
    },
    components: {
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
