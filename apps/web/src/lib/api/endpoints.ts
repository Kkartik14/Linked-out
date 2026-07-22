import { API_BASE_URL } from "@/lib/env";
import type {
  AuthMeResponse,
  AvatarUploadRequest,
  AvatarUploadResponse,
  Collection,
  CollectionDetail,
  Comment,
  CreateCommentInput,
  EmailAuthHandoffResponse,
  EmailOtpRequestAccepted,
  EmailOtpResendInput,
  EmailSignupInput,
  FeedQuery as ContractFeedQuery,
  FeedSidebarResponse,
  FeedSort as ContractFeedSort,
  FollowResult,
  ForgotPasswordInput,
  JourneyNode,
  LCard,
  LDetail,
  LType,
  MetaEnumsResponse,
  Notification,
  Paginated,
  ResetPasswordInput,
  UpdateUserInput,
  ReactionResult,
  ReactionType,
  UserProfile,
  UserSummary,
} from "@linkedout/contracts";
import {
  createLInputSchema,
  emailLoginInputSchema,
  emailOtpVerifyInputSchema,
  isSafeReturnTo,
  updateLInputSchema,
} from "@linkedout/contracts";
import type { z } from "zod";
import type { ComposedPrincipal } from "@/lib/principal";
import { apiFetch, type ApiFetchInit } from "./client";

/**
 * Request bodies are the schema's INPUT type, not `z.infer` (which is the *output*).
 *
 * `createLInputSchema` gives `type`, `visibility` and `isAnonymous` a `.default()`, so on
 * the output side all three are required — and typing a body with `z.infer` would oblige
 * this client to send values the backend is supposed to choose (public contract §1 documents
 * them as optional). A dumb client does not pick the privacy default; it omits the field
 * and lets the server apply `PUBLIC`.
 */
type CreateLBody = z.input<typeof createLInputSchema>;
type UpdateLBody = z.input<typeof updateLInputSchema>;

/**
 * Verify/login bodies are the schema INPUT type: `returnTo` carries a `.default('/')`, so on the
 * output side it is required, but a caller may legitimately omit it and let the server apply the
 * default — the same reasoning as {@link CreateLBody}.
 */
type EmailVerifyBody = z.input<typeof emailOtpVerifyInputSchema>;
type EmailLoginBody = z.input<typeof emailLoginInputSchema>;

type QueryValue = string | number | boolean | undefined | null;
type OkResponse = { ok: true };

function qs(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function json(body: unknown): { body: string } {
  return { body: JSON.stringify(body) };
}

/**
 * Every authenticated mutation, and the only way to make one.
 *
 * The API refuses an authenticated unsafe method that does not declare the principal its
 * view was composed under (`409 PRINCIPAL_MISMATCH`) — a missing header is a mismatch, not
 * an exemption. Routing all of them through here, with `principal` a required leading
 * argument of the branded type, is what makes forgetting it a compile error rather than a
 * write that fails in production. A new mutation cannot silently skip the declaration; it
 * cannot be written at all without one.
 */
function mutate<T>(
  principal: ComposedPrincipal,
  path: string,
  init: ApiFetchInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, principal });
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const getMe = () => apiFetch<AuthMeResponse>("/auth/me");
export const logout = (principal: ComposedPrincipal) =>
  mutate<OkResponse>(principal, "/auth/logout", { method: "POST" });

