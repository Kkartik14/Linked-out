import type {
  CreateLInput,
  LType,
  UpdateLInput,
  UpdateUserInput,
  ReactionType,
} from "@linkedout/contracts";
import type { ApiFetchInit } from "../client";
import { ApiError } from "../errors";
import * as db from "./data";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`);
}
function decodeCursor(cursor: string): number {
  try {
    const s = atob(cursor);
    if (s.startsWith("o:")) {
      const n = Number.parseInt(s.slice(2), 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
  } catch {
    /* fall through */
  }
  throw new ApiError(400, "BAD_CURSOR", "The pagination cursor is invalid.");
}

function paginate<T>(items: T[], url: URLSearchParams, def = 20, max = 50) {
  const limit = clamp(Number(url.get("limit")) || def, 1, max);
  const start = url.get("cursor") ? decodeCursor(url.get("cursor")!) : 0;
  const end = start + limit;
  return { data: items.slice(start, end), nextCursor: end < items.length ? encodeCursor(end) : null };
}

function notFound(code: string, message: string): never {
  throw new ApiError(404, code, message);
}
function notFoundUser(): never {
  notFound("USER_NOT_FOUND", "This user does not exist.");
}

/**
 * Route a (method, path) pair to a fixture response, mirroring the shapes and
 * status codes in contract.md. Throws `ApiError` for the error cases.
 */
export async function mockFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const qIndex = path.indexOf("?");
  const rawPath = qIndex === -1 ? path : path.slice(0, qIndex);
  const url = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
  const seg = rawPath.split("/").filter(Boolean);
  const body: unknown = init.body ? JSON.parse(init.body as string) : undefined;

  // Realistic latency in the browser so loading skeletons and optimistic
  // reverts are actually visible; instant on the server for fast SSR.
  if (typeof window !== "undefined") {
    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  return handle(method, seg, url, body) as T;
}

function handle(method: string, seg: (string | undefined)[], url: URLSearchParams, body: unknown): unknown {
  const [a, b, c, d] = seg;

  // ── Meta & discovery ──
  if (a === "meta" && b === "enums" && method === "GET") return db.META;
  if (a === "tags" && b === "popular" && method === "GET") {
    return db.popularTags(url.get("q"), clamp(Number(url.get("limit")) || 10, 1, 20));
  }

  // ── Auth ──
  if (a === "auth") {
    if (b === "me" && method === "GET") return { user: db.meProfile(), needsOnboarding: false };
    if (b === "logout" && method === "POST") return { ok: true };
    if (b === "refresh" && method === "POST") return { ok: true };
  }

  // ── Feed ──
  if (a === "feed" && method === "GET") {
    const scope = b === "following" ? "following" : "global";
    const sort = ((url.get("sort") as db.SortKey | null) ?? "latest") as db.SortKey;
    return paginate(db.feedList({ scope, sort, filter: url.get("filter") }), url);
  }

  // ── Saved ──
  if (a === "me" && b === "saved" && method === "GET") return paginate(db.savedLs(), url);

  // ── Ls ──
  if (a === "ls") {
    if (b === undefined && method === "POST") return db.createLRec(body as CreateLInput);
    if (b !== undefined && c === undefined) {
      if (method === "GET") return db.lDetail(b) ?? notFound("L_NOT_FOUND", "This L does not exist or is not visible to you.");
      if (method === "PATCH") return db.patchLRec(b, body as UpdateLInput) ?? notFound("L_NOT_FOUND", "This L does not exist.");
      if (method === "DELETE") {
        if (!db.deleteLRec(b)) notFound("L_NOT_FOUND", "This L does not exist.");
        return { ok: true };
      }
    }
    if (b !== undefined && c === "comments" && d === undefined) {
      if (method === "GET") return paginate(db.commentsFor(b, null), url);
      if (method === "POST") {
        return db.addCommentRec(b, null, (body as { body: string }).body) ?? notFound("L_NOT_FOUND", "This L does not exist.");
      }
    }
    if (b !== undefined && c === "reactions" && d !== undefined) {
      const type = d as ReactionType;
      if (method === "PUT") return db.react(b, type, true) ?? notFound("L_NOT_FOUND", "This L does not exist.");
      if (method === "DELETE") return db.react(b, type, false) ?? notFound("L_NOT_FOUND", "This L does not exist.");
    }
  }

  // ── Comments ──
  if (a === "comments" && b !== undefined) {
    if (c === "replies") {
      if (method === "GET") return paginate(db.repliesFor(b), url);
      if (method === "POST") {
        return db.addReplyRec(b, (body as { body: string }).body) ?? notFound("COMMENT_NOT_FOUND", "This comment does not exist.");
      }
    }
    if (c === undefined && method === "DELETE") {
      if (!db.deleteCommentRec(b)) notFound("COMMENT_NOT_FOUND", "This comment does not exist.");
      return { ok: true };
    }
  }

  // ── Users & profiles ──
  if (a === "users" && b !== undefined) {
    if (b === "me" && method === "PATCH") return db.patchMeRec(body as UpdateUserInput);
    const username = b;
    if (c === undefined && method === "GET") {
      const user = db.userByUsername(username);
      return user ? db.toProfile(user) : notFoundUser();
    }
    if (c === "ls" && method === "GET") {
      const list = db.userLs(username, (url.get("type") as LType | null) ?? null);
      return list ? paginate(list, url) : notFoundUser();
    }
    if (c === "journey" && method === "GET") {
      const list = db.userJourney(username);
      return list ? paginate(list, url, 30, 100) : notFoundUser();
    }
    if (c === "collections" && method === "GET") {
      const list = db.userCollections(username);
      return list ? paginate(list, url) : notFoundUser();
    }
    if (c === "followers" && method === "GET") {
      const list = db.followerSummaries(username);
      return list ? paginate(list, url) : notFoundUser();
    }
    if (c === "following" && method === "GET") {
      const list = db.followingSummaries(username);
      return list ? paginate(list, url) : notFoundUser();
    }
    if (c === "follow") {
      if (method === "PUT") return db.toggleFollow(username, true) ?? notFoundUser();
      if (method === "DELETE") return db.toggleFollow(username, false) ?? notFoundUser();
    }
  }

  // ── Collections ──
  if (a === "collections") {
    if (b === undefined && method === "POST") return db.createCollectionRec((body as { title: string }).title);
    if (b !== undefined && c === undefined) {
      if (method === "GET") return db.collectionDetail(b) ?? notFound("COLLECTION_NOT_FOUND", "This collection does not exist.");
      if (method === "PATCH") return db.renameCollectionRec(b, (body as { title: string }).title) ?? notFound("COLLECTION_NOT_FOUND", "This collection does not exist.");
      if (method === "DELETE") {
        if (!db.deleteCollectionRec(b)) notFound("COLLECTION_NOT_FOUND", "This collection does not exist.");
        return { ok: true };
      }
    }
    if (b !== undefined && c === "ls" && d !== undefined) {
      if (method === "PUT") {
        if (!db.addToCollectionRec(b, d, (body as { position?: number } | undefined)?.position)) {
          return notFound("COLLECTION_NOT_FOUND", "This collection does not exist.");
        }
        return db.collectionDetail(b);
      }
      if (method === "DELETE") {
        if (!db.collectionDetail(b)) return notFound("COLLECTION_NOT_FOUND", "This collection does not exist.");
        db.removeFromCollectionRec(b, d);
        return db.collectionDetail(b);
      }
    }
  }

  // ── Search ──
  if (a === "search" && method === "GET") {
    const q = url.get("q") ?? "";
    if ((url.get("type") ?? "ls") === "users") return paginate(db.searchUsersQuery(q), url);
    return paginate(db.searchLsQuery(q, url.get("filter")), url);
  }

  // ── Notifications ──
  if (a === "notifications") {
    if (b === undefined && method === "GET") return paginate(db.notificationList(), url);
    if (b === "unread-count" && method === "GET") return { count: db.unreadCount() };
    if (b === "read-all" && method === "POST") {
      db.markAllNotifsRead();
      return { ok: true };
    }
    if (b !== undefined && c === "read" && method === "POST") {
      db.markNotifRead(b);
      return { ok: true };
    }
  }

  // ── Media upload ──
  if (a === "uploads" && b === "avatar" && method === "POST") {
    const contentType = (body as { contentType?: string } | undefined)?.contentType ?? "image/jpeg";
    return {
      uploadUrl: "https://mock.local/upload",
      publicUrl: "https://cdn.linkedout.app/avatars/mock.jpg",
      headers: { "Content-Type": contentType },
      expiresIn: 300,
    };
  }

  throw new ApiError(404, "NOT_IMPLEMENTED", `Mock backend has no handler for ${method} /${seg.join("/")}.`);
}
