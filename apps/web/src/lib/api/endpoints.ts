import { API_BASE_URL } from "@/lib/env";
import type {
  AuthMeResponse,
  AvatarUploadRequest,
  AvatarUploadResponse,
  Collection,
  CollectionDetail,
  Comment,
  CreateCommentInput,
  CreateLInput,
  FollowResult,
  JourneyNode,
  LCard,
  LDetail,
  LType,
  MetaEnumsResponse,
  Notification,
  Paginated,
  UpdateLInput,
  UpdateUserInput,
  PopularTagsResponse,
  ReactionResult,
  ReactionType,
  UserProfile,
  UserSummary,
} from "@linkedout/contracts";
import { isSafeReturnTo } from "@linkedout/contracts";
import { apiFetch } from "./client";

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

function json(body: unknown): { method?: string; body: string } {
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
export const getMeta = () => apiFetch<MetaEnumsResponse>("/meta/enums");
export const getPopularTags = (q?: string, limit = 10) =>
  apiFetch<PopularTagsResponse>(`/tags/popular${qs({ q, limit })}`);

// ── Feed ─────────────────────────────────────────────────────────────────────
export type FeedScope = "global" | "following";
export type FeedSort = "latest" | "trending" | "helpful";

export interface FeedQuery {
  scope?: FeedScope;
  sort?: FeedSort;
  filter?: string; // lowercased LCategory
  cursor?: string;
  limit?: number;
}

export function getFeed(opts: FeedQuery = {}): Promise<Paginated<LCard>> {
  const path = opts.scope === "following" ? "/feed/following" : "/feed";
  return apiFetch<Paginated<LCard>>(
    `${path}${qs({ sort: opts.sort, filter: opts.filter, cursor: opts.cursor, limit: opts.limit })}`,
  );
}

// ── Ls (core object) ─────────────────────────────────────────────────────────
export const getL = (id: string) => apiFetch<LDetail>(`/ls/${id}`);
export const createL = (body: CreateLInput) =>
  apiFetch<LDetail>("/ls", { method: "POST", ...json(body) });
export const patchL = (id: string, body: UpdateLInput) =>
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
export const getFollowers = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<UserSummary>>(`/users/${username}/followers${qs({ cursor, limit })}`);
export const getFollowing = (username: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<UserSummary>>(`/users/${username}/following${qs({ cursor, limit })}`);
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
export const searchLs = (q: string, filter?: string, cursor?: string, limit?: number) =>
  apiFetch<Paginated<LCard>>(`/search${qs({ q, type: "ls", filter, cursor, limit })}`);
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
