import { API_BASE_URL } from "@/lib/env";
import type {
  AuthMeResponse,
  AvatarUploadRequest,
  AvatarUploadResponse,
  Collection,
  CollectionDetail,
  Comment,
  CreateCommentInput,
  FeedQuery as ContractFeedQuery,
  FeedSidebarResponse,
  FeedSort as ContractFeedSort,
  FollowResult,
  JourneyNode,
  LCard,
  LDetail,
  LType,
  MetaEnumsResponse,
  Notification,
  Paginated,
  UpdateUserInput,
  ReactionResult,
  ReactionType,
  UserProfile,
  UserSummary,
} from "@linkedout/contracts/v2";
import {
  createLInputSchema,
  isSafeReturnTo,
  updateLInputSchema,
} from "@linkedout/contracts/v2";
import type { z } from "zod";
import { apiFetch } from "./client";

/**
 * Request bodies are the schema's INPUT type, not `z.infer` (which is the *output*).
 *
 * `createLInputSchema` gives `type`, `visibility` and `isAnonymous` a `.default()`, so on
 * the output side all three are required — and typing a body with `z.infer` would oblige
 * this client to send values the backend is supposed to choose (contract v2 §1 documents
 * them as optional). A dumb client does not pick the privacy default; it omits the field
 * and lets the server apply `PUBLIC`.
 */
type CreateLBody = z.input<typeof createLInputSchema>;
type UpdateLBody = z.input<typeof updateLInputSchema>;

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

// ── Auth ────────────────────────────────────────────────────────────────────
export const getMe = () => apiFetch<AuthMeResponse>("/auth/me");
export const logout = () => apiFetch<OkResponse>("/auth/logout", { method: "POST" });

/** Full backend URL to start an OAuth flow (a browser navigation, not a fetch). */
export function oauthLoginUrl(provider: "google" | "github", returnTo = "/"): string {
  if (!isSafeReturnTo(returnTo)) {
    throw new Error("returnTo must be a safe relative path.");
  }
  return `${API_BASE_URL}/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
}

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
 * (contract v2 §2). One optional-auth aggregate; the wire does not encode left/right.
 *
 * Fails independently of the centre feed — callers hide the rails rather than the page.
 * That is only true if it actually fails: a shorter budget than the default keeps a slow
 * backend from holding the feed page open for something the page is allowed to drop.
 */
export const getFeedSidebar = () =>
  apiFetch<FeedSidebarResponse>("/feed/sidebar", { timeoutMs: 3_000 });

// ── Ls (core object) ─────────────────────────────────────────────────────────
export const getL = (id: string) => apiFetch<LDetail>(`/ls/${id}`);
export const createL = (body: CreateLBody) =>
  apiFetch<LDetail>("/ls", { method: "POST", ...json(body) });
export const patchL = (id: string, body: UpdateLBody) =>
  apiFetch<LDetail>(`/ls/${id}`, { method: "PATCH", ...json(body) });
export const deleteL = (id: string) => apiFetch<OkResponse>(`/ls/${id}`, { method: "DELETE" });

// ── Reactions ────────────────────────────────────────────────────────────────
export const addReaction = (id: string, type: ReactionType) =>
  apiFetch<ReactionResult>(`/ls/${id}/reactions/${type}`, { method: "PUT" });
export const removeReaction = (id: string, type: ReactionType) =>
  apiFetch<ReactionResult>(`/ls/${id}/reactions/${type}`, { method: "DELETE" });
export const getSaved = (cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/me/saved${qs({ cursor, limit })}`);

// ── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (lId: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Comment>>(`/ls/${lId}/comments${qs({ cursor, limit })}`);
export const addComment = (lId: string, body: CreateCommentInput) =>
  apiFetch<Comment>(`/ls/${lId}/comments`, { method: "POST", ...json(body) });
export const getReplies = (commentId: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Comment>>(`/comments/${commentId}/replies${qs({ cursor, limit })}`);
export const addReply = (commentId: string, body: CreateCommentInput) =>
  apiFetch<Comment>(`/comments/${commentId}/replies`, { method: "POST", ...json(body) });
export const deleteComment = (id: string) =>
  apiFetch<OkResponse>(`/comments/${id}`, { method: "DELETE" });

// ── Users & profiles ─────────────────────────────────────────────────────────
export const getProfile = (username: string) =>
  apiFetch<UserProfile>(`/users/${username}`);
export const patchMe = (body: UpdateUserInput) =>
  apiFetch<UserProfile>("/users/me", { method: "PATCH", ...json(body) });
export const getUserLs = (username: string, type?: LType, cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/users/${username}/ls${qs({ type, cursor, limit })}`);
export const getJourney = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<JourneyNode>>(`/users/${username}/journey${qs({ cursor, limit })}`);
export const getUserCollections = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<Collection>>(`/users/${username}/collections${qs({ cursor, limit })}`);
export const follow = (username: string) =>
  apiFetch<FollowResult>(`/users/${username}/follow`, { method: "PUT" });
export const unfollow = (username: string) =>
  apiFetch<FollowResult>(`/users/${username}/follow`, { method: "DELETE" });

// ── Collections ──────────────────────────────────────────────────────────────
export const createCollection = (title: string) =>
  apiFetch<Collection>("/collections", { method: "POST", ...json({ title }) });
export const getCollection = (id: string) =>
  apiFetch<CollectionDetail>(`/collections/${id}`);
export const renameCollection = (id: string, title: string) =>
  apiFetch<Collection>(`/collections/${id}`, { method: "PATCH", ...json({ title }) });
export const deleteCollection = (id: string) =>
  apiFetch<OkResponse>(`/collections/${id}`, { method: "DELETE" });
export const addLToCollection = (id: string, lId: string, position?: number) =>
  apiFetch<CollectionDetail>(`/collections/${id}/ls/${lId}`, {
    method: "PUT",
    ...(position !== undefined ? json({ position }) : {}),
  });
export const removeLFromCollection = (id: string, lId: string) =>
  apiFetch<CollectionDetail>(`/collections/${id}/ls/${lId}`, { method: "DELETE" });

// ── Search ───────────────────────────────────────────────────────────────────
/** v2 search is always relevance-ranked and has no category filter. */
export const searchLs = (q: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/search${qs({ q, type: "ls", cursor, limit })}`);
export const searchUsers = (q: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<UserSummary>>(`/search${qs({ q, type: "users", cursor, limit })}`);

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = (cursor?: string, limit?: number) =>
  apiFetch<Paginated<Notification>>(`/notifications${qs({ cursor, limit })}`);
export const getUnreadCount = () =>
  apiFetch<{ count: number }>("/notifications/unread-count");
export const markNotificationRead = (id: string) =>
  apiFetch<OkResponse>(`/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () =>
  apiFetch<OkResponse>("/notifications/read-all", { method: "POST" });

// ── Media upload ─────────────────────────────────────────────────────────────
export const presignAvatar = (body: AvatarUploadRequest) =>
  apiFetch<AvatarUploadResponse>("/uploads/avatar", { method: "POST", ...json(body) });
