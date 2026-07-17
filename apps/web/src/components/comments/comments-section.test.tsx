import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "@linkedout/contracts/v2";

import { mockUser, renderWithProviders } from "@/test/utils";
import type { Session } from "@/components/session-provider";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getComments: vi.fn(),
    getReplies: vi.fn(),
    addComment: vi.fn(),
    addReply: vi.fn(),
    deleteComment: vi.fn(),
  };
});

import { CommentsSection } from "@/components/comments/comments-section";
import { ReactionBar } from "@/components/l/reaction-bar";
import { addComment, addReply, deleteComment, getComments, getReplies } from "@/lib/api";
import { appendComment, flattenComments, type CommentPages } from "@/lib/comment-cache";

const loggedIn: Session = { user: mockUser, needsOnboarding: false };
const author = {
  id: mockUser.id,
  username: mockUser.username,
  name: mockUser.name,
  image: mockUser.image,
  status: mockUser.status,
};
const original: Comment = {
  id: "comment-1",
  body: "The first comment",
  author,
  lId: "l1",
  parentId: null,
  replyCount: 0,
  viewer: { canDelete: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const created: Comment = {
  ...original,
  id: "comment-2",
  body: "A canonical update",
  viewer: { canDelete: false },
};

function renderComments(commentCount: number) {
  return renderWithProviders(
    <>
      <ReactionBar
        lId="l1"
        reactions={{ total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 }}
        viewerReactions={[]}
        commentCount={commentCount}
        commentHref="#comments"
      />
      <CommentsSection lId="l1" commentCount={commentCount} />
    </>,
    { session: loggedIn },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getReplies).mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(deleteComment).mockResolvedValue({ ok: true });
});

describe("CommentsSection canonical cache", () => {
  it("keeps an optimistic tail ordered and deduplicated as later pages arrive", () => {
    const partial: CommentPages = {
      pages: [{ data: [original], nextCursor: "after-comment-1" }],
      pageParams: [undefined],
    };
    const optimistic = appendComment(partial, created);
    const between = { ...created, id: "comment-1b", body: "Loaded later" };
    const serverCreated = { ...created, body: "Canonical server copy" };
    const withLaterPage: CommentPages = {
      pages: [
        ...optimistic.pages,
        { data: [between, serverCreated], nextCursor: null },
      ],
      pageParams: [...optimistic.pageParams, "after-comment-1"],
    };

    const visible = flattenComments(withLaterPage);
    expect(visible.map(({ id }) => id)).toEqual(["comment-1", "comment-1b", "comment-2"]);
    expect(visible.at(-1)?.body).toBe("Canonical server copy");
  });

  it("publishes a created comment and count to every mounted consumer", async () => {
    vi.mocked(getComments).mockResolvedValue({ data: [original], nextCursor: null });
    vi.mocked(addComment).mockResolvedValue(created);
    const user = userEvent.setup();
    renderComments(1);

    expect(await screen.findByText(original.body)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Write a comment"), created.body);
    await user.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText(created.body)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2 comments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 comments" })).toBeInTheDocument();
  });

  it("removes a deleted root and its reply count from the shared total", async () => {
    const rootWithReplies = { ...original, replyCount: 2 };
    vi.mocked(getComments).mockResolvedValue({ data: [rootWithReplies], nextCursor: null });
    const user = userEvent.setup();
    renderComments(3);

    expect(await screen.findByText(original.body)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this comment?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith(original.id));
    await waitFor(() => expect(screen.queryByText(original.body)).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Comments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0 comments" })).toBeInTheDocument();
  });

  it("publishes a reply to its thread, parent count, and shared L total", async () => {
    const createdReply: Comment = {
      ...created,
      id: "reply-1",
      body: "A cached reply",
      parentId: original.id,
    };
    vi.mocked(getComments).mockResolvedValue({ data: [original], nextCursor: null });
    vi.mocked(getReplies).mockResolvedValue({ data: [createdReply], nextCursor: null });
    vi.mocked(addReply).mockResolvedValue(createdReply);
    const user = userEvent.setup();
    renderComments(1);

    expect(await screen.findByText(original.body)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    const replyBox = screen.getByPlaceholderText("Write a reply…");
    await user.type(replyBox, createdReply.body);
    await user.click(within(replyBox.closest("form")!).getByRole("button", { name: "Reply" }));

    expect(await screen.findByText(createdReply.body)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 reply" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2 comments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 comments" })).toBeInTheDocument();
  });
});
