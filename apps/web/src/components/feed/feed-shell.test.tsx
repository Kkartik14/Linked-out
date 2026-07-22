import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The rails fetch their own data; this suite is about which rails FeedShell mounts, so stub them.
vi.mock("@/components/feed/sidebar/feed-sidebar", () => ({
  FeedSidebarLeft: () => <div data-testid="left-rail" />,
  FeedSidebarRight: () => <div data-testid="right-rail" />,
}));

import { FeedShell } from "@/components/feed/feed-shell";

describe("FeedShell rail modes", () => {
  it("mounts both rails by default", () => {
    render(
      <FeedShell labelledBy="h">
        <h1 id="h">Centre</h1>
      </FeedShell>,
    );

    expect(screen.getByTestId("left-rail")).toBeInTheDocument();
    expect(screen.getByTestId("right-rail")).toBeInTheDocument();
  });

  it("never mounts the right rail in left mode", () => {
    render(
      <FeedShell labelledBy="h" railMode="left">
        <h1 id="h">Centre</h1>
      </FeedShell>,
    );

    expect(screen.getByTestId("left-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("right-rail")).not.toBeInTheDocument();
  });

  it("exposes the centre as a region labelled by its heading", () => {
    render(
      <FeedShell labelledBy="settings-heading" railMode="left">
        <h1 id="settings-heading">Settings</h1>
      </FeedShell>,
    );

    expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument();
  });
});
