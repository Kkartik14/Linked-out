import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";

import {
  SessionProvider,
  useComposedPrincipal,
  type Session,
} from "@/components/session-provider";
import { publishSessionChanged } from "@/lib/session-channel";
import { mockUser } from "@/test/utils";

const CHANNEL_NAME = "linkedout:session";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * `satisfies` rather than an annotation: it proves the spy is a usable `AppRouterInstance`
 * while keeping each member's `Mock` type, which is what lets `refresh` be asserted on.
 * Zero-arg spies are assignable to the router's arg-taking methods, so one shape covers all.
 */
function routerSpy() {
  return {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
  } satisfies AppRouterInstance;
}

function renderProvider(
  session: Session,
  queryClient: QueryClient,
  router: AppRouterInstance,
  child: React.ReactNode = <div>child</div>,
) {
  const tree = (value: Session) => (
    <AppRouterContext.Provider value={router}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={value}>{child}</SessionProvider>
      </QueryClientProvider>
    </AppRouterContext.Provider>
  );
  const view = render(tree(session));
  return { ...view, rerenderWith: (next: Session) => view.rerender(tree(next)) };
}

/** Renders whatever it was composed under, and records every value it ever declared. */
function Composed({ seen }: { seen: string[] }) {
  const composedAs = useComposedPrincipal();
  seen.push(composedAs);
  return <output>{composedAs}</output>;
}

const signedIn: Session = { user: mockUser, needsOnboarding: false };
const otherUser: Session = {
  user: { ...mockUser, id: "01BX5ZZKBKACTAV9WEVGEMMVRZ", username: "other" },
  needsOnboarding: false,
};

describe("SessionProvider cache lifecycle", () => {
  it("cancels and clears viewer-owned cache when the principal changes", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", mockUser.id], { viewer: "kartik" });

    const view = renderProvider(signedIn, queryClient, routerSpy());
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);

    view.rerenderWith(otherUser);

    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });

  it("leaves cache alone when the snapshot changes but the principal does not", async () => {
    // An ordinary profile edit re-renders the layout with a new snapshot. Same principal, so
    // the viewer's own cache must survive — otherwise every settings save nukes the feed.
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", mockUser.id], { viewer: "kartik" });

    const view = renderProvider(signedIn, queryClient, routerSpy());
    view.rerenderWith({ user: { ...mockUser, bio: "edited" }, needsOnboarding: false });
    await settle();

    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});

describe("useComposedPrincipal", () => {
  it("declares the principal the view was composed under, not the live one", () => {
    // The bug this whole mechanism exists to stop: a form composed under A must keep
    // declaring A while the cookie already says B, so the API can reject the write. If this
    // ever tracked the live principal it would agree with the session on every request and
    // the 409 would never fire — passing tests, silent hole.
    const seen: string[] = [];
    const view = renderProvider(signedIn, new QueryClient(), routerSpy(), <Composed seen={seen} />);

    expect(view.getByRole("status")).toHaveTextContent(mockUser.id);
    expect(seen).toEqual([mockUser.id]);
  });

  it("remounts on a principal change so the declaration follows the new viewer", () => {
    // Freezing without remounting would pin the old principal forever: an ordinary
    // sign-out/sign-in in this very tab would then 409 every mutation until a hard reload.
    const seen: string[] = [];
    const view = renderProvider(signedIn, new QueryClient(), routerSpy(), <Composed seen={seen} />);
    view.rerenderWith(otherUser);

    expect(view.getByRole("status")).toHaveTextContent(otherUser.user!.id);
    expect(seen.at(-1)).toBe(otherUser.user!.id);
  });

  it("does not remount when the snapshot changes but the principal does not", () => {
    // A profile edit re-renders the layout. Remounting there would throw away whatever the
    // viewer was in the middle of typing, for no safety gain — same person, same session.
    const seen: string[] = [];
    const view = renderProvider(signedIn, new QueryClient(), routerSpy(), <Composed seen={seen} />);
    view.rerenderWith({ user: { ...mockUser, bio: "edited" }, needsOnboarding: false });

    expect(new Set(seen)).toEqual(new Set([mockUser.id]));
  });

  it("declares the guest principal when signed out", () => {
    const seen: string[] = [];
    renderProvider({ user: null, needsOnboarding: false }, new QueryClient(), routerSpy(), (
      <Composed seen={seen} />
    ));

    expect(seen).toEqual(["anon"]);
  });
});

describe("SessionProvider cross-tab lifecycle", () => {
  it("re-derives the session from the server when another tab signs in or out", async () => {
    const router = routerSpy();
    renderProvider(signedIn, new QueryClient(), router);

    const elsewhere = new BroadcastChannel(CHANNEL_NAME);
    elsewhere.postMessage("session-changed");
    await settle();
    elsewhere.close();

    // Not "trust the message and swap the user" — the tab asks the one authority that can
    // read the cookie. `router.refresh()` re-runs the layout, which re-runs `getSession()`.
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh in response to its own publish", async () => {
    const router = routerSpy();
    renderProvider(signedIn, new QueryClient(), router);

    publishSessionChanged();
    await settle();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", async () => {
    const router = routerSpy();
    const view = renderProvider(signedIn, new QueryClient(), router);
    view.unmount();

    const elsewhere = new BroadcastChannel(CHANNEL_NAME);
    elsewhere.postMessage("session-changed");
    await settle();
    elsewhere.close();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("re-derives on a bfcache restore, which the broadcast cannot reach", async () => {
    const router = routerSpy();
    renderProvider(signedIn, new QueryClient(), router);

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await settle();

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores an ordinary pageshow that is not a bfcache restore", async () => {
    // A normal load fires `pageshow` too, with `persisted: false`. Refreshing there would
    // mean a second server round trip on every single page load.
    const router = routerSpy();
    renderProvider(signedIn, new QueryClient(), router);

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    await settle();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("stops listening for bfcache restores once unmounted", async () => {
    const router = routerSpy();
    const view = renderProvider(signedIn, new QueryClient(), router);
    view.unmount();

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await settle();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("clears the previous viewer's cache once the refreshed snapshot arrives", async () => {
    // The two effects meeting: a cross-tab sign-in refreshes, the server answers with a new
    // principal, and that lands on the same clearing path an in-tab switch uses.
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", mockUser.id], { viewer: "kartik" });
    const router = routerSpy();

    const view = renderProvider(signedIn, queryClient, router);
    const elsewhere = new BroadcastChannel(CHANNEL_NAME);
    elsewhere.postMessage("session-changed");
    await settle();
    elsewhere.close();

    expect(router.refresh).toHaveBeenCalledTimes(1);
    view.rerenderWith(otherUser); // what the refresh delivers

    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });
});
