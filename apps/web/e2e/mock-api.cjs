const http = require("node:http");

const port = Number(process.env.MOCK_API_PORT ?? 4100);
const WEB_ORIGIN = process.env.PLAYWRIGHT_WEB_ORIGIN ?? "http://localhost:3100";

const IDS = {
  user: "01JUSER0000000000000000001",
  other: "01JUSER0000000000000000002",
  google: "01JLS000000000000000000001",
  startup: "01JLS000000000000000000002",
  following: "01JLS000000000000000000003",
  created: "01JLS000000000000000000004",
  collection: "01JCOLLECTION000000000001",
  comment: "01JCOMMENT000000000000001",
  notification: "01JNOTIFICATION0000000001",
};

const now = "2026-01-02T03:04:05.000Z";

const meta = {
  reactionType: [
    { value: "BEEN_THERE", label: "Been There", emoji: "" },
    { value: "HELPFUL", label: "Helpful", emoji: "" },
    { value: "RESPECT", label: "Respect", emoji: "" },
    { value: "PAIN", label: "Pain", emoji: "" },
    { value: "SAVED", label: "Saved", emoji: "" },
  ],
  journeyStatus: [
    { value: "INTERVIEWING", label: "Interviewing", dot: "" },
    { value: "BUILDING", label: "Building", dot: "" },
    { value: "WORKING", label: "Working", dot: "" },
    { value: "STARTING_UP", label: "Starting Up", dot: "" },
    { value: "RECOVERING", label: "Recovering", dot: "" },
    { value: "TAKING_A_BREAK", label: "Taking a Break", dot: "" },
  ],
  lType: [
    { value: "L", label: "L", sectionLabel: "Ls" },
    { value: "WIN", label: "Win", sectionLabel: "Wins" },
    { value: "STORY", label: "Story", sectionLabel: "Stories" },
    { value: "SCAR", label: "Scar", sectionLabel: "Scars" },
    { value: "PLOT_TWIST", label: "Plot Twist", sectionLabel: "Plot Twists" },
    { value: "CHECKPOINT", label: "Checkpoint", sectionLabel: "Checkpoints" },
    { value: "BATTLE", label: "Battle", sectionLabel: "Battles" },
    { value: "LESSON", label: "Lesson", sectionLabel: "Character Development" },
  ],
  lCategory: [
    { value: "INTERVIEWS", label: "Interviews" },
    { value: "STARTUPS", label: "Startups" },
    { value: "LAYOFFS", label: "Layoffs" },
    { value: "PRODUCTION", label: "Production" },
    { value: "CAREER", label: "Career" },
    { value: "LEARNING", label: "Learning" },
  ],
  visibility: [
    { value: "PUBLIC", label: "Public", description: "Anyone can see this" },
    { value: "FOLLOWERS", label: "Followers", description: "Only people who follow you" },
    { value: "PRIVATE", label: "Private", description: "Only you" },
  ],
  notificationType: [
    { value: "RELATED", label: "Related" },
    { value: "HELPED", label: "Helped" },
    { value: "NEW_FOLLOWER", label: "New Follower" },
    { value: "COMMENT", label: "Comment" },
  ],
  reputation: [
    { key: "storiesShared", label: "Stories Shared" },
    { key: "lessonsShared", label: "Lessons Shared" },
    { key: "buildersHelped", label: "Builders Helped" },
    { key: "lsShared", label: "Ls Shared" },
    { key: "collectionsCreated", label: "Collections Created" },
  ],
};

function summary(overrides = {}) {
  return {
    id: IDS.user,
    username: "kartik",
    name: "Kartik Gupta",
    image: null,
    status: "BUILDING",
    ...overrides,
  };
}

function baseProfile(overrides = {}) {
  return {
    ...summary(),
    bio: "Building LinkedOut and documenting the lessons.",
    reputation: {
      storiesShared: 1,
      lessonsShared: 2,
      buildersHelped: 3,
      lsShared: 4,
      collectionsCreated: 1,
    },
    counts: { followers: 12, following: 4 },
    viewer: { isFollowing: false, isSelf: false },
    createdAt: now,
    ...overrides,
  };
}

