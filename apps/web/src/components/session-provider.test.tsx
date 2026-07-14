import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionProvider, type Session } from "@/components/session-provider";
import { mockUser } from "@/test/utils";

describe("SessionProvider cache lifecycle", () => {
  it("cancels and clears viewer-owned cache when the principal changes", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", mockUser.id], { viewer: "kartik" });
    const first: Session = { user: mockUser, needsOnboarding: false };
    const second: Session = {
      user: { ...mockUser, id: "u_other", username: "other" },
      needsOnboarding: false,
    };

    const view = render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={first}><div>child</div></SessionProvider>
      </QueryClientProvider>,
    );
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={second}><div>child</div></SessionProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });
});
