import type { MetaEnumsResponse } from "@linkedout/contracts";

/**
 * Canonical enum display metadata, mirroring contract.md §4.12. The app fetches
 * `GET /meta/enums` at boot; this is the resilient fallback if that request
 * fails, so labels/emoji never come back empty.
 */
export const DEFAULT_META: MetaEnumsResponse = {
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