function reactionSummary(overrides = {}) {
  return {
    total: 3,
    beenThere: 2,
    helpful: 1,
    respect: 0,
    pain: 0,
    saved: 1,
    ...overrides,
  };
}

let db;

function reset() {
  const user = baseProfile();
  db = {
    user,
    ls: new Map([
      [
        IDS.google,
        {
          id: IDS.google,
          title: "Rejected after the final round at Google",
          story: "I made it through the onsite loop, waited a week, and got the rejection. I wrote down the feedback before the disappointment took over.",
          type: "L",
          category: "INTERVIEWS",
          company: "Google",
          tags: ["interviews", "google"],
          eventDate: "2025-11-10T00:00:00.000Z",
          visibility: "PUBLIC",
          isAnonymous: false,
          resolvedAt: null,
          author: summary(),
          reactions: reactionSummary(),
          viewerReactions: ["SAVED"],
          createdAt: "2026-01-01T10:00:00.000Z",
          collections: [{ id: IDS.collection, title: "Interview lessons", slug: "interview-lessons" }],
        },
      ],
      [
        IDS.startup,
        {
          id: IDS.startup,
          title: "We shut down the startup after three years",
          story: "The market was not there, and our burn rate was louder than our conviction.",
          type: "STORY",
          category: "STARTUPS",
          company: "TinyCo",
          tags: ["startup", "pivot"],
          eventDate: null,
          visibility: "PUBLIC",
          isAnonymous: false,
          resolvedAt: null,
          author: summary(),
          reactions: reactionSummary({ total: 1, beenThere: 0, helpful: 1, saved: 0 }),
          viewerReactions: [],
          createdAt: "2026-01-01T09:00:00.000Z",
          collections: [],
        },
      ],
      [
        IDS.following,
        {
          id: IDS.following,
          title: "A private leadership lesson from a missed deadline",
          story: "The deadline slipped because I did not name the risk early enough.",
          type: "LESSON",
          category: "PRODUCTION",
          company: null,
          tags: ["leadership"],
          eventDate: null,
          visibility: "FOLLOWERS",
          isAnonymous: false,
          resolvedAt: null,
          author: summary({ id: IDS.other, username: "maya", name: "Maya Rao", status: "WORKING" }),
          reactions: reactionSummary({ total: 0, beenThere: 0, helpful: 0, saved: 0 }),
          viewerReactions: [],
          createdAt: "2026-01-01T08:00:00.000Z",
          collections: [],
        },
      ],
    ]),
    comments: new Map([
      [
        IDS.google,
        [
          {
            id: IDS.comment,
            body: "Interview loops can be brutal, but this is useful.",
            author: summary({ id: IDS.other, username: "maya", name: "Maya Rao", status: "WORKING" }),
            lId: IDS.google,
            parentId: null,
            replyCount: 0,
            viewer: { canDelete: false },
            createdAt: now,
          },
        ],
      ],
    ]),
    notifications: [
      {
        id: IDS.notification,
        type: "COMMENT",
        actor: summary({ id: IDS.other, username: "maya", name: "Maya Rao", status: "WORKING" }),
        target: { lId: IDS.google, title: "Rejected after the final round at Google" },
        message: "Maya commented on your L.",
        readAt: null,
        createdAt: now,
      },
    ],
    collections: new Map([
      [
        IDS.collection,
        {
          id: IDS.collection,
          title: "Interview lessons",
          slug: "interview-lessons",
          owner: summary(),
          lIds: [IDS.google],
          createdAt: now,
        },
      ],
    ]),
  };
}

reset();

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
      }),
  );
}

function isAuthed(req) {
  return parseCookies(req).mock_auth === "1" || req.headers.origin === WEB_ORIGIN;
}

