import type { InfiniteData } from "@tanstack/react-query";
import type { Comment, Paginated } from "@linkedout/contracts";

// TanStack stores pageParams as `unknown` unless every generic is repeated at each hook.
// Cache transforms never interpret those values, so model the canonical cache shape directly.
export type CommentPages = InfiniteData<Paginated<Comment>, unknown>;

function withoutComment(comments: Comment[], id: string): Comment[] {
  return comments.filter((comment) => comment.id !== id);
}

/**
 * Return the visible oldest-first list. A just-created comment can temporarily exist in an
 * earlier cached page and then arrive again in the final server page; prefer the later
 * canonical copy, deduplicate it, and restore ULID order across page boundaries.
 */
export function flattenComments(data: CommentPages | undefined): Comment[] {
  if (!data) return [];
  const byId = new Map<string, Comment>();
  for (const page of data.pages) {
    for (const comment of page.data) byId.set(comment.id, comment);
  }
  return [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

/**
 * Publish a newly-created comment immediately. `flattenComments` keeps the visible list
 * ordered if this is a partial oldest-first pagination window and deduplicates the later
 * canonical server copy.
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
