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
  feedSidebarResponseSchema,
  followResultSchema,
  journeyNodeSchema,
  lCardSchema,
  lDetailSchema,
  metaEnumsResponseSchema,
  notificationSchema,
  paginatedSchema,
  reactionResultSchema,
  unreadCountSchema,
  updateLInputSchema,
  updateCollectionInputSchema,
  updateUserInputSchema,
  userProfileSchema,
  userSummarySchema,
} from '@linkedout/contracts/v2';
import { z, type ZodType } from 'zod';

import { API_ROUTE_CONTRACTS, type ApiRouteContract } from './api-route-contracts';

const okSchema = z.object({ ok: z.literal(true) });
const paginatedLCardSchema = paginatedSchema(lCardSchema);
const paginatedJourneyNodeSchema = paginatedSchema(journeyNodeSchema);
const paginatedCollectionSchema = paginatedSchema(collectionSchema);
const paginatedCommentSchema = paginatedSchema(commentSchema);
const paginatedNotificationSchema = paginatedSchema(notificationSchema);
const paginatedUserSummarySchema = paginatedSchema(userSummarySchema);
const searchResultSchema = z.union([paginatedLCardSchema, paginatedUserSummarySchema]);

export const API_COMPONENT_SCHEMAS_V2 = {
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
  FeedSidebarResponse: feedSidebarResponseSchema,
  FollowResult: followResultSchema,
  LDetail: lDetailSchema,
  MetaEnumsResponse: metaEnumsResponseSchema,
  OkResponse: okSchema,
  PaginatedCollection: paginatedCollectionSchema,
  PaginatedComment: paginatedCommentSchema,
  PaginatedJourneyNode: paginatedJourneyNodeSchema,
  PaginatedLCard: paginatedLCardSchema,
  PaginatedNotification: paginatedNotificationSchema,
  PaginatedUserSummary: paginatedUserSummarySchema,
  ReactionResult: reactionResultSchema,
  SearchResult: searchResultSchema,
  UnreadCount: unreadCountSchema,
  UpdateCollectionInput: updateCollectionInputSchema,
  UpdateLInput: updateLInputSchema,
  UpdateUserInput: updateUserInputSchema,
  UserProfile: userProfileSchema,
} as const satisfies Record<string, ZodType>;

type ComponentName = keyof typeof API_COMPONENT_SCHEMAS_V2;

function response<const TName extends ComponentName>(name: TName, description = 'OK') {
  return { name, schema: API_COMPONENT_SCHEMAS_V2[name], description } as const;
}

function body<const TName extends ComponentName>(name: TName, required = true) {
  return { name, schema: API_COMPONENT_SCHEMAS_V2[name], required } as const;
}

type RouteResponse = ApiRouteContract['response'];
type RouteBody = NonNullable<ApiRouteContract['body']>;

function route<const TKey extends string, const TStatus extends number, TResponse extends RouteResponse>(
  key: TKey,
  status: TStatus,
  routeResponse: TResponse,
): { readonly key: TKey; readonly status: TStatus; readonly response: TResponse };
function route<
  const TKey extends string,
  const TStatus extends number,
  TResponse extends RouteResponse,
  TBody extends RouteBody,
>(
  key: TKey,
  status: TStatus,
  routeResponse: TResponse,
  routeBody: TBody,
): { readonly key: TKey; readonly status: TStatus; readonly response: TResponse; readonly body: TBody };
function route(
  key: string,
  status: number,
  routeResponse: RouteResponse,
  routeBody?: RouteBody,
): ApiRouteContract {
  return { key, status, response: routeResponse, body: routeBody };
}