/** Full backend URL to start an OAuth flow (a browser navigation, not a fetch). */
export function oauthLoginUrl(provider: "google" | "github", returnTo = "/"): string {
  if (!isSafeReturnTo(returnTo)) {
    throw new Error("returnTo must be a safe relative path.");
  }
  return `${API_BASE_URL}/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
}

// ── Email + password auth ──────────────────────────────────────────────────────
/**
 * The email-auth surface (backend feature 1.1.3). These are **guest** POSTs — no session, no
 * `X-LinkedOut-Principal` — so they go through `apiFetch` directly rather than {@link mutate};
 * the API treats them as anonymous unsafe requests. Responses are deliberately generic
 * (enumeration-safe `202`s); `verify`/`login` alone return a one-time session handoff, which the
 * caller completes through the existing OAuth handoff exchange (see `@/lib/email-auth`).
 */
export const emailSignup = (body: EmailSignupInput) =>
  apiFetch<EmailOtpRequestAccepted>("/auth/email/signup", { method: "POST", ...json(body) });

export const emailVerify = (body: EmailVerifyBody) =>
  apiFetch<EmailAuthHandoffResponse>("/auth/email/verify", { method: "POST", ...json(body) });

export const emailLogin = (body: EmailLoginBody) =>
  apiFetch<EmailAuthHandoffResponse>("/auth/email/login", { method: "POST", ...json(body) });

export const emailResendOtp = (body: EmailOtpResendInput) =>
  apiFetch<EmailOtpRequestAccepted>("/auth/email/resend", { method: "POST", ...json(body) });

export const emailForgotPassword = (body: ForgotPasswordInput) =>
  apiFetch<EmailOtpRequestAccepted>("/auth/email/password/forgot", {
    method: "POST",
    ...json(body),
  });

export const emailResetPassword = (body: ResetPasswordInput) =>
  apiFetch<OkResponse>("/auth/email/password/reset", { method: "POST", ...json(body) });

// ── Meta & discovery ─────────────────────────────────────────────────────────
export const getMeta = () =>
  apiFetch<MetaEnumsResponse>("/meta/enums", {
    // Public, deployment-versioned display metadata: share across principals and revalidate
    // daily. Omitting credentials is what makes cross-request Next caching safe.
    cache: "force-cache",
    credentials: "omit",
    next: { revalidate: 86_400 },
  });

// ── Feed ─────────────────────────────────────────────────────────────────────
/** Which feed route to call. Frontend-only: the backend expresses this as two paths. */
export type FeedScope = "global" | "following";
export type FeedSort = ContractFeedSort;

/**
 * A call to `getFeed`: the contract's wire query plus the one thing that is not on the wire.
 *
 * `scope` picks the route (`/feed` vs `/feed/following`), so it is genuinely a frontend
 * concern and has to live somewhere. It does not live in a hand-written twin of
 * `FeedQuery` — that name is already taken by the contract one import path away, and
 * re-declaring `sort`/`cursor`/`limit` here is how the two silently drift. `Partial` because
 * this is the *request* side: the contract's type is the parsed output, where `sort` and
 * `limit` are already defaulted, and a dumb client omits them rather than choosing them.
 */
export interface FeedRequest extends Partial<ContractFeedQuery> {
  scope?: FeedScope;
}

export function getFeed(opts: FeedRequest = {}): Promise<Paginated<LCard>> {
  const path = opts.scope === "following" ? "/feed/following" : "/feed";
  return apiFetch<Paginated<LCard>>(
    `${path}${qs({ sort: opts.sort, cursor: opts.cursor, limit: opts.limit })}`,
  );
}

/**
 * The feed page's discovery rails: viewer, people to follow, Top Ls, L of the day
 * (public contract §2). One optional-auth aggregate; the wire does not encode left/right.
 *
 * Fails independently of the centre feed — callers hide the rails rather than the page.
 * That is only true if it actually fails: a shorter budget than the default keeps a slow
 * backend from holding the feed page open for something the page is allowed to drop.
 */
export const getFeedSidebar = () =>
  apiFetch<FeedSidebarResponse>("/feed/sidebar", { timeoutMs: 3_000 });

// ── Ls (core object) ─────────────────────────────────────────────────────────
export const getL = (id: string) => apiFetch<LDetail>(`/ls/${id}`);
export const createL = (principal: ComposedPrincipal, body: CreateLBody) =>
  mutate<LDetail>(principal, "/ls", { method: "POST", ...json(body) });
export const patchL = (principal: ComposedPrincipal, id: string, body: UpdateLBody) =>
  mutate<LDetail>(principal, `/ls/${id}`, { method: "PATCH", ...json(body) });
export const deleteL = (principal: ComposedPrincipal, id: string) =>
  mutate<OkResponse>(principal, `/ls/${id}`, { method: "DELETE" });

// ── Reactions ────────────────────────────────────────────────────────────────
export const addReaction = (principal: ComposedPrincipal, id: string, type: ReactionType) =>
  mutate<ReactionResult>(principal, `/ls/${id}/reactions/${type}`, { method: "PUT" });
export const removeReaction = (principal: ComposedPrincipal, id: string, type: ReactionType) =>
  mutate<ReactionResult>(principal, `/ls/${id}/reactions/${type}`, { method: "DELETE" });
export const getSaved = (cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/me/saved${qs({ cursor, limit })}`);

// ── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (lId: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Comment>>(`/ls/${lId}/comments${qs({ cursor, limit })}`);
export const addComment = (
  principal: ComposedPrincipal,
  lId: string,
  body: CreateCommentInput,
) => mutate<Comment>(principal, `/ls/${lId}/comments`, { method: "POST", ...json(body) });
export const getReplies = (commentId: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Comment>>(`/comments/${commentId}/replies${qs({ cursor, limit })}`);
export const addReply = (
  principal: ComposedPrincipal,
  commentId: string,
  body: CreateCommentInput,
) => mutate<Comment>(principal, `/comments/${commentId}/replies`, { method: "POST", ...json(body) });
export const deleteComment = (principal: ComposedPrincipal, id: string) =>
  mutate<OkResponse>(principal, `/comments/${id}`, { method: "DELETE" });

// ── Users & profiles ─────────────────────────────────────────────────────────
export const getProfile = (username: string) =>
  apiFetch<UserProfile>(`/users/${username}`);
export const patchMe = (principal: ComposedPrincipal, body: UpdateUserInput) =>
  mutate<UserProfile>(principal, "/users/me", { method: "PATCH", ...json(body) });
export const getUserLs = (username: string, type?: LType, cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/users/${username}/ls${qs({ type, cursor, limit })}`);
export const getJourney = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<JourneyNode>>(`/users/${username}/journey${qs({ cursor, limit })}`);
export const getUserCollections = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Collection>>(`/users/${username}/collections${qs({ cursor, limit })}`);
export const follow = (principal: ComposedPrincipal, username: string) =>
  mutate<FollowResult>(principal, `/users/${username}/follow`, { method: "PUT" });
export const unfollow = (principal: ComposedPrincipal, username: string) =>
  mutate<FollowResult>(principal, `/users/${username}/follow`, { method: "DELETE" });

// ── Collections ──────────────────────────────────────────────────────────────
export const createCollection = (principal: ComposedPrincipal, title: string) =>
  mutate<Collection>(principal, "/collections", { method: "POST", ...json({ title }) });
export const getCollection = (id: string) =>
  apiFetch<CollectionDetail>(`/collections/${id}`);
export const renameCollection = (principal: ComposedPrincipal, id: string, title: string) =>
  mutate<Collection>(principal, `/collections/${id}`, { method: "PATCH", ...json({ title }) });
export const deleteCollection = (principal: ComposedPrincipal, id: string) =>
  mutate<OkResponse>(principal, `/collections/${id}`, { method: "DELETE" });
export const addLToCollection = (
  principal: ComposedPrincipal,
  id: string,
  lId: string,
  position?: number,
) =>
  mutate<CollectionDetail>(principal, `/collections/${id}/ls/${lId}`, {
    method: "PUT",
    ...(position !== undefined ? json({ position }) : {}),
  });
export const removeLFromCollection = (
  principal: ComposedPrincipal,
  id: string,
  lId: string,
) => mutate<CollectionDetail>(principal, `/collections/${id}/ls/${lId}`, { method: "DELETE" });

// ── Search ───────────────────────────────────────────────────────────────────
/** Public API search is always relevance-ranked and has no category filter. */
type SearchFetchInit = Pick<ApiFetchInit, "signal">;

function search<T>(
  type: "ls" | "users",
  q: string,
  cursor?: string,
  limit?: number,
  init?: SearchFetchInit,
): Promise<Paginated<T>> {
  const path = `/search${qs({ q, type, cursor, limit })}`;
  return init ? apiFetch<Paginated<T>>(path, init) : apiFetch<Paginated<T>>(path);
}

export const searchLs = (
  q: string,
  cursor?: string,
  limit?: number,
  init?: SearchFetchInit,
) => search<LCard>("ls", q, cursor, limit, init);
export const searchUsers = (
  q: string,
  cursor?: string,
  limit?: number,
  init?: SearchFetchInit,
) => search<UserSummary>("users", q, cursor, limit, init);

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = (cursor?: string, limit?: number) =>
  apiFetch<Paginated<Notification>>(`/notifications${qs({ cursor, limit })}`);
export const getUnreadCount = () =>
  apiFetch<{ count: number }>("/notifications/unread-count");
export const markNotificationRead = (principal: ComposedPrincipal, id: string) =>
  mutate<OkResponse>(principal, `/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = (principal: ComposedPrincipal) =>
  mutate<OkResponse>(principal, "/notifications/read-all", { method: "POST" });

// ── Media upload ─────────────────────────────────────────────────────────────
export const presignAvatar = (principal: ComposedPrincipal, body: AvatarUploadRequest) =>
  mutate<AvatarUploadResponse>(principal, "/uploads/avatar", { method: "POST", ...json(body) });
