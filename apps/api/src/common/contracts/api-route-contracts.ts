import type { Type } from '@nestjs/common';
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
import { z, type ZodType } from 'zod';

const okSchema = z.object({ ok: z.literal(true) });
const openApiDocumentSchema = z.record(z.string(), z.unknown());
const redirectResponseSchema = z.void();

const paginatedLCardSchema = paginatedSchema(lCardSchema);
const paginatedJourneyNodeSchema = paginatedSchema(journeyNodeSchema);
const paginatedCommentSchema = paginatedSchema(commentSchema);
const paginatedCollectionSchema = paginatedSchema(collectionSchema);
const paginatedUserSummarySchema = paginatedSchema(userSummarySchema);
const paginatedNotificationSchema = paginatedSchema(notificationSchema);
const searchResultSchema = z.union([paginatedLCardSchema, paginatedUserSummarySchema]);

/**
 * Canonical wire schemas used by route contracts and OpenAPI component generation. A route
 * refers to the schema object itself as well as its component name, so changing either the
 * handler contract or the published document cannot silently select a different schema.
 */
export const API_COMPONENT_SCHEMAS = {
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
  SearchResult: searchResultSchema,
  UnreadCount: unreadCountSchema,
  UpdateCollectionInput: updateCollectionInputSchema,
  UpdateLInput: updateLInputSchema,
  UpdateUserInput: updateUserInputSchema,
  UserProfile: userProfileSchema,
  UserSummary: userSummarySchema,
} as const satisfies Record<string, ZodType>;

type ComponentSchemaName = keyof typeof API_COMPONENT_SCHEMAS;

interface ContractSchema<TSchema extends ZodType = ZodType> {
  readonly name?: string;
  readonly schema: TSchema;
  readonly description: string;
}

interface ContractBody<TSchema extends ZodType = ZodType> {
  readonly name: string;
  readonly schema: TSchema;
  readonly required: boolean;
}

export interface ApiRouteContract<
  TResponseSchema extends ZodType = ZodType,
  TBodySchema extends ZodType = ZodType,
> {
  readonly key: string;
  readonly status: number;
  readonly response: ContractSchema<TResponseSchema>;
  readonly body?: ContractBody<TBodySchema>;
}

function componentSchema<const TName extends ComponentSchemaName>(name: TName) {
  return { name, schema: API_COMPONENT_SCHEMAS[name] } as const;
}

function jsonResponse<const TName extends ComponentSchemaName>(
  name: TName,
  description = 'OK',
) {
  return { ...componentSchema(name), description } as const;
}

function emptyResponse<TSchema extends ZodType>(schema: TSchema, description: string) {
  return { schema, description } as const;
}

function jsonBody<const TName extends ComponentSchemaName>(name: TName, required = true) {
  return { ...componentSchema(name), required } as const;
}

function route<
  const TKey extends string,
  const TStatus extends number,
  TResponseSchema extends ZodType,
>(
  key: TKey,
  status: TStatus,
  response: ContractSchema<TResponseSchema>,
): {
  readonly key: TKey;
  readonly status: TStatus;
  readonly response: ContractSchema<TResponseSchema>;
  readonly body?: undefined;
};
function route<
  const TKey extends string,
  const TStatus extends number,
  TResponseSchema extends ZodType,
  TBodySchema extends ZodType,
>(
  key: TKey,
  status: TStatus,
  response: ContractSchema<TResponseSchema>,
  body: ContractBody<TBodySchema>,
): {
  readonly key: TKey;
  readonly status: TStatus;
  readonly response: ContractSchema<TResponseSchema>;
  readonly body: ContractBody<TBodySchema>;
};
function route(
  key: string,
  status: number,
  response: ContractSchema,
  body?: ContractBody,
): ApiRouteContract {
  return { key, status, response, body } as const;
}

/**
 * One declarative contract per live controller operation. OpenAPI success responses and request
 * bodies are generated from this registry; `@ApiContract` binds the same object to the handler.
 */