export const API_ROUTE_CONTRACTS_V2 = {
  authGoogleStart: API_ROUTE_CONTRACTS.authGoogleStart,
  authGithubStart: API_ROUTE_CONTRACTS.authGithubStart,
  authGoogleCallback: API_ROUTE_CONTRACTS.authGoogleCallback,
  authGithubCallback: API_ROUTE_CONTRACTS.authGithubCallback,
  authMe: API_ROUTE_CONTRACTS.authMe,
  authRefresh: API_ROUTE_CONTRACTS.authRefresh,
  authLogout: API_ROUTE_CONTRACTS.authLogout,
  userUpdateMe: API_ROUTE_CONTRACTS.userUpdateMe,
  userProfile: API_ROUTE_CONTRACTS.userProfile,
  userCollections: API_ROUTE_CONTRACTS.userCollections,
  userFollowers: API_ROUTE_CONTRACTS.userFollowers,
  userFollowing: API_ROUTE_CONTRACTS.userFollowing,
  userFollow: API_ROUTE_CONTRACTS.userFollow,
  userUnfollow: API_ROUTE_CONTRACTS.userUnfollow,
  lCreate: route('post /ls', 201, response('LDetail', 'Created'), body('CreateLInput')),
  lDetail: route('get /ls/{id}', 200, response('LDetail')),
  lUpdate: route('patch /ls/{id}', 200, response('LDetail'), body('UpdateLInput')),
  lDelete: route('delete /ls/{id}', 200, response('OkResponse')),
  savedLs: route('get /me/saved', 200, response('PaginatedLCard')),
  feedGlobal: route('get /feed', 200, response('PaginatedLCard')),
  feedFollowing: route('get /feed/following', 200, response('PaginatedLCard')),
  feedSidebar: route('get /feed/sidebar', 200, response('FeedSidebarResponse', 'Feed discovery rails')),
  userLs: route('get /users/{username}/ls', 200, response('PaginatedLCard')),
  userJourney: route(
    'get /users/{username}/journey',
    200,
    response('PaginatedJourneyNode'),
  ),
  lReact: API_ROUTE_CONTRACTS.lReact,
  lUnreact: API_ROUTE_CONTRACTS.lUnreact,
  commentsForL: API_ROUTE_CONTRACTS.commentsForL,
  commentCreateOnL: API_ROUTE_CONTRACTS.commentCreateOnL,
  commentReplies: API_ROUTE_CONTRACTS.commentReplies,
  commentCreateReply: API_ROUTE_CONTRACTS.commentCreateReply,
  commentDelete: API_ROUTE_CONTRACTS.commentDelete,
  collectionCreate: API_ROUTE_CONTRACTS.collectionCreate,
  collectionDetail: route('get /collections/{id}', 200, response('CollectionDetail')),
  collectionUpdate: API_ROUTE_CONTRACTS.collectionUpdate,
  collectionDelete: API_ROUTE_CONTRACTS.collectionDelete,
  collectionAddL: route(
    'put /collections/{id}/ls/{lId}',
    200,
    response('CollectionDetail'),
    body('AddLToCollectionInput', false),
  ),
  collectionRemoveL: route(
    'delete /collections/{id}/ls/{lId}',
    200,
    response('CollectionDetail'),
  ),
  avatarUpload: API_ROUTE_CONTRACTS.avatarUpload,
  search: route('get /search', 200, response('SearchResult')),
  notifications: API_ROUTE_CONTRACTS.notifications,
  notificationUnreadCount: API_ROUTE_CONTRACTS.notificationUnreadCount,
  notificationRead: API_ROUTE_CONTRACTS.notificationRead,
  notificationsReadAll: API_ROUTE_CONTRACTS.notificationsReadAll,
  metaEnums: route('get /meta/enums', 200, response('MetaEnumsResponse')),
  openApi: route('get /openapi.json', 200, {
    schema: z.record(z.string(), z.unknown()),
    description: 'OpenAPI 3.1 document',
  }),
} as const satisfies Record<string, ApiRouteContract>;

export const API_ROUTE_CONTRACT_BY_KEY_V2 = new Map<string, ApiRouteContract>(
  Object.values(API_ROUTE_CONTRACTS_V2).map((contract) => [contract.key, contract]),
);

if (API_ROUTE_CONTRACT_BY_KEY_V2.size !== Object.keys(API_ROUTE_CONTRACTS_V2).length) {
  throw new Error('Duplicate operation key in API_ROUTE_CONTRACTS_V2');
}
