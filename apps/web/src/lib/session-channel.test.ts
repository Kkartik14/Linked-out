import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSessionChanged, subscribeSessionChanged } from "@/lib/session-channel";

const CHANNEL_NAME = "linkedout:session";

/** Delivery is queued as a task, so a message is never observable in the same tick. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A `BroadcastChannel` this module did not create — i.e. what another tab looks like. */
function otherTab() {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const received: unknown[] = [];
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    received.push(event.data);
  });
  return { channel, received };
}

const openTabs: BroadcastChannel[] = [];
const unsubscribes: Array<() => void> = [];

afterEach(() => {
  while (unsubscribes.length) unsubscribes.pop()?.();
  while (openTabs.length) openTabs.pop()?.close();
});

describe("session channel", () => {
  it("notifies another tab that its session snapshot is stale", async () => {
    const tab = otherTab();
    openTabs.push(tab.channel);

    publishSessionChanged();
    await settle();

    expect(tab.received).toHaveLength(1);
  });

  it("does not deliver a tab's own publish back to itself", async () => {
    // The load-bearing property. Publish and subscribe share one channel object precisely so
    // the spec's "never echo to the poster" rule does the filtering; if they ever drift onto
    // separate objects, a sign-out would refresh the tab that just signed out — and, worse,
    // every tab would react to its own event as though it came from elsewhere.
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));

    publishSessionChanged();
    await settle();

    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler when another tab publishes", async () => {
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));
    const tab = otherTab();
    openTabs.push(tab.channel);

    tab.channel.postMessage("session-changed");
    await settle();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", async () => {
    const handler = vi.fn();
    const unsubscribe = subscribeSessionChanged(handler);
    const tab = otherTab();
    openTabs.push(tab.channel);

    unsubscribe();
    tab.channel.postMessage("session-changed");
    await settle();

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores unrelated traffic on the same channel name", async () => {
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));
    const tab = otherTab();
    openTabs.push(tab.channel);

    tab.channel.postMessage("something-else");
    tab.channel.postMessage({ type: "session-changed" });
    await settle();

    expect(handler).not.toHaveBeenCalled();
  });
});