function visibleLs(req) {
  return [...db.ls.values()].filter((l) => l.visibility === "PUBLIC" || isAuthed(req));
}

function withViewer(l, req) {
  const authed = isAuthed(req);
  const canEdit = authed && l.author?.id === db.user.id;
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    category: l.category,
    company: l.company,
    tags: l.tags,
    eventDate: l.eventDate,
    visibility: l.visibility,
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt,
    author: l.isAnonymous ? null : l.author,
    reactions: l.reactions,
    commentCount: db.comments.get(l.id)?.length ?? 0,
    viewer: {
      reactions: authed ? l.viewerReactions : [],
      canEdit,
    },
    createdAt: l.createdAt,
  };
}

function toCard(l, req) {
  return {
    ...withViewer(l, req),
    storyPreview: l.story.length > 180 ? `${l.story.slice(0, 180)}...` : l.story,
  };
}

function toDetail(l, req) {
  return {
    ...withViewer(l, req),
    story: l.story,
    collections: l.collections,
  };
}

function toCollection(collection, req) {
  return {
    id: collection.id,
    title: collection.title,
    slug: collection.slug,
    owner: collection.owner,
    lCount: collection.lIds.length,
    viewer: { canEdit: isAuthed(req) && collection.owner.id === db.user.id },
    createdAt: collection.createdAt,
  };
}

function toCollectionDetail(collection, req) {
  return {
    ...toCollection(collection, req),
    ls: collection.lIds.map((id) => db.ls.get(id)).filter(Boolean).map((l) => toCard(l, req)),
  };
}

function corsHeaders(req) {
  const origin = req.headers.origin || WEB_ORIGIN;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,cookie",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "vary": "origin",
  };
}

