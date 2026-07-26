import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSessionChanged, subscribeSessionChanged } from "@/lib/session-channel";

const CHANNEL_NAME = "linkedout:session";

/** A `BroadcastChannel` this module did not create - i.e. what another tab looks like. */
function otherTab() {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const received: unknown[] = [];
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    received.push(event.data);
  });
  return { channel, received };
}

/**
 * Wait for delivery to have actually happened, rather than guessing at a number of ticks.
 *
 * jsdom implements no `BroadcastChannel`, so these tests exercise Node's, which delivers over a
 * `MessagePort` on the event loop - a different task source from the timers the test itself uses.
 * Nothing orders a `setTimeout(0)` queued after `postMessage()` behind the delivery it is meant to
 * be waiting for. It merely wins that race on an idle machine, which is why the previous
 * fixed-tick `settle()` passed here for months and then failed once on a loaded CI runner.
 */
function delivered(received: unknown[], count = 1): Promise<void> {
  return vi.waitFor(() => expect(received).toHaveLength(count));
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
    await delivered(tab.received);

    expect(tab.received).toEqual(["session-changed"]);
  });

  it("does not deliver a tab's own publish back to itself", async () => {
    // The load-bearing property. Publish and subscribe share one channel object precisely so
    // the spec's "never echo to the poster" rule does the filtering; if they ever drift onto
    // separate objects, a sign-out would refresh the tab that just signed out - and, worse,
    // every tab would react to its own event as though it came from elsewhere.
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));
    // The witness turns this into a real negative: it proves the message was delivered
    // *somewhere*, so "our handler never ran" cannot pass merely because nothing had arrived yet.
    const witness = otherTab();
    openTabs.push(witness.channel);

    publishSessionChanged();
    await delivered(witness.received);

    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler when another tab publishes", async () => {
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));
    const tab = otherTab();
    openTabs.push(tab.channel);

    tab.channel.postMessage("session-changed");
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it("stops delivering after unsubscribe", async () => {
    const handler = vi.fn();
    const unsubscribe = subscribeSessionChanged(handler);
    const tab = otherTab();
    const witness = otherTab();
    openTabs.push(tab.channel, witness.channel);

    unsubscribe();
    tab.channel.postMessage("session-changed");
    await delivered(witness.received);

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores unrelated traffic on the same channel name", async () => {
    const handler = vi.fn();
    unsubscribes.push(subscribeSessionChanged(handler));
    const tab = otherTab();
    const witness = otherTab();
    openTabs.push(tab.channel, witness.channel);

    tab.channel.postMessage("something-else");
    tab.channel.postMessage({ type: "session-changed" });
    await delivered(witness.received, 2);

    expect(handler).not.toHaveBeenCalled();
  });
});
