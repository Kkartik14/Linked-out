import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { UserMenu } from "@/components/layout/user-menu";
import { mockUser, renderWithProviders } from "@/test/utils";

describe("UserMenu across session states (AUTH-06)", () => {
  it("offers sign-in to a guest", () => {
    renderWithProviders(<UserMenu />, { session: { status: "guest" } });
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("renders nothing when the session is unavailable", () => {
    // Neither the account menu nor "Log in": we could not confirm the session, so claiming
    // they are signed out would be a guess. A bare header is the honest "we don't know yet".
    const { container } = renderWithProviders(<UserMenu />, {
      session: { status: "unavailable" },
    });
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the account menu to an authenticated viewer", () => {
    renderWithProviders(<UserMenu />, {
      session: { status: "authenticated", user: mockUser, needsOnboarding: false },
    });
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });
});
