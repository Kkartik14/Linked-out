import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom ships no `IntersectionObserver`, and `InfiniteList` constructs one in an effect — so
 * every infinite list threw on mount, which is why it and its call sites had no unit tests at
 * all. A no-op observer is the honest stub rather than a shortcut: jsdom performs no layout, so
 * nothing can truthfully intersect, and a stub that fired anyway would invent a scroll the test
 * never performed. The sentinel simply never triggers here; scroll-driven pagination is
 * Playwright's job, where there is a real viewport.
 */
class NoopIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

afterEach(() => {
  cleanup();
});
