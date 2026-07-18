import { describe, expect, it } from "vitest";

import type { Comment } from "@linkedout/contracts";

import {
  appendComment,
  flattenComments,
  removeComment,
  updateComment,
  type CommentPages,
} from "@/lib/comment-cache";

function comment(id: string, body = `body ${id}`): Comment {
  return {
    id,
    body,
    author: {
      id: "01HZY000000000000000000AUT",
      username: "anaya",
      name: "Anaya Rao",
      image: null,
      status: null,
    },
    lId: "01HZY0000000000000000000L1",
    parentId: null,
    replyCount: 0,
    viewer: { canDelete: true },
    createdAt: "2026-07-07T12:00:00.000Z",
  };
}

function pages(...data: Comment[][]): CommentPages {
  return {
    pages: data.map((items, index) => ({
      data: items,
      nextCursor: index === data.length - 1 ? null : `after-${index}`,
    })),
    pageParams: data.map((_, index) => (index === 0 ? undefined : `after-${index - 1}`)),
  };
}

describe("flattenComments", () => {
  it("returns nothing for an unfetched cache", () => {
    expect(flattenComments(undefined)).toEqual([]);
  });

  it("renders the server's page order rather than re-sorting by id", () => {
    // Ids are opaque (public contract line 14) and the supplied ordering is authoritative
    // (§4). These ids sort the other way lexicographically; the page order still wins.
    const server = pages([comment("zeta"), comment("alpha")], [comment("Mu")]);

    expect(flattenComments(server).map(({ id }) => id)).toEqual(["zeta", "alpha", "Mu"]);
  });

  it("does not depend on ULID case, which ulidSchema allows to be lowercase", () => {
    const server = pages([comment("01hzy00000000000000000lower")], [comment("01HZY0000000000000000UPPER")]);

    expect(flattenComments(server).map(({ id }) => id)).toEqual([
      "01hzy00000000000000000lower",
      "01HZY0000000000000000UPPER",
    ]);
  });

  it("moves an optimistic copy to the server's position once the canonical page arrives", () => {
    const optimistic = appendComment(pages([comment("c1")]), comment("c2", "Posting…"));
    const withServerPage: CommentPages = {
      pages: [
        ...optimistic.pages,
        { data: [comment("c1b"), comment("c2", "Canonical server copy")], nextCursor: null },
      ],
      pageParams: [...optimistic.pageParams, "after-0"],
    };

    const visible = flattenComments(withServerPage);

    // `appendComment` had to guess c2's position (tail of the only cached page), and the
    // guess was wrong: the server puts c2 *after* c1b. The canonical page is authoritative
    // for position as well as value (public contract §4), so c2 re-seats behind c1b rather than
    // keeping the slot the optimistic append gave it.
    expect(visible.map(({ id }) => id)).toEqual(["c1", "c1b", "c2"]);
    expect(visible.at(-1)?.body).toBe("Canonical server copy");
  });

  it("leaves an optimistic comment at the tail while it has no canonical copy", () => {
    const optimistic = appendComment(pages([comment("c1")]), comment("c2", "Posting…"));

    const visible = flattenComments(optimistic);

    expect(visible.map(({ id }) => id)).toEqual(["c1", "c2"]);
    expect(visible.at(-1)?.body).toBe("Posting…");
  });

  it("deduplicates a comment repeated across pages, keeping the later value", () => {
    const overlapping = pages([comment("c1", "stale")], [comment("c1", "fresh")]);

    expect(flattenComments(overlapping)).toEqual([comment("c1", "fresh")]);
  });
});

describe("appendComment", () => {
  it("seeds a first page for an empty cache", () => {
    const created = comment("c1");

    expect(appendComment(undefined, created)).toEqual({
      pages: [{ data: [created], nextCursor: null }],
      pageParams: [undefined],
    });
    expect(appendComment({ pages: [], pageParams: [] }, created).pages).toEqual([
      { data: [created], nextCursor: null },
    ]);
  });

  it("appends to the last page and clears any earlier copy", () => {
    const seeded = pages([comment("c1"), comment("c2")], [comment("c3")]);

    const next = appendComment(seeded, comment("c2", "moved to the tail"));

    expect(next.pages.map((page) => page.data.map(({ id }) => id))).toEqual([
      ["c1"],
      ["c3", "c2"],
    ]);
  });
});

describe("updateComment", () => {
  it("maps only the matching comment and leaves an unfetched cache alone", () => {
    const seeded = pages([comment("c1")], [comment("c2")]);

    const next = updateComment(seeded, "c2", (c) => ({ ...c, replyCount: 3 }));

    expect(next?.pages[0]?.data[0]?.replyCount).toBe(0);
    expect(next?.pages[1]?.data[0]?.replyCount).toBe(3);
    expect(updateComment(undefined, "c2", (c) => c)).toBeUndefined();
  });
});

describe("removeComment", () => {
  it("drops the comment from every page and leaves an unfetched cache alone", () => {
    const seeded = pages([comment("c1"), comment("c2")], [comment("c2"), comment("c3")]);

    const next = removeComment(seeded, "c2");

    expect(next?.pages.map((page) => page.data.map(({ id }) => id))).toEqual([["c1"], ["c3"]]);
    expect(removeComment(undefined, "c2")).toBeUndefined();
  });
});