export const API_ROUTE_CONTRACTS = {
  authGoogleStart: route(
    'get /auth/google',
    302,
    emptyResponse(redirectResponseSchema, 'Redirect to Google OAuth'),
  ),
  authGithubStart: route(
    'get /auth/github',
    302,
    emptyResponse(redirectResponseSchema, 'Redirect to GitHub OAuth'),
  ),
  authGoogleCallback: route(
    'get /auth/google/callback',
    302,
    emptyResponse(redirectResponseSchema, 'Complete Google OAuth and redirect to the web app'),
  ),
  authGithubCallback: route(
    'get /auth/github/callback',
    302,
    emptyResponse(redirectResponseSchema, 'Complete GitHub OAuth and redirect to the web app'),
  ),
  authMe: route('get /auth/me', 200, jsonResponse('AuthMeResponse')),
  authRefresh: route('post /auth/refresh', 200, jsonResponse('OkResponse')),
  authLogout: route('post /auth/logout', 200, jsonResponse('OkResponse')),

  userUpdateMe: route(
    'patch /users/me',
    200,
    jsonResponse('UserProfile'),
    jsonBody('UpdateUserInput'),
  ),
  userProfile: route('get /users/{username}', 200, jsonResponse('UserProfile')),
  userLs: route('get /users/{username}/ls', 200, jsonResponse('PaginatedLCard')),
  userJourney: route(
    'get /users/{username}/journey',
    200,
    jsonResponse('PaginatedJourneyNode'),
  ),
  userCollections: route(
    'get /users/{username}/collections',
    200,
    jsonResponse('PaginatedCollection'),
  ),
  userFollowers: route(
    'get /users/{username}/followers',
    200,
    jsonResponse('PaginatedUserSummary'),
  ),
  userFollowing: route(
    'get /users/{username}/following',
    200,
    jsonResponse('PaginatedUserSummary'),
  ),
  userFollow: route('put /users/{username}/follow', 200, jsonResponse('FollowResult')),
  userUnfollow: route('delete /users/{username}/follow', 200, jsonResponse('FollowResult')),

  lCreate: route('post /ls', 201, jsonResponse('LDetail', 'Created'), jsonBody('CreateLInput')),
  lDetail: route('get /ls/{id}', 200, jsonResponse('LDetail')),
  lUpdate: route(
    'patch /ls/{id}',
    200,
    jsonResponse('LDetail'),
    jsonBody('UpdateLInput'),
  ),
  lDelete: route('delete /ls/{id}', 200, jsonResponse('OkResponse')),
  lReact: route('put /ls/{id}/reactions/{type}', 200, jsonResponse('ReactionResult')),
  lUnreact: route('delete /ls/{id}/reactions/{type}', 200, jsonResponse('ReactionResult')),
  savedLs: route('get /me/saved', 200, jsonResponse('PaginatedLCard')),

  feedGlobal: route('get /feed', 200, jsonResponse('PaginatedLCard')),
  feedFollowing: route('get /feed/following', 200, jsonResponse('PaginatedLCard')),

  commentsForL: route('get /ls/{id}/comments', 200, jsonResponse('PaginatedComment')),
  commentCreateOnL: route(
    'post /ls/{id}/comments',
    201,
    jsonResponse('Comment', 'Created'),
    jsonBody('CreateCommentInput'),
  ),
  commentReplies: route(
    'get /comments/{id}/replies',
    200,
    jsonResponse('PaginatedComment'),
  ),
  commentCreateReply: route(
    'post /comments/{id}/replies',
    201,
    jsonResponse('Comment', 'Created'),
    jsonBody('CreateCommentInput'),
  ),
  commentDelete: route('delete /comments/{id}', 200, jsonResponse('OkResponse')),

  collectionCreate: route(
    'post /collections',
    201,
    jsonResponse('Collection', 'Created'),
    jsonBody('CreateCollectionInput'),
  ),
  collectionDetail: route(
    'get /collections/{id}',
    200,
    jsonResponse('CollectionDetail'),
  ),
  collectionUpdate: route(
    'patch /collections/{id}',
    200,
    jsonResponse('Collection'),
    jsonBody('UpdateCollectionInput'),
  ),
  collectionDelete: route('delete /collections/{id}', 200, jsonResponse('OkResponse')),
  collectionAddL: route(
    'put /collections/{id}/ls/{lId}',
    200,
    jsonResponse('CollectionDetail'),
    jsonBody('AddLToCollectionInput', false),
  ),
  collectionRemoveL: route(
    'delete /collections/{id}/ls/{lId}',
    200,
    jsonResponse('CollectionDetail'),
  ),

  avatarUpload: route(
    'post /uploads/avatar',
    200,
    jsonResponse('AvatarUploadResponse'),
    jsonBody('AvatarUploadRequest'),
  ),
  search: route('get /search', 200, jsonResponse('SearchResult')),
  notifications: route(
    'get /notifications',
    200,
    jsonResponse('PaginatedNotification'),
  ),
  notificationUnreadCount: route(
    'get /notifications/unread-count',
    200,
    jsonResponse('UnreadCount'),
  ),
  notificationRead: route(
    'post /notifications/{id}/read',
    200,
    jsonResponse('OkResponse'),
  ),
  notificationsReadAll: route(
    'post /notifications/read-all',
    200,
    jsonResponse('OkResponse'),
  ),
  metaEnums: route('get /meta/enums', 200, jsonResponse('MetaEnumsResponse')),
  popularTags: route('get /tags/popular', 200, jsonResponse('PopularTagsResponse')),
  openApi: route(
    'get /openapi.json',
    200,
    emptyResponse(openApiDocumentSchema, 'OpenAPI 3.1 document'),
  ),
} as const satisfies Record<string, ApiRouteContract>;

export const API_ROUTE_CONTRACT_BY_KEY = new Map<string, ApiRouteContract>(
  Object.values(API_ROUTE_CONTRACTS).map((contract) => [contract.key, contract]),
);

if (API_ROUTE_CONTRACT_BY_KEY.size !== Object.keys(API_ROUTE_CONTRACTS).length) {
  throw new Error('Duplicate operation key in API_ROUTE_CONTRACTS');
}

export const API_CONTRACT_METADATA = Symbol('linkedout:api-contract');

type MaybePromise<T> = T | Promise<T>;
type ContractOutput<TContract extends ApiRouteContract> = z.output<
  TContract['response']['schema']
>;

/**
 * Binds a controller method to its canonical route contract. The typed descriptor also checks
 * the handler's declared return type against the response Zod schema during `tsc`.
 */
export function ApiContract<const TContract extends ApiRouteContract>(contract: TContract) {
  return function <
    TArgs extends unknown[],
    TReturn extends MaybePromise<ContractOutput<TContract>>,
  >(
    _target: Type<unknown> | object,
    _propertyKey: string | symbol,
    descriptor: { value?: (...args: TArgs) => TReturn },
  ): void {
    if (!descriptor.value) throw new TypeError('ApiContract can only decorate methods');
    Reflect.defineMetadata(API_CONTRACT_METADATA, contract, descriptor.value);
  };
}
