/**
 * In-memory mock backend. Fixtures + derivers + a tiny mutable store so
 * reactions/follows/comments persist within a single runtime (nice for demos).
 * Only used when NEXT_PUBLIC_USE_MOCKS=1; excluded from prod bundles.
 *
 * Ids are readable rather than real ULIDs — the frontend treats every id as an
 * opaque string, so this only affects how the URLs look in the demo.
 */
import type {
  Collection,
  CollectionDetail,
  Comment,
  JourneyNode,
  JourneyStatus,
  LCard,
  LCategory,
  LDetail,
  LType,
  MetaEnumsResponse,
  Notification,
  ReactionsSummary,
  ReactionType,
  UserProfile,
  UserSummary,
  Visibility,
  CreateLInput,
  UpdateLInput,
  UpdateUserInput,
} from "@linkedout/contracts";
import { truncate } from "@/lib/format";

// ── Meta / display metadata (contract §4.12) ────────────────────────────────
export const META: MetaEnumsResponse = {
  reactionType: [
    { value: "BEEN_THERE", label: "Been There", emoji: "💔" },
    { value: "HELPFUL", label: "Helpful", emoji: "💡" },
    { value: "RESPECT", label: "Respect", emoji: "🔥" },
    { value: "PAIN", label: "Pain", emoji: "😂" },
    { value: "SAVED", label: "Saved", emoji: "📌" },
  ],
  journeyStatus: [
    { value: "INTERVIEWING", label: "Interviewing", dot: "🟡" },
    { value: "BUILDING", label: "Building", dot: "🔵" },
    { value: "WORKING", label: "Working", dot: "🟢" },
    { value: "STARTING_UP", label: "Starting Up", dot: "🟣" },
    { value: "RECOVERING", label: "Recovering", dot: "🔴" },
    { value: "TAKING_A_BREAK", label: "Taking a Break", dot: "⚫" },
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

// ── Users ───────────────────────────────────────────────────────────────────
interface UserRec {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  status: JourneyStatus | null;
  followers: number;
  following: number;
  reputation: UserProfile["reputation"];
}

/** The signed-in viewer in mock mode. */
export const ME_USERNAME = "kartik";

const users: UserRec[] = [
  {
    id: "usr_kartik",
    username: "kartik",
    name: "Kartik Gupta",
    bio: "Building in public. Surviving my Ls, one story at a time.",
    status: "BUILDING",
    followers: 320,
    following: 210,
    reputation: { storiesShared: 12, lessonsShared: 30, buildersHelped: 184, lsShared: 47, collectionsCreated: 5 },
  },
  {
    id: "usr_anaya",
    username: "anaya",
    name: "Anaya Rao",
    bio: "SWE. Currently interviewing and journaling every round.",
    status: "INTERVIEWING",
    followers: 540,
    following: 130,
    reputation: { storiesShared: 8, lessonsShared: 15, buildersHelped: 260, lsShared: 22, collectionsCreated: 2 },
  },
  {
    id: "usr_devon",
    username: "devon",
    name: "Devon Miller",
    bio: "Laid off in the spring. Rebuilding, slower and kinder this time.",
    status: "RECOVERING",
    followers: 190,
    following: 220,
    reputation: { storiesShared: 5, lessonsShared: 9, buildersHelped: 95, lsShared: 14, collectionsCreated: 1 },
  },
  {
    id: "usr_priya",
    username: "priya",
    name: "Priya Nair",
    bio: "Infra engineer. I break prod so you don't have to.",
    status: "WORKING",
    followers: 880,
    following: 140,
    reputation: { storiesShared: 11, lessonsShared: 41, buildersHelped: 512, lsShared: 33, collectionsCreated: 3 },
  },
  {
    id: "usr_sam",
    username: "sam",
    name: "Sam Okafor",
    bio: "Second-time founder. First one taught me everything.",
    status: "STARTING_UP",
    followers: 1240,
    following: 310,
    reputation: { storiesShared: 19, lessonsShared: 52, buildersHelped: 730, lsShared: 61, collectionsCreated: 6 },
  },
  {
    id: "usr_lin",
    username: "lin",
    name: "Lin Wei",
    bio: "Left FAANG to make something small. Taking a breath first.",
    status: "TAKING_A_BREAK",
    followers: 430,
    following: 88,
    reputation: { storiesShared: 6, lessonsShared: 12, buildersHelped: 143, lsShared: 18, collectionsCreated: 2 },
  },
  {
    id: "usr_marco",
    username: "marco",
    name: "Marco Rossi",
    bio: "Self-taught. 150 rejections in, still shipping.",
    status: "WORKING",
    followers: 260,
    following: 175,
    reputation: { storiesShared: 4, lessonsShared: 20, buildersHelped: 110, lsShared: 25, collectionsCreated: 1 },
  },
  {
    id: "usr_jules",
    username: "jules",
    name: "Jules Benali",
    bio: "PM. Collecting plot twists and the lessons underneath them.",
    status: "BUILDING",
    followers: 610,
    following: 240,
    reputation: { storiesShared: 9, lessonsShared: 27, buildersHelped: 205, lsShared: 29, collectionsCreated: 4 },
  },
];

/** Who the viewer follows — drives /feed/following and follow state. */
const myFollowing = new Set<string>(["anaya", "devon", "sam", "priya"]);

// ── Ls ───────────────────────────────────────────────────────────────────────
interface CountShape {
  beenThere: number;
  helpful: number;
  respect: number;
  pain: number;
  saved: number;
}

interface LRec {
  id: string;
  authorId: string;
  title: string;
  story: string;
  lessonLearned: string | null;
  type: LType;
  category: LCategory | null;
  company: string | null;
  tags: string[];
  eventDate: string | null;
  visibility: Visibility;
  isAnonymous: boolean;
  resolvedAt: string | null;
  counts: CountShape;
  commentCount: number;
  createdAt: string;
  /** reactions the viewer (kartik) has applied. */
  viewerReactions: ReactionType[];
}

const ls: LRec[] = [
  {
    id: "l_google_final",
    authorId: "usr_anaya",
    title: "Rejected after the final round at Google",
    story:
      "Four rounds in. Strong signals from every interviewer, a warm debrief, and a recruiter who said 'this looks great.' Then three weeks of silence, and a form rejection at 9pm on a Friday. No feedback, no reason. I refreshed my email for days like it owed me something. What finally helped was realizing the process was never a referendum on whether I'm a good engineer — it's a noisy sample of one bad afternoon in a windowless room.",
    lessonLearned: "Optimize for signal, not for hope. A 'great' from a recruiter is weather, not climate.",
    type: "STORY",
    category: "INTERVIEWS",
    company: "Google",
    tags: ["interview", "faang", "rejection"],
    eventDate: "2026-05-10",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 34, helpful: 18, respect: 12, pain: 3, saved: 9 },
    commentCount: 7,
    createdAt: "2026-07-06T09:00:00.000Z",
    viewerReactions: ["BEEN_THERE", "SAVED"],
  },
  {
    id: "l_startup_shutdown",
    authorId: "usr_sam",
    title: "We shut down the startup after three years",
    story:
      "We had users. We had press. We did not have a business. I signed the wind-down paperwork on a Tuesday and then went and bought groceries like nothing had happened, because the milk doesn't care about your cap table. Telling the team was the hardest hour of my life. Telling myself it wasn't wasted took a lot longer.",
    lessonLearned: "Revenue is oxygen. Love the problem, but respect the P&L earlier than feels comfortable.",
    type: "SCAR",
    category: "STARTUPS",
    company: null,
    tags: ["startup", "failure", "founder"],
    eventDate: "2026-03-01",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 51, helpful: 40, respect: 88, pain: 6, saved: 44 },
    commentCount: 23,
    createdAt: "2026-07-05T15:30:00.000Z",
    viewerReactions: ["RESPECT"],
  },
  {
    id: "l_vesting_cliff",
    authorId: "usr_devon",
    title: "Laid off two weeks before my vesting cliff",
    story:
      "One-year cliff on the 14th. Layoff on the 1st. The math was not subtle, and neither was how it felt. HR read the script; I nodded at the right pauses. I'm not angry anymore, mostly. But I keep the calendar invite for that cliff date as a small, petty monument.",
    lessonLearned: "Equity you can't afford to walk away from is leverage someone else is holding.",
    type: "PLOT_TWIST",
    category: "LAYOFFS",
    company: null,
    tags: ["layoff", "equity"],
    eventDate: "2026-04-01",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 72, helpful: 21, respect: 30, pain: 14, saved: 12 },
    commentCount: 18,
    createdAt: "2026-07-05T08:10:00.000Z",
    viewerReactions: [],
  },
  {
    id: "l_prod_outage",
    authorId: "usr_priya",
    title: "I took down prod for six hours in my second week",
    story:
      "A migration I 'was sure about' held a lock on the users table during peak traffic. Dashboards went red in a way I'd only seen in postmortems. My skip-level got paged. I typed `rollback` with hands that did not feel like mine. Nobody yelled. My tech lead sat with me and we wrote the timeline together, and somewhere in hour four I stopped shaking and started learning.",
    lessonLearned: "Blameless is a practice, not a slogan. Also: never run a long migration at 5pm on a Thursday.",
    type: "STORY",
    category: "PRODUCTION",
    company: "Swiggy",
    tags: ["incident", "postmortem", "oncall"],
    eventDate: "2026-02-19",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 96, helpful: 61, respect: 44, pain: 22, saved: 55 },
    commentCount: 31,
    createdAt: "2026-07-04T19:45:00.000Z",
    viewerReactions: ["HELPFUL", "BEEN_THERE"],
  },
  {
    id: "l_150_rejections",
    authorId: "usr_marco",
    title: "150 rejections before my first yes",
    story:
      "I kept a spreadsheet. Every 'we've decided to move forward with other candidates,' every ghost, every take-home that went into a void. Row 150 was a Wednesday. Row 151 was an offer. The spreadsheet didn't make the nos hurt less, but on the bad days it was proof I was still in the arena.",
    lessonLearned: "Volume is a strategy when you're unknown. Track it so the nos become data instead of verdicts.",
    type: "CHECKPOINT",
    category: "CAREER",
    company: null,
    tags: ["jobsearch", "selftaught", "persistence"],
    eventDate: "2026-01-22",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 64, helpful: 33, respect: 120, pain: 4, saved: 40 },
    commentCount: 15,
    createdAt: "2026-07-04T11:00:00.000Z",
    viewerReactions: ["RESPECT", "SAVED"],
  },
  {
    id: "l_burnout_anon",
    authorId: "usr_lin",
    title: "I burned out and told no one for a year",
    story:
      "From the outside it was a great year — promo, launches, a title I'd wanted. Inside I was running on fumes and calling it discipline. I smiled in standups and cried in parking lots. Posting this anonymously because I'm still not ready to attach my name, but I needed to say it somewhere that gets it.",
    lessonLearned: "Hiding the cost doesn't lower it. Say it out loud to one person sooner than I did.",
    type: "STORY",
    category: "CAREER",
    company: null,
    tags: ["burnout", "mentalhealth"],
    eventDate: "2026-06-01",
    visibility: "PUBLIC",
    isAnonymous: true,
    resolvedAt: null,
    counts: { beenThere: 210, helpful: 44, respect: 61, pain: 8, saved: 130 },
    commentCount: 54,
    createdAt: "2026-07-03T22:15:00.000Z",
    viewerReactions: ["BEEN_THERE"],
  },
  {
    id: "l_ghosted_offer",
    authorId: "usr_jules",
    title: "Got ghosted after a verbal offer",
    story:
      "Verbal offer on the phone. 'Paperwork by Monday.' I told my current manager I was leaving. Monday came with nothing. So did Tuesday. The recruiter stopped replying, the role vanished from their careers page, and I was left explaining to my boss why I was suddenly, awkwardly, staying.",
    lessonLearned: "A verbal offer is a vibe, not a contract. Don't resign until it's signed.",
    type: "L",
    category: "INTERVIEWS",
    company: null,
    tags: ["offer", "ghosted", "interview"],
    eventDate: "2026-05-28",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 47, helpful: 29, respect: 9, pain: 31, saved: 14 },
    commentCount: 12,
    createdAt: "2026-07-03T13:20:00.000Z",
    viewerReactions: [],
  },
  {
    id: "l_learning_rust",
    authorId: "usr_kartik",
    title: "Learning Rust and it is humbling me daily",
    story:
      "I've shipped production systems for years and the borrow checker still makes me feel like it's my first week of programming. Every fight with lifetimes ends with me admitting the compiler was right and I was sentimental about a reference. It's the most productive kind of humbling.",
    lessonLearned: null,
    type: "BATTLE",
    category: "LEARNING",
    company: null,
    tags: ["rust", "learning"],
    eventDate: "2026-06-15",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 28, helpful: 12, respect: 19, pain: 7, saved: 6 },
    commentCount: 9,
    createdAt: "2026-07-02T17:05:00.000Z",
    viewerReactions: [],
  },
  {
    id: "l_interviewing_again",
    authorId: "usr_devon",
    title: "Interviewing again after the layoff",
    story:
      "Rewriting the resume, relearning to talk about myself in the present tense. The hardest part isn't the LeetCode — it's answering 'so what happened at your last role?' without my voice doing the thing. Getting better at it. One warm intro at a time.",
    lessonLearned: null,
    type: "BATTLE",
    category: "INTERVIEWS",
    company: null,
    tags: ["jobsearch", "layoff", "interview"],
    eventDate: "2026-06-20",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 55, helpful: 18, respect: 24, pain: 3, saved: 10 },
    commentCount: 8,
    createdAt: "2026-07-02T10:40:00.000Z",
    viewerReactions: ["BEEN_THERE"],
  },
  {
    id: "l_ship_before_perfect",
    authorId: "usr_kartik",
    title: "Ship before perfect",
    story:
      "It took me three failed side projects to internalize this. The one I actually shipped — ugly, half-finished, embarrassing — is the only one that ever got a user. The perfect ones are still in a folder called `ideas`.",
    lessonLearned: "Done and out beats perfect and hidden, every single time.",
    type: "LESSON",
    category: "LEARNING",
    company: null,
    tags: ["shipping", "sideprojects"],
    eventDate: "2026-04-18",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 20, helpful: 71, respect: 33, pain: 1, saved: 48 },
    commentCount: 11,
    createdAt: "2026-07-01T14:00:00.000Z",
    viewerReactions: ["HELPFUL"],
  },
  {
    id: "l_biggest_customer",
    authorId: "usr_sam",
    title: "Our biggest customer churned in a single email",
    story:
      "40% of revenue, gone in a two-line message on a Sunday: 'going a different direction, thanks for everything.' No call, no chance to save it. I read it about forty times looking for a door that wasn't there. Monday we cut burn and got very honest, very fast.",
    lessonLearned: "Concentration is a hidden liability. If one logo can end you, you have one customer, not a business.",
    type: "SCAR",
    category: "STARTUPS",
    company: null,
    tags: ["churn", "revenue", "startup"],
    eventDate: "2026-02-08",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 38, helpful: 52, respect: 41, pain: 9, saved: 37 },
    commentCount: 14,
    createdAt: "2026-06-30T09:30:00.000Z",
    viewerReactions: [],
  },
  {
    id: "l_first_customer",
    authorId: "usr_sam",
    title: "First paying customer after eight months",
    story:
      "Eight months of 'that's interesting' and 'circle back next quarter.' Then a real invoice, paid, from someone I'd never met, who found us through a comment I almost didn't post. I screenshotted the Stripe notification. I still have it.",
    lessonLearned: "Distribution compounds quietly. The post you almost skip is sometimes the one that pays.",
    type: "WIN",
    category: "STARTUPS",
    company: null,
    tags: ["revenue", "milestone", "startup"],
    eventDate: "2026-06-11",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 6, helpful: 22, respect: 96, pain: 0, saved: 18 },
    commentCount: 10,
    createdAt: "2026-06-29T16:20:00.000Z",
    viewerReactions: ["RESPECT"],
  },
  {
    id: "l_quit_faang",
    authorId: "usr_lin",
    title: "Quit FAANG to build something small",
    story:
      "I traded a comp number I'm too shy to type for a spare bedroom and an empty repo. Everyone had an opinion. Some days the opinions live rent-free in my head. But I haven't dreaded a Monday in months, and that turns out to be worth an alarming amount of money.",
    lessonLearned: null,
    type: "PLOT_TWIST",
    category: "CAREER",
    company: null,
    tags: ["career", "faang", "founder"],
    eventDate: "2026-05-02",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: null,
    counts: { beenThere: 15, helpful: 26, respect: 78, pain: 2, saved: 33 },
    commentCount: 19,
    createdAt: "2026-06-28T12:00:00.000Z",
    viewerReactions: [],
  },
  {
    id: "l_yc_third_try",
    authorId: "usr_kartik",
    title: "Failed YC twice, applied a third time",
    story:
      "Two rejections, two years, two versions of me convinced this time was different. The third application was calmer — less pitch, more truth about what we'd actually learned. We didn't get in that time either, but writing it honestly changed how I talk about the company. That was the real yes.",
    lessonLearned: "The application is a mirror. Answer it honestly and you learn more than any batch would teach.",
    type: "BATTLE",
    category: "STARTUPS",
    company: "Y Combinator",
    tags: ["yc", "startup", "fundraising"],
    eventDate: "2026-03-20",
    visibility: "PUBLIC",
    isAnonymous: false,
    resolvedAt: "2026-04-10T00:00:00.000Z",
    counts: { beenThere: 30, helpful: 24, respect: 52, pain: 5, saved: 21 },
    commentCount: 13,
    createdAt: "2026-06-27T18:30:00.000Z",
    viewerReactions: [],
  },
];

