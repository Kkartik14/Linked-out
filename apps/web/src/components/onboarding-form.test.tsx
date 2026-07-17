import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, patchMe: vi.fn() };
});

import { OnboardingForm } from "@/components/onboarding-form";
import { patchMe } from "@/lib/api";
import { mockUser, renderWithProviders } from "@/test/utils";

const signedIn = { user: mockUser, needsOnboarding: true };

function render() {
  return renderWithProviders(<OnboardingForm returnTo="/" defaultName="" />, {
    session: signedIn,
  });
}

describe("OnboardingForm", () => {
  it("states the username rule before you break it", async () => {
    // The rule used to live only inside an unreachable branch, so the one thing that could
    // explain a rejected username was the one thing nobody could ever read.
    render();

    const hint = screen.getByText(/3–30 characters/);
    expect(hint).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAccessibleDescription(/3–30 characters/);
  });

  it("explains a username that is too short instead of dying quietly", async () => {
    // The regression: `disabled={busy || !valid}` made the submit handler's own error branch
    // unreachable — and a disabled default button suppresses implicit submission too, so
    // Enter could not reach it either. You got a dead button and no reason, forever.
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Username"), "ab");
    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeEnabled();

    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(/3–30 characters/);
    expect(patchMe).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not call a username invalid while it is still being typed", async () => {
    // Every username is invalid at one character. Flagging that mid-keystroke is noise.
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Username"), "a");

    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a stale error once the viewer starts fixing it", async () => {
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Username"), "ab");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Username"), "cd");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits a valid username, declaring the principal it was composed under", async () => {
    const user = userEvent.setup();
    vi.mocked(patchMe).mockResolvedValue({ ...mockUser, username: "kartik_g" });
    render();

    await user.type(screen.getByLabelText("Username"), "kartik_g");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(patchMe).toHaveBeenCalledWith(mockUser.id, { username: "kartik_g", name: null });
  });
});
