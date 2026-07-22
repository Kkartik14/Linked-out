import type { Type } from '@nestjs/common';
import {
  authMeResponseSchema,
  emailSignupInputSchema,
  emailOtpRequestAcceptedSchema,
  emailOtpVerifyInputSchema,
  emailLoginInputSchema,
  emailAuthHandoffResponseSchema,
  emailOtpResendInputSchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  emailOtpInspectInputSchema,
  emailOtpInspectResponseSchema,
  oauthHandoffExchangeInputSchema,
  oauthHandoffExchangeResponseSchema,
  sessionResolveInputSchema,
  sessionResolveResponseSchema,
  sessionRevokeInputSchema,
  sessionRevokeResponseSchema,
  avatarUploadRequestSchema,
  avatarUploadResponseSchema,
  commentSchema,
  createCommentInputSchema,
  createLInputSchema,
  errorEnvelopeSchema,
  feedSidebarResponseSchema,
  followListUserSchema,
  followResultSchema,
  lCardSchema,
  lDetailSchema,
  metaEnumsResponseSchema,
  notificationSchema,
  operationalHealthResponseSchema,
  paginatedSchema,
  reactionResultSchema,
  unreadCountSchema,
  updateLInputSchema,
  updateUserInputSchema,
  userProfileSchema,
  userSummarySchema,
} from '@linkedout/contracts';
import { z, type ZodType } from 'zod';

const okSchema = z.object({ ok: z.literal(true) });
const openApiDocumentSchema = z.record(z.string(), z.json());
const redirectResponseSchema = z.void();

const paginatedLCardSchema = paginatedSchema(lCardSchema);
const paginatedCommentSchema = paginatedSchema(commentSchema);
const paginatedUserSummarySchema = paginatedSchema(userSummarySchema);
const paginatedFollowListUserSchema = paginatedSchema(followListUserSchema);
const paginatedNotificationSchema = paginatedSchema(notificationSchema);
const searchResultSchema = z.union([paginatedLCardSchema, paginatedUserSummarySchema]);

/**
 * Canonical wire schemas used by route contracts and OpenAPI component generation. A route
 * refers to the schema object itself as well as its component name, so changing either the
 * handler contract or the published document cannot silently select a different schema.
 */
export const API_COMPONENT_SCHEMAS = {
  AuthMeResponse: authMeResponseSchema,
  EmailSignupInput: emailSignupInputSchema,
  EmailOtpRequestAccepted: emailOtpRequestAcceptedSchema,
  EmailOtpVerifyInput: emailOtpVerifyInputSchema,
  EmailLoginInput: emailLoginInputSchema,
  EmailAuthHandoffResponse: emailAuthHandoffResponseSchema,
  EmailOtpResendInput: emailOtpResendInputSchema,
  ForgotPasswordInput: forgotPasswordInputSchema,
  ResetPasswordInput: resetPasswordInputSchema,
  EmailOtpInspectInput: emailOtpInspectInputSchema,
  EmailOtpInspectResponse: emailOtpInspectResponseSchema,
  OAuthHandoffExchangeInput: oauthHandoffExchangeInputSchema,
  OAuthHandoffExchangeResponse: oauthHandoffExchangeResponseSchema,
  SessionResolveInput: sessionResolveInputSchema,
  SessionResolveResponse: sessionResolveResponseSchema,
  SessionRevokeInput: sessionRevokeInputSchema,
  SessionRevokeResponse: sessionRevokeResponseSchema,
  AvatarUploadRequest: avatarUploadRequestSchema,
  AvatarUploadResponse: avatarUploadResponseSchema,
  Comment: commentSchema,
  CreateCommentInput: createCommentInputSchema,
  CreateLInput: createLInputSchema,
  ErrorEnvelope: errorEnvelopeSchema,
  FeedSidebarResponse: feedSidebarResponseSchema,
  FollowResult: followResultSchema,
  LCard: lCardSchema,
  LDetail: lDetailSchema,
  MetaEnumsResponse: metaEnumsResponseSchema,
  OperationalHealthResponse: operationalHealthResponseSchema,
  OkResponse: okSchema,
  PaginatedComment: paginatedCommentSchema,
  PaginatedFollowListUser: paginatedFollowListUserSchema,
  PaginatedLCard: paginatedLCardSchema,
  PaginatedNotification: paginatedNotificationSchema,
  PaginatedUserSummary: paginatedUserSummarySchema,
  ReactionResult: reactionResultSchema,
  SearchResult: searchResultSchema,
  UnreadCount: unreadCountSchema,
  UpdateLInput: updateLInputSchema,
  UpdateUserInput: updateUserInputSchema,
  UserProfile: userProfileSchema,
  UserSummary: userSummarySchema,
} as const satisfies Record<string, ZodType>;

export type ComponentSchemaName = keyof typeof API_COMPONENT_SCHEMAS;

interface ContractSchema<
  TComponentName extends string = ComponentSchemaName,
  TSchema extends ZodType = ZodType,
> {
  readonly name?: TComponentName;
  readonly schema: TSchema;
  readonly description: string;
}

