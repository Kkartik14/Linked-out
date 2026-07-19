import type { InfiniteData } from "@tanstack/react-query";
import type { Comment, Paginated } from "@linkedout/contracts";

// TanStack stores pageParams as `unknown` unless every generic is repeated at each hook.
// Cache transforms never interpret those values, so model the canonical cache shape directly.
export type CommentPages = InfiniteData<Paginated<Comment>, unknown>;

function withoutComment(comments: Comment[], id: string): Comment[] {
  return comments.filter((comment) => comment.id !== id);
}

/**
 * Return the visible list in the order the server supplied it, deduplicated by id.
 *
 * The frontend renders the supplied ordering (public contract §4) — pages arrive already ordered,
 * and concatenating them in page order is that ordering. It deliberately does not re-sort: ids
 * are opaque ULIDs (public contract line 14), so nothing here may depend on their internals. A
 * lexicographic sort would, twice over — it assumes ULIDs are time-ordered as strings, and that
 * they are uppercase, while `ulidSchema` also accepts lowercase Crockford base32, which sorts
 * after every uppercase id.
 *
 * The `delete` before each `set` is load-bearing, and the whole reason this isn't a plain
 * dedupe. `appendComment` guesses a position for an optimistic comment — the tail of the last
 * cached page — and that guess is frequently wrong: once a further page arrives, the comment's
 * real place is wherever the server put it. A `Map` fixes a key's slot at *first* insertion, so
 * without the delete the optimistic guess would outrank the canonical page forever, and the
 * frontend's ordering would beat the server's. Deleting first re-seats the id at its
 * last-seen — that is, canonical — position, and carries the canonical value with it.
 *
 * A comment with no canonical copy yet is untouched: it appears once, at the tail, exactly
 * where `appendComment` put it.
 */
export function flattenComments(data: CommentPages | undefined): Comment[] {
  if (!data) return [];
  const byId = new Map<string, Comment>();
  for (const page of data.pages) {
    for (const comment of page.data) {
      byId.delete(comment.id);
      byId.set(comment.id, comment);
    }
  }
  return [...byId.values()];
}

/**
 * Publish a newly-created comment immediately, at the tail of the last cached page — a guess,
 * since only the server knows where it really belongs. `flattenComments` reconciles it against
 * the canonical copy once that page arrives, moving it to the server's position.
 */
export function appendComment(data: CommentPages | undefined, comment: Comment): CommentPages {
  if (!data || data.pages.length === 0) {
    return {
      pages: [{ data: [comment], nextCursor: null }],
      pageParams: [undefined],
    };
  }

  const lastPage = data.pages.length - 1;
  return {
    ...data,
    pages: data.pages.map((page, index) => ({
      ...page,
      data:
        index === lastPage
          ? [...withoutComment(page.data, comment.id), comment]
          : withoutComment(page.data, comment.id),
    })),
  };
}

export function updateComment(
  data: CommentPages | undefined,
  id: string,
  update: (comment: Comment) => Comment,
): CommentPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((comment) => (comment.id === id ? update(comment) : comment)),
    })),
  };
}

export function removeComment(
  data: CommentPages | undefined,
  id: string,
): CommentPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, data: withoutComment(page.data, id) })),
  };
}
