import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, emailLogin: vi.fn() };
});

vi.mock("@/lib/email-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email-auth")>();
  return { ...actual, completeEmailSession: vi.fn() };
});

import { LoginForm } from "@/components/auth/login-form";
import { ApiError, emailLogin } from "@/lib/api";
import { completeEmailSession } from "@/lib/email-auth";
import { renderWithProviders } from "@/test/utils";

const EMAIL = "kartik@example.com";
const PASSWORD = "correct horse battery staple";

beforeEach(() => vi.clearAllMocks());

function render() {
  return renderWithProviders(<LoginForm returnTo="/feed" />);
}

describe("LoginForm", () => {
  it("will not submit an empty password", async () => {
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your password/i);
    expect(emailLogin).not.toHaveBeenCalled();
  });

  it("logs in and completes the session handoff", async () => {
    const user = userEvent.setup();
    vi.mocked(emailLogin).mockResolvedValue({
      code: "B".repeat(43),
      returnTo: "/feed",
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    render();

    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(emailLogin).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      returnTo: "/feed",
    });
    expect(completeEmailSession).toHaveBeenCalledWith("B".repeat(43));
  });

  it("shows one generic message for a rejected credential", async () => {
    const user = userEvent.setup();
    vi.mocked(emailLogin).mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect."),
    );
    render();

    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("Password"), "wrong password value");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is incorrect/i);
    expect(completeEmailSession).not.toHaveBeenCalled();
  });
});