interface ContractBody<
  TComponentName extends string = ComponentSchemaName,
  TSchema extends ZodType = ZodType,
> {
  readonly name: TComponentName;
  readonly schema: TSchema;
  readonly required: boolean;
}

export interface NamedApiRouteContract<
  TComponentName extends string,
  TResponseSchema extends ZodType = ZodType,
  TBodySchema extends ZodType = ZodType,
> {
  readonly key: string;
  readonly status: number;
  readonly response: ContractSchema<TComponentName, TResponseSchema>;
  readonly body?: ContractBody<TComponentName, TBodySchema>;
}

export type ApiRouteContract<
  TResponseSchema extends ZodType = ZodType,
  TBodySchema extends ZodType = ZodType,
> = NamedApiRouteContract<ComponentSchemaName, TResponseSchema, TBodySchema>;

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
  TResponse extends ContractSchema,
>(
  key: TKey,
  status: TStatus,
  response: TResponse,
): {
  readonly key: TKey;
  readonly status: TStatus;
  readonly response: TResponse;
  readonly body?: undefined;
};
function route<
  const TKey extends string,
  const TStatus extends number,
  TResponse extends ContractSchema,
  TBody extends ContractBody,
>(
  key: TKey,
  status: TStatus,
  response: TResponse,
  body: TBody,
): {
  readonly key: TKey;
  readonly status: TStatus;
  readonly response: TResponse;
  readonly body: TBody;
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
  authEmailSignup: route(
    'post /auth/email/signup',
    202,
    jsonResponse('EmailOtpRequestAccepted', 'Accepted'),
    jsonBody('EmailSignupInput'),
  ),
  authEmailVerify: route(
    'post /auth/email/verify',
    200,
    jsonResponse('EmailAuthHandoffResponse'),
    jsonBody('EmailOtpVerifyInput'),
  ),
  authEmailLogin: route(
    'post /auth/email/login',
    200,
    jsonResponse('EmailAuthHandoffResponse'),
    jsonBody('EmailLoginInput'),
  ),
  authEmailResend: route(
    'post /auth/email/resend',
    202,
    jsonResponse('EmailOtpRequestAccepted', 'Accepted'),
    jsonBody('EmailOtpResendInput'),
  ),
  authEmailPasswordForgot: route(
    'post /auth/email/password/forgot',
    202,
    jsonResponse('EmailOtpRequestAccepted', 'Accepted'),
    jsonBody('ForgotPasswordInput'),
  ),
  authEmailPasswordReset: route(
    'post /auth/email/password/reset',
    200,
    jsonResponse('OkResponse'),
    jsonBody('ResetPasswordInput'),
  ),
  authEmailOtpInspect: route(
    'post /auth/email/otp/inspect',
    200,
    jsonResponse('EmailOtpInspectResponse'),
    jsonBody('EmailOtpInspectInput'),
  ),
  authOAuthHandoffExchange: route(
    'post /auth/oauth/handoff/exchange',
    200,
    jsonResponse('OAuthHandoffExchangeResponse'),
    jsonBody('OAuthHandoffExchangeInput'),
  ),
  authSessionsResolve: route(
    'post /auth/sessions/resolve',
    200,
    jsonResponse('SessionResolveResponse'),
    jsonBody('SessionResolveInput'),
  ),
  authSessionsRevoke: route(
    'post /auth/sessions/revoke',
    200,
    jsonResponse('SessionRevokeResponse'),
    jsonBody('SessionRevokeInput'),
  ),

  userUpdateMe: route(
    'patch /users/me',
    200,
    jsonResponse('UserProfile'),
    jsonBody('UpdateUserInput'),
  ),
  userProfile: route('get /users/{username}', 200, jsonResponse('UserProfile')),
  userLs: route('get /users/{username}/ls', 200, jsonResponse('PaginatedLCard')),
  userFollowers: route(
    'get /users/{username}/followers',
    200,
    jsonResponse('PaginatedFollowListUser'),
  ),
  userFollowing: route(
    'get /users/{username}/following',
    200,
    jsonResponse('PaginatedFollowListUser'),
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
  feedSidebar: route('get /feed/sidebar', 200, jsonResponse('FeedSidebarResponse')),

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
  healthPrivateApi: route(
    'get /health/private-api',
    200,
    jsonResponse('OperationalHealthResponse'),
  ),
  healthDatabase: route(
    'get /health/database',
    200,
    jsonResponse('OperationalHealthResponse'),
  ),
  healthSessionAuthority: route(
    'get /health/session-authority',
    200,
    jsonResponse('OperationalHealthResponse'),
  ),
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
type AnyApiRouteContract = NamedApiRouteContract<string>;
type ContractOutput<TContract extends AnyApiRouteContract> = z.output<
  TContract['response']['schema']
>;

/**
 * Binds a controller method to its canonical route contract. The typed descriptor also checks
 * the handler's declared return type against the response Zod schema during `tsc`.
 */
export function ApiContract<const TContract extends AnyApiRouteContract>(contract: TContract) {
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