// ── Collections ──────────────────────────────────────────────────────────────
interface CollectionRec {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  lIds: string[];
  createdAt: string;
}
const collections: CollectionRec[] = [
  {
    id: "col_startup_journey",
    ownerId: "usr_kartik",
    title: "My Startup Journey",
    slug: "my-startup-journey",
    lIds: ["l_yc_third_try", "l_ship_before_perfect"],
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "col_learning_rust",
    ownerId: "usr_kartik",
    title: "Learning Rust",
    slug: "learning-rust",
    lIds: ["l_learning_rust"],
    createdAt: "2026-06-16T00:00:00.000Z",
  },
];

// ── Comments ─────────────────────────────────────────────────────────────────
interface CommentRec {
  id: string;
  lId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  createdAt: string;
}
const comments: CommentRec[] = [
  {
    id: "cmt_1",
    lId: "l_google_final",
    authorId: "usr_devon",
    body: "This exact thing happened to me at a different company. The Friday-night form email is a special kind of cruel. You'll land somewhere better.",
    parentId: null,
    createdAt: "2026-07-06T10:00:00.000Z",
  },
  {
    id: "cmt_2",
    lId: "l_google_final",
    authorId: "usr_marco",
    body: "Signal not hope — saving that. Went through 150 rounds of this before my yes.",
    parentId: null,
    createdAt: "2026-07-06T10:30:00.000Z",
  },
  {
    id: "cmt_3",
    lId: "l_google_final",
    authorId: "usr_anaya",
    body: "Thank you both. Genuinely needed to read this today.",
    parentId: "cmt_1",
    createdAt: "2026-07-06T11:00:00.000Z",
  },
  {
    id: "cmt_4",
    lId: "l_prod_outage",
    authorId: "usr_kartik",
    body: "The 'hands that did not feel like mine' line. Been exactly there. Blameless culture is everything.",
    parentId: null,
    createdAt: "2026-07-04T20:30:00.000Z",
  },
];

