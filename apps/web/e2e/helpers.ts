import { createRequire } from "node:module";
import type { BrowserContext, Page } from "@playwright/test";

const backend = createRequire(import.meta.url)("./backend.cjs");

export const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? "3100";
export const API_PORT = process.env.E2E_API_PORT ?? "4010";
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_ORIGIN = `http://localhost:${API_PORT}`;

export interface SeededUser {
  id: string;
  username: string | null;
  name: string | null;
}

export interface SeededL {
  id: string;
  title: string;
}

export interface World {
  kartik: SeededUser;
  nadia: SeededUser;
  newcomer: SeededUser;
  google: SeededL;
  startup: SeededL;
  nadiaPublic: SeededL;
  anonymous: SeededL;
  privateL: SeededL;
  comment: { id: string };
  collection: { id: string; title: string };
}

/** Wipes and re-seeds the real Postgres. Call in `beforeEach`. */
export function seedWorld(): Promise<World> {
  return backend.seedWorld();
}

export function resetDb(): Promise<void> {
  return backend.resetDb();
}

/** A row read back for assertions. Field values are `unknown` — assert on them directly. */
export type Row = Record<string, unknown>;

interface TestModel {
  count(args?: unknown): Promise<number>;
  findFirst(args?: unknown): Promise<Row>;
  findUnique(args?: unknown): Promise<Row>;
  create(args: unknown): Promise<Row>;
}

type TestDb = Record<
  "user" | "l" | "reaction" | "comment" | "follow" | "collection" | "collectionL" | "notification",
  TestModel
>;

/**
 * Raw Prisma client against the test DB, so specs can assert what was really persisted
 * rather than only what the UI rendered. Structurally typed: `@linkedout/db` is required
 * as CJS here, outside this workspace's dependency graph.
 */
export function db(): TestDb {
  return backend.db();
}

export function disconnect(): Promise<void> {
  return backend.disconnect();
}

/**
 * Installs the API's real `lo_access` session cookie on `localhost`.
 *
 * Cookies ignore the port, so one cookie on `localhost` reaches both the Next server
 * (which forwards it to the API during SSR) and the browser's cross-port `fetch` to the
 * API — the same-site dev setup contract.md §1.2 describes.
 */
export async function signIn(context: BrowserContext, user: SeededUser): Promise<void> {
  await context.addCookies([
    {
      name: "lo_access",
      value: backend.accessToken(user),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/** Follows a feed card through to its detail page. */
export async function openL(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: new RegExp(escapeRegExp(title)) }).first().click();
  await page.waitForURL(/\/ls\//);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
