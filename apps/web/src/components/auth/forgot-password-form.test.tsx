import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    emailForgotPassword: vi.fn(),
    emailResetPassword: vi.fn(),
    emailResendOtp: vi.fn(),
  };
});

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { emailForgotPassword, emailResetPassword } from "@/lib/api";
import { renderWithProviders } from "@/test/utils";

const EMAIL = "kartik@example.com";
const NEW_PASSWORD = "brand new battery staple"; // ≥ 15 chars
const CODE = "12345678";

beforeEach(() => vi.clearAllMocks());

function render() {
  return renderWithProviders(<ForgotPasswordForm returnTo="/" />);
}

// jsdom does not follow the OTP field's focus-advance across a single keyboard string.
async function typeOtp(user: ReturnType<typeof userEvent.setup>, code: string) {
  const boxes = screen.getAllByRole("textbox");
  for (let i = 0; i < code.length; i++) {
    await user.type(boxes[i]!, code[i]!);
  }
}

async function reachResetStep(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(emailForgotPassword).mockResolvedValue({ accepted: true, expiresInSeconds: 600 });
  await user.type(screen.getByLabelText("Email"), EMAIL);
  await user.click(screen.getByRole("button", { name: "Send reset code" }));
  await screen.findByLabelText("New password");
}

describe("ForgotPasswordForm", () => {
  it("requests a code generically and advances to the reset step", async () => {
    const user = userEvent.setup();
    render();

    await reachResetStep(user);

    expect(emailForgotPassword).toHaveBeenCalledWith({ email: EMAIL });
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("rejects a too-short new password before hitting the API", async () => {
    const user = userEvent.setup();
    render();
    await reachResetStep(user);

    await typeOtp(user, CODE);
    await user.type(screen.getByLabelText("New password"),"short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 15 characters/i);
    expect(emailResetPassword).not.toHaveBeenCalled();
  });

  it("resets the password and shows the signed-out confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(emailResetPassword).mockResolvedValue({ ok: true });
    render();
    await reachResetStep(user);

    await typeOtp(user, CODE);
    await user.type(screen.getByLabelText("New password"),NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(emailResetPassword).toHaveBeenCalledWith({
      email: EMAIL,
      otp: CODE,
      newPassword: NEW_PASSWORD,
    });
    expect(await screen.findByText(/signed out every device/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to login" })).toBeInTheDocument();
  });
});