// ── Notifications (for the viewer) ───────────────────────────────────────────
const notifications: Notification[] = [
  {
    id: "ntf_1",
    type: "RELATED",
    actor: null,
    target: { lId: "l_learning_rust", title: "Learning Rust and it is humbling me daily" },
    message: "28 builders related to your battle with Rust.",
    readAt: null,
    createdAt: "2026-07-06T12:00:00.000Z",
  },
  {
    id: "ntf_2",
    type: "HELPED",
    actor: null,
    target: { lId: "l_ship_before_perfect", title: "Ship before perfect" },
    message: "Your lesson helped 71 people this week.",
    readAt: null,
    createdAt: "2026-07-05T09:00:00.000Z",
  },
  {
    id: "ntf_3",
    type: "NEW_FOLLOWER",
    actor: toSummaryById("usr_priya"),
    target: null,
    message: "Priya Nair started following your journey.",
    readAt: null,
    createdAt: "2026-07-04T18:00:00.000Z",
  },
  {
    id: "ntf_4",
    type: "COMMENT",
    actor: toSummaryById("usr_marco"),
    target: { lId: "l_yc_third_try", title: "Failed YC twice, applied a third time" },
    message: "Marco Rossi commented on your L.",
    readAt: "2026-07-03T20:00:00.000Z",
    createdAt: "2026-07-03T19:00:00.000Z",
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────────
export function userByUsername(username: string): UserRec | undefined {
  return users.find((u) => u.username === username);
}
function userById(id: string): UserRec | undefined {
  return users.find((u) => u.id === id);
}
function meId(): string {
  return userByUsername(ME_USERNAME)!.id;
}

// ── Derivers ─────────────────────────────────────────────────────────────────
function toSummary(rec: UserRec): UserSummary {
  return { id: rec.id, username: rec.username, name: rec.name, image: null, status: rec.status };
}
function toSummaryById(id: string): UserSummary | null {
  const rec = userById(id);
  return rec ? toSummary(rec) : null;
}

function reactionSummary(c: CountShape): ReactionsSummary {
  return {
    total: c.beenThere + c.helpful + c.respect + c.pain,
    beenThere: c.beenThere,
    helpful: c.helpful,
    respect: c.respect,
    pain: c.pain,
    saved: c.saved,
  };
}

export function toProfile(rec: UserRec): UserProfile {
  return {
    id: rec.id,
    username: rec.username,
    name: rec.name,
    image: null,
    bio: rec.bio,
    status: rec.status,
    reputation: rec.reputation,
    counts: { followers: rec.followers, following: rec.following },
    viewer: {
      isFollowing: rec.username !== ME_USERNAME && myFollowing.has(rec.username),
      isSelf: rec.username === ME_USERNAME,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function lCardFromRec(l: LRec): LCard {
  const authorRec = userById(l.authorId);
  const author = l.isAnonymous || !authorRec ? null : toSummary(authorRec);
  return {
    id: l.id,
    title: l.title,
    storyPreview: truncate(l.story, 280),
    lessonLearned: l.lessonLearned,
    type: l.type,
    category: l.category,
    company: l.company,
    tags: l.tags,
    eventDate: l.eventDate ? new Date(l.eventDate).toISOString() : null,
    visibility: l.visibility,
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt,
    author,
    reactions: reactionSummary(l.counts),
    commentCount: l.commentCount,
    viewer: { reactions: [...l.viewerReactions], canEdit: l.authorId === meId() },
    createdAt: l.createdAt,
  };
}

function lDetailFromRec(l: LRec): LDetail {
  const card = lCardFromRec(l);
  const inCollections = collections
    .filter((c) => c.lIds.includes(l.id))
    .map((c) => ({ id: c.id, title: c.title, slug: c.slug }));
  // `card.storyPreview` is not part of LDetail; spreads are exempt from
  // excess-property checks, and the full `story` takes its place.
  return { ...card, story: l.story, collections: inCollections };
}

function journeyNodeFromRec(l: LRec): JourneyNode {
  const eventIso = l.eventDate ? new Date(l.eventDate).toISOString() : null;
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    category: l.category,
    company: l.company,
    eventDate: eventIso,
    date: eventIso ?? l.createdAt,
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt,
    reactionTotal: reactionSummary(l.counts).total,
    commentCount: l.commentCount,
  };
}

function commentFromRec(c: CommentRec): Comment {
  const author = toSummary(userById(c.authorId)!);
  return {
    id: c.id,
    body: c.body,
    author,
    lId: c.lId,
    parentId: c.parentId,
    replyCount: comments.filter((x) => x.parentId === c.id).length,
    viewer: { canDelete: c.authorId === meId() },
    createdAt: c.createdAt,
  };
}

function collectionFromRec(c: CollectionRec): Collection {
  const owner = toSummaryById(c.ownerId)!;
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    owner,
    lCount: c.lIds.length,
    viewer: { canEdit: c.ownerId === meId() },
    createdAt: c.createdAt,
  };
}

// ── Queries (used by the router) ─────────────────────────────────────────────
export type SortKey = "latest" | "trending" | "helpful";

function sortLs(list: LRec[], sort: SortKey): LRec[] {
  const arr = [...list];
  if (sort === "trending") {
    arr.sort((a, b) => reactionSummary(b.counts).total - reactionSummary(a.counts).total);
  } else if (sort === "helpful") {
    arr.sort((a, b) => b.counts.helpful - a.counts.helpful);
  } else {
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return arr;
}

export function feedList(opts: {
  scope: "global" | "following";
  sort: SortKey;
  filter: string | null;
}): LCard[] {
  let list = ls.filter((l) => l.visibility === "PUBLIC");
  if (opts.scope === "following") {
    list = list.filter((l) => {
      const author = userById(l.authorId);
      return author ? myFollowing.has(author.username) : false;
    });
  }
  if (opts.filter) {
    const cat = opts.filter.toUpperCase();
    list = list.filter((l) => l.category === cat);
  }
  return sortLs(list, opts.sort).map(lCardFromRec);
}

export function lDetail(id: string): LDetail | undefined {
  const rec = ls.find((l) => l.id === id);
  return rec ? lDetailFromRec(rec) : undefined;
}

export function userLs(username: string, type: LType | null): LCard[] | undefined {
  const user = userByUsername(username);
  if (!user) return undefined;
  let list = ls.filter((l) => l.authorId === user.id && l.visibility === "PUBLIC");
  if (type) list = list.filter((l) => l.type === type);
  return sortLs(list, "latest").map(lCardFromRec);
}

export function userJourney(username: string): JourneyNode[] | undefined {
  const user = userByUsername(username);
  if (!user) return undefined;
  return ls
    .filter((l) => l.authorId === user.id && l.visibility === "PUBLIC")
    .map(journeyNodeFromRec)
    .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest
}

export function userCollections(username: string): Collection[] | undefined {
  const user = userByUsername(username);
  if (!user) return undefined;
  return collections.filter((c) => c.ownerId === user.id).map(collectionFromRec);
}

export function followerSummaries(username: string): UserSummary[] | undefined {
  const user = userByUsername(username);
  if (!user) return undefined;
  // Mock: everyone who lists this user in their following. We only track the
  // viewer's following, so approximate with a stable sample.
  return users.filter((u) => u.username !== username).slice(0, 6).map(toSummary);
}

export function followingSummaries(username: string): UserSummary[] | undefined {
  const user = userByUsername(username);
  if (!user) return undefined;
  if (username === ME_USERNAME) {
    return [...myFollowing].map((u) => userByUsername(u)).filter(Boolean).map((u) => toSummary(u!));
  }
  return users.filter((u) => u.username !== username).slice(0, 5).map(toSummary);
}

export function savedLs(): LCard[] {
  return ls.filter((l) => l.viewerReactions.includes("SAVED")).map(lCardFromRec);
}

export function commentsFor(lId: string, parentId: string | null): Comment[] {
  return comments
    .filter((c) => c.lId === lId && c.parentId === parentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(commentFromRec);
}

export function repliesFor(commentId: string): Comment[] {
  return comments
    .filter((c) => c.parentId === commentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(commentFromRec);
}

export function collectionDetail(id: string): CollectionDetail | undefined {
  const rec = collections.find((c) => c.id === id);
  if (!rec) return undefined;
  const items = rec.lIds
    .map((lId) => ls.find((l) => l.id === lId))
    .filter(Boolean)
    .map((l) => lCardFromRec(l!));
  return { ...collectionFromRec(rec), ls: items };
}

export function meProfile(): UserProfile {
  return toProfile(userByUsername(ME_USERNAME)!);
}

export function searchLsQuery(q: string, filter: string | null): LCard[] {
  const needle = q.toLowerCase();
  let list = ls.filter((l) => l.visibility === "PUBLIC");
  if (filter) list = list.filter((l) => l.category === filter.toUpperCase());
  const scored = list
    .map((l) => {
      const titleHit = l.title.toLowerCase().includes(needle);
      const bodyHit =
        l.story.toLowerCase().includes(needle) ||
        l.tags.some((t) => t.toLowerCase().includes(needle));
      return { l, score: titleHit ? 2 : bodyHit ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => lCardFromRec(x.l));
}

export function searchUsersQuery(q: string): UserSummary[] {
  const needle = q.toLowerCase();
  return users
    .filter((u) => (u.name ?? "").toLowerCase().includes(needle) || u.username.includes(needle))
    .map(toSummary);
}

export function notificationList(): Notification[] {
  return [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function unreadCount(): number {
  return notifications.filter((n) => n.readAt === null).length;
}

// ── Mutations ────────────────────────────────────────────────────────────────
const RK: Record<ReactionType, keyof CountShape> = {
  BEEN_THERE: "beenThere",
  HELPFUL: "helpful",
  RESPECT: "respect",
  PAIN: "pain",
  SAVED: "saved",
};

export function react(id: string, type: ReactionType, on: boolean) {
  const rec = ls.find((l) => l.id === id);
  if (!rec) return undefined;
  const has = rec.viewerReactions.includes(type);
  if (on && !has) {
    rec.viewerReactions.push(type);
    rec.counts[RK[type]] += 1;
  } else if (!on && has) {
    rec.viewerReactions = rec.viewerReactions.filter((t) => t !== type);
    rec.counts[RK[type]] = Math.max(0, rec.counts[RK[type]] - 1);
  }
  return { reactions: reactionSummary(rec.counts), viewer: { reactions: [...rec.viewerReactions] } };
}

export function toggleFollow(username: string, on: boolean) {
  const user = userByUsername(username);
  if (!user) return undefined;
  const was = myFollowing.has(username);
  if (on && !was) {
    myFollowing.add(username);
    user.followers += 1;
  } else if (!on && was) {
    myFollowing.delete(username);
    user.followers = Math.max(0, user.followers - 1);
  }
  return { isFollowing: myFollowing.has(username), counts: { followers: user.followers, following: user.following } };
}

let commentSeq = 100;
export function addCommentRec(lId: string, parentId: string | null, body: string): Comment | undefined {
  const rec = ls.find((l) => l.id === lId);
  if (!rec) return undefined;
  const c: CommentRec = {
    id: `cmt_${++commentSeq}`,
    lId,
    authorId: meId(),
    body,
    parentId,
    createdAt: new Date().toISOString(),
  };
  comments.push(c);
  if (parentId === null) rec.commentCount += 1;
  return commentFromRec(c);
}

export function popularTags(prefix: string | null, limit: number) {
  const counts = new Map<string, number>();
  for (const l of ls) for (const t of l.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  let entries = [...counts.entries()];
  if (prefix) entries = entries.filter(([t]) => t.startsWith(prefix.toLowerCase()));
  entries.sort((a, b) => b[1] - a[1]);
  return { tags: entries.slice(0, limit).map(([tag, count]) => ({ tag, count })) };
}

// ── Extra mutations (used by the router for the non-feed features) ────────────
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection"
  );
}

let lSeq = 100;
export function createLRec(body: CreateLInput): LDetail {
  const me = userByUsername(ME_USERNAME)!;
  const rec: LRec = {
    id: `l_${++lSeq}`,
    authorId: me.id,
    title: body.title,
    story: body.story,
    lessonLearned: body.lessonLearned ?? null,
    type: body.type ?? "L",
    category: body.category ?? null,
    company: body.company ?? null,
    tags: body.tags ?? [],
    eventDate: body.eventDate ? new Date(body.eventDate).toISOString() : null,
    visibility: body.visibility ?? "PUBLIC",
    isAnonymous: body.isAnonymous ?? false,
    resolvedAt: null,
    counts: { beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
    commentCount: 0,
    createdAt: new Date().toISOString(),
    viewerReactions: [],
  };
  ls.unshift(rec);
  me.reputation.lsShared += 1;
  if (rec.type === "STORY") me.reputation.storiesShared += 1;
  if (rec.type === "LESSON") me.reputation.lessonsShared += 1;
  return lDetailFromRec(rec);
}

export function patchLRec(id: string, body: UpdateLInput): LDetail | undefined {
  const rec = ls.find((l) => l.id === id);
  if (!rec) return undefined;
  if (body.title !== undefined) rec.title = body.title;
  if (body.story !== undefined) rec.story = body.story;
  if (body.lessonLearned !== undefined) rec.lessonLearned = body.lessonLearned || null;
  if (body.type !== undefined) rec.type = body.type;
  if (body.category !== undefined) rec.category = body.category ?? null;
  if (body.company !== undefined) rec.company = body.company || null;
  if (body.tags !== undefined) rec.tags = body.tags;
  if (body.eventDate !== undefined) {
    rec.eventDate = body.eventDate ? new Date(body.eventDate).toISOString() : null;
  }
  if (body.visibility !== undefined) rec.visibility = body.visibility;
  if (body.isAnonymous !== undefined) rec.isAnonymous = body.isAnonymous;
  if (body.resolvedAt !== undefined) {
    rec.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt).toISOString() : null;
  }
  return lDetailFromRec(rec);
}

export function deleteLRec(id: string): boolean {
  const idx = ls.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  ls.splice(idx, 1);
  return true;
}

export function addReplyRec(parentId: string, body: string): Comment | undefined {
  const parent = comments.find((x) => x.id === parentId);
  if (!parent) return undefined;
  return addCommentRec(parent.lId, parentId, body);
}

export function deleteCommentRec(id: string): boolean {
  const target = comments.find((c) => c.id === id);
  if (!target) return false;
  const removeIds = new Set<string>([id, ...comments.filter((c) => c.parentId === id).map((c) => c.id)]);
  for (let i = comments.length - 1; i >= 0; i--) {
    if (removeIds.has(comments[i]!.id)) comments.splice(i, 1);
  }
  if (target.parentId === null) {
    const rec = ls.find((l) => l.id === target.lId);
    if (rec) rec.commentCount = Math.max(0, rec.commentCount - 1);
  }
  return true;
}

export function patchMeRec(body: UpdateUserInput): UserProfile {
  const me = userByUsername(ME_USERNAME)!;
  if (body.name !== undefined) me.name = body.name;
  if (body.bio !== undefined) me.bio = body.bio;
  if (body.status !== undefined) me.status = body.status ?? null;
  return toProfile(me);
}

export function markNotifRead(id: string): boolean {
  const n = notifications.find((x) => x.id === id);
  if (!n) return false;
  if (n.readAt === null) n.readAt = new Date().toISOString();
  return true;
}
export function markAllNotifsRead(): void {
  const now = new Date().toISOString();
  for (const n of notifications) if (n.readAt === null) n.readAt = now;
}

let colSeq = 100;
export function createCollectionRec(title: string): Collection {
  const me = userByUsername(ME_USERNAME)!;
  const rec: CollectionRec = {
    id: `col_${++colSeq}`,
    ownerId: me.id,
    title,
    slug: slugify(title),
    lIds: [],
    createdAt: new Date().toISOString(),
  };
  collections.push(rec);
  me.reputation.collectionsCreated += 1;
  return collectionFromRec(rec);
}
export function renameCollectionRec(id: string, title: string): Collection | undefined {
  const rec = collections.find((c) => c.id === id);
  if (!rec) return undefined;
  rec.title = title;
  rec.slug = slugify(title);
  return collectionFromRec(rec);
}
export function deleteCollectionRec(id: string): boolean {
  const idx = collections.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  collections.splice(idx, 1);
  return true;
}
export function addToCollectionRec(id: string, lId: string, position?: number): Collection | undefined {
  const rec = collections.find((c) => c.id === id);
  if (!rec) return undefined;
  if (!rec.lIds.includes(lId)) {
    if (position !== undefined && position >= 0 && position <= rec.lIds.length) {
      rec.lIds.splice(position, 0, lId);
    } else {
      rec.lIds.push(lId);
    }
  }
  return collectionFromRec(rec);
}
export function removeFromCollectionRec(id: string, lId: string): boolean {
  const rec = collections.find((c) => c.id === id);
  if (!rec) return false;
  const before = rec.lIds.length;
  rec.lIds = rec.lIds.filter((x) => x !== lId);
  return rec.lIds.length !== before;
}