function send(res, req, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    ...corsHeaders(req),
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function fail(res, req, status, code, message, details) {
  send(res, req, status, { error: { code, message, details } });
}

function page(data) {
  return { data, nextCursor: null };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  fail(res, req, 401, "UNAUTHENTICATED", "You must be signed in.");
  return false;
}

function routeFeed(req, res, url, following) {
  if (following && !requireAuth(req, res)) return;
  const filter = url.searchParams.get("filter");
  let rows = following
    ? [db.ls.get(IDS.following)]
    : [db.ls.get(IDS.google), db.ls.get(IDS.startup)].filter(Boolean);
  if (filter === "startups") rows = rows.filter((l) => l.category === "STARTUPS");
  if (filter === "interviews") rows = rows.filter((l) => l.category === "INTERVIEWS");
  send(res, req, 200, page(rows.map((l) => toCard(l, req))));
}

function routeSearch(req, res, url) {
  const q = String(url.searchParams.get("q") ?? "").toLowerCase();
  const type = url.searchParams.get("type") === "users" ? "users" : "ls";
  if (!q) {
    fail(res, req, 400, "VALIDATION_ERROR", "Some fields need attention.");
    return;
  }
  if (type === "users") {
    const users = [summary(), summary({ id: IDS.other, username: "maya", name: "Maya Rao", status: "WORKING" })]
      .filter((user) => `${user.username} ${user.name}`.toLowerCase().includes(q));
    send(res, req, 200, page(users));
    return;
  }

  const filter = url.searchParams.get("filter");
  const rows = visibleLs(req).filter((l) => {
    const haystack = `${l.title} ${l.story} ${l.tags.join(" ")}`.toLowerCase();
    const matchesQuery = haystack.includes(q);
    const matchesFilter = !filter || l.category.toLowerCase() === filter;
    return matchesQuery && matchesFilter;
  });
  send(res, req, 200, page(rows.map((l) => toCard(l, req))));
}

function routeProfile(req, res, path) {
  const match = path.match(/^\/users\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;
  const username = decodeURIComponent(match[1]);
  const subroute = match[2];
  if (username !== "kartik") {
    fail(res, req, 404, "USER_NOT_FOUND", "This user does not exist.");
    return true;
  }

  if (!subroute) {
    send(res, req, 200, { ...db.user, viewer: { isFollowing: false, isSelf: isAuthed(req) } });
    return true;
  }

  if (subroute === "journey") {
    send(res, req, 200, page([{
      id: IDS.google,
      title: "Rejected after the final round at Google",
      type: "L",
      category: "INTERVIEWS",
      company: "Google",
      eventDate: "2025-11-10T00:00:00.000Z",
      date: "2025-11-10T00:00:00.000Z",
      isAnonymous: false,
      resolvedAt: null,
      reactionTotal: 3,
      commentCount: db.comments.get(IDS.google)?.length ?? 0,
    }]));
    return true;
  }

  if (subroute === "ls") {
    const type = new URL(`http://mock${path}`).searchParams.get("type");
    const rows = visibleLs(req).filter((l) => l.author?.username === username && (!type || l.type === type));
    send(res, req, 200, page(rows.map((l) => toCard(l, req))));
    return true;
  }

  if (subroute === "collections") {
    send(res, req, 200, page([...db.collections.values()].map((c) => toCollection(c, req))));
    return true;
  }

  if (subroute === "followers" || subroute === "following") {
    send(res, req, 200, page([summary({ id: IDS.other, username: "maya", name: "Maya Rao", status: "WORKING" })]));
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/v1/, "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    send(res, req, 200, { ok: true });
    return;
  }

  if (url.pathname === "/__reset" && req.method === "POST") {
    reset();
    send(res, req, 200, { ok: true });
    return;
  }

  if (!url.pathname.startsWith("/v1")) {
    fail(res, req, 404, "NOT_FOUND", "Route not found.");
    return;
  }

  if (path === "/auth/me" && req.method === "GET") {
    send(res, req, 200, {
      user: isAuthed(req) ? { ...db.user, viewer: { isFollowing: false, isSelf: true } } : null,
      needsOnboarding: false,
    });
    return;
  }

  if (path === "/auth/refresh" && req.method === "POST") {
    send(res, req, 200, { ok: true }, { "set-cookie": "mock_auth=1; Path=/; SameSite=Lax" });
    return;
  }

  if (path === "/meta/enums" && req.method === "GET") {
    send(res, req, 200, meta);
    return;
  }

  if (path === "/tags/popular" && req.method === "GET") {
    const q = String(url.searchParams.get("q") ?? "").toLowerCase();
    const tags = ["interviews", "google", "startup", "leadership"]
      .filter((tag) => tag.includes(q))
      .map((tag, index) => ({ tag, count: 10 - index }));
    send(res, req, 200, { tags });
    return;
  }

  if (path === "/feed" && req.method === "GET") {
    routeFeed(req, res, url, false);
    return;
  }

  if (path === "/feed/following" && req.method === "GET") {
    routeFeed(req, res, url, true);
    return;
  }

  if (path === "/search" && req.method === "GET") {
    routeSearch(req, res, url);
    return;
  }

  if (path === "/me/saved" && req.method === "GET") {
    if (!requireAuth(req, res)) return;
    send(res, req, 200, page([toCard(db.ls.get(IDS.google), req)]));
    return;
  }

  if (path === "/users/me" && req.method === "PATCH") {
    if (!requireAuth(req, res)) return;
    const body = await readBody(req);
    db.user = { ...db.user, ...body };
    send(res, req, 200, { ...db.user, viewer: { isFollowing: false, isSelf: true } });
    return;
  }

  if (path.match(/^\/users\/[^/]+\/follow$/)) {
    if (!requireAuth(req, res)) return;
    send(res, req, 200, {
      isFollowing: req.method === "PUT",
      counts: { followers: req.method === "PUT" ? 13 : 12, following: 4 },
    });
    return;
  }

  if (routeProfile(req, res, path)) return;

  if (path === "/ls" && req.method === "POST") {
    if (!requireAuth(req, res)) return;
    const body = await readBody(req);
    if (!body.title || !body.story) {
      fail(res, req, 400, "VALIDATION_ERROR", "Some fields need attention.", [
        { field: !body.title ? "title" : "story", code: "required", message: "Required" },
      ]);
      return;
    }
    const created = {
      id: IDS.created,
      title: body.title,
      story: body.story,
      type: body.type ?? "L",
      category: body.category ?? null,
      company: body.company ?? null,
      tags: body.tags ?? [],
      eventDate: body.eventDate ? new Date(body.eventDate).toISOString() : null,
      visibility: body.visibility ?? "PUBLIC",
      isAnonymous: Boolean(body.isAnonymous),
      resolvedAt: null,
      author: summary(),
      reactions: reactionSummary({ total: 0, beenThere: 0, helpful: 0, saved: 0 }),
      viewerReactions: [],
      createdAt: now,
      collections: [],
    };
    db.ls.set(created.id, created);
    send(res, req, 200, toDetail(created, req));
    return;
  }

  const lMatch = path.match(/^\/ls\/([^/]+)$/);
  if (lMatch) {
    const l = db.ls.get(decodeURIComponent(lMatch[1]));
    if (!l) {
      fail(res, req, 404, "L_NOT_FOUND", "This L does not exist or is not visible to you.");
      return;
    }
    if (req.method === "GET") {
      send(res, req, 200, toDetail(l, req));
      return;
    }
    if (req.method === "PATCH") {
      if (!requireAuth(req, res)) return;
      Object.assign(l, await readBody(req));
      if (l.resolvedAt instanceof Date) l.resolvedAt = l.resolvedAt.toISOString();
      send(res, req, 200, toDetail(l, req));
      return;
    }
    if (req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      db.ls.delete(l.id);
      send(res, req, 200, { ok: true });
      return;
    }
  }

  const commentsMatch = path.match(/^\/ls\/([^/]+)\/comments$/);
  if (commentsMatch) {
    const lId = decodeURIComponent(commentsMatch[1]);
    if (!db.ls.has(lId)) {
      fail(res, req, 404, "L_NOT_FOUND", "This L does not exist or is not visible to you.");
      return;
    }
    if (req.method === "GET") {
      send(res, req, 200, page(db.comments.get(lId) ?? []));
      return;
    }
    if (req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = await readBody(req);
      const comment = {
        id: `${IDS.comment}${(db.comments.get(lId)?.length ?? 0) + 1}`,
        body: body.body,
        author: summary(),
        lId,
        parentId: null,
        replyCount: 0,
        viewer: { canDelete: true },
        createdAt: now,
      };
      const comments = db.comments.get(lId) ?? [];
      comments.push(comment);
      db.comments.set(lId, comments);
      send(res, req, 200, comment);
      return;
    }
  }

  const reactionMatch = path.match(/^\/ls\/([^/]+)\/reactions\/([^/]+)$/);
  if (reactionMatch) {
    if (!requireAuth(req, res)) return;
    const l = db.ls.get(decodeURIComponent(reactionMatch[1]));
    const type = decodeURIComponent(reactionMatch[2]);
    if (!l) {
      fail(res, req, 404, "L_NOT_FOUND", "This L does not exist or is not visible to you.");
      return;
    }
    const key = {
      BEEN_THERE: "beenThere",
      HELPFUL: "helpful",
      RESPECT: "respect",
      PAIN: "pain",
      SAVED: "saved",
    }[type];
    if (!key) {
      fail(res, req, 400, "VALIDATION_ERROR", "Some fields need attention.");
      return;
    }
    const has = l.viewerReactions.includes(type);
    if (req.method === "PUT" && !has) {
      l.viewerReactions.push(type);
      l.reactions[key] += 1;
      if (type !== "SAVED") l.reactions.total += 1;
    }
    if (req.method === "DELETE" && has) {
      l.viewerReactions = l.viewerReactions.filter((value) => value !== type);
      l.reactions[key] = Math.max(0, l.reactions[key] - 1);
      if (type !== "SAVED") l.reactions.total = Math.max(0, l.reactions.total - 1);
    }
    send(res, req, 200, {
      reactions: l.reactions,
      viewer: { reactions: l.viewerReactions },
    });
    return;
  }

  const collectionMatch = path.match(/^\/collections\/([^/]+)$/);
  if (collectionMatch) {
    const collection = db.collections.get(decodeURIComponent(collectionMatch[1]));
    if (!collection) {
      fail(res, req, 404, "COLLECTION_NOT_FOUND", "This collection does not exist.");
      return;
    }
    if (req.method === "GET") {
      send(res, req, 200, toCollectionDetail(collection, req));
      return;
    }
    if (req.method === "PATCH") {
      if (!requireAuth(req, res)) return;
      const body = await readBody(req);
      collection.title = body.title || collection.title;
      send(res, req, 200, toCollection(collection, req));
      return;
    }
    if (req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      db.collections.delete(collection.id);
      send(res, req, 200, { ok: true });
      return;
    }
  }

  const collectionLMatch = path.match(/^\/collections\/([^/]+)\/ls\/([^/]+)$/);
  if (collectionLMatch) {
    if (!requireAuth(req, res)) return;
    const collection = db.collections.get(decodeURIComponent(collectionLMatch[1]));
    const lId = decodeURIComponent(collectionLMatch[2]);
    if (!collection) {
      fail(res, req, 404, "COLLECTION_NOT_FOUND", "This collection does not exist.");
      return;
    }
    if (req.method === "PUT" && !collection.lIds.includes(lId)) collection.lIds.push(lId);
    if (req.method === "DELETE") collection.lIds = collection.lIds.filter((id) => id !== lId);
    send(res, req, 200, toCollectionDetail(collection, req));
    return;
  }

  if (path === "/collections" && req.method === "POST") {
    if (!requireAuth(req, res)) return;
    const body = await readBody(req);
    const id = `${IDS.collection}${db.collections.size + 1}`;
    const collection = {
      id,
      title: body.title,
      slug: String(body.title).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      owner: summary(),
      lIds: [],
      createdAt: now,
    };
    db.collections.set(id, collection);
    send(res, req, 200, toCollection(collection, req));
    return;
  }

  if (path === "/notifications/unread-count" && req.method === "GET") {
    if (!requireAuth(req, res)) return;
    send(res, req, 200, { count: db.notifications.filter((n) => n.readAt === null).length });
    return;
  }

  if (path === "/notifications" && req.method === "GET") {
    if (!requireAuth(req, res)) return;
    send(res, req, 200, page(db.notifications));
    return;
  }

  if (path === "/notifications/read-all" && req.method === "POST") {
    if (!requireAuth(req, res)) return;
    db.notifications = db.notifications.map((n) => ({ ...n, readAt: now }));
    send(res, req, 200, { ok: true });
    return;
  }

  const notificationReadMatch = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (notificationReadMatch && req.method === "POST") {
    if (!requireAuth(req, res)) return;
    const id = decodeURIComponent(notificationReadMatch[1]);
    db.notifications = db.notifications.map((n) => n.id === id ? { ...n, readAt: now } : n);
    send(res, req, 200, { ok: true });
    return;
  }

  if (path === "/uploads/avatar" && req.method === "POST") {
    if (!requireAuth(req, res)) return;
    send(res, req, 200, {
      uploadUrl: "http://127.0.0.1:4100/upload/avatar",
      publicUrl: "https://cdn.example.test/avatars/kartik/avatar.png",
      headers: { "Content-Type": "image/png" },
      expiresIn: 300,
    });
    return;
  }

  fail(res, req, 404, "NOT_FOUND", `No mock route for ${req.method} ${path}.`);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mock LinkedOut API listening on http://127.0.0.1:${port}\n`);
});
