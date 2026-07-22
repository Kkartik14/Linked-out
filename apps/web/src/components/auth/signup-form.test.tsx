import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    emailSignup: vi.fn(),
    emailVerify: vi.fn(),
    emailResendOtp: vi.fn(),
  };
});

vi.mock("@/lib/email-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email-auth")>();
  return { ...actual, completeEmailSession: vi.fn() };
});

import { SignupForm } from "@/components/auth/signup-form";
import { ApiError, emailResendOtp, emailSignup, emailVerify } from "@/lib/api";
import { completeEmailSession } from "@/lib/email-auth";
import { renderWithProviders } from "@/test/utils";

const EMAIL = "kartik@example.com";
const PASSWORD = "correct horse battery staple";
const CODE = "12345678";

beforeEach(() => vi.clearAllMocks());

function render() {
  return renderWithProviders(<SignupForm returnTo="/feed" />);
}

// jsdom does not follow the OTP field's focus-advance across a single keyboard string, so fill
// each box explicitly. The eighth digit auto-submits via the field's onComplete.
async function typeOtp(user: ReturnType<typeof userEvent.setup>, code: string) {
  const boxes = screen.getAllByRole("textbox");
  for (let i = 0; i < code.length; i++) {
    await user.type(boxes[i]!, code[i]!);
  }
}

async function reachOtpStep(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(emailSignup).mockResolvedValue({ accepted: true, expiresInSeconds: 600 });
  await user.type(screen.getByLabelText("Email"), EMAIL);
  await user.type(screen.getByLabelText("Password"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "Create account" }));
  // The code step announces the address it was sent to.
  await screen.findByText(/expires in 10 minutes/);
}

describe("SignupForm", () => {
  it("refuses a password shorter than eight characters before hitting the API", async () => {
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Email"), EMAIL);
    await user.type(screen.getByLabelText("Password"), "short7!");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    expect(emailSignup).not.toHaveBeenCalled();
  });

  it("shows live password-strength feedback without imposing composition rules", async () => {
    const user = userEvent.setup();
    render();

    await user.type(screen.getByLabelText("Password"), "password");
    expect(screen.getByRole("meter", { name: /password strength/i })).toBeInTheDocument();
    expect(screen.getByText(/very weak|weak/i)).toBeInTheDocument();
  });

  it("requests a code and advances to the verification step", async () => {
    const user = userEvent.setup();
    render();

    await reachOtpStep(user);

    // Signup carries the email only; the password is held and authored at verify (contract §0.1).
    expect(emailSignup).toHaveBeenCalledWith({ email: EMAIL });
    expect(vi.mocked(emailSignup).mock.calls[0]?.[0]).not.toHaveProperty("password");
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("verifies the code and completes the session handoff", async () => {
    const user = userEvent.setup();
    vi.mocked(emailVerify).mockResolvedValue({
      code: "A".repeat(43),
      returnTo: "/feed",
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    render();
    await reachOtpStep(user);

    await typeOtp(user, CODE); // eighth digit auto-submits via onComplete

    expect(emailVerify).toHaveBeenCalledWith({
      email: EMAIL,
      otp: CODE,
      password: PASSWORD,
      returnTo: "/feed",
    });
    expect(completeEmailSession).toHaveBeenCalledWith("A".repeat(43));
  });

  it("keeps the user on the code step and explains an invalid code", async () => {
    const user = userEvent.setup();
    vi.mocked(emailVerify).mockRejectedValue(
      new ApiError(400, "INVALID_OTP", "The verification code is invalid or expired."),
    );
    render();
    await reachOtpStep(user);

    await typeOtp(user, CODE);

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect or has expired/i);
    expect(completeEmailSession).not.toHaveBeenCalled();
  });

  it("returns to password editing when the server rejects a compromised password", async () => {
    const user = userEvent.setup();
    vi.mocked(emailVerify).mockRejectedValue(
      new ApiError(
        422,
        "PASSWORD_COMPROMISED",
        "This password appears in known data breaches.",
      ),
    );
    render();
    await reachOtpStep(user);

    await typeOtp(user, CODE);

    expect(await screen.findByLabelText("Password")).toHaveValue(PASSWORD);
    expect(screen.getByRole("alert")).toHaveTextContent(/known data breaches/i);
    expect(completeEmailSession).not.toHaveBeenCalled();
  });

  it("resends the signup code for the same email", async () => {
    const user = userEvent.setup();
    vi.mocked(emailResendOtp).mockResolvedValue({ accepted: true, expiresInSeconds: 600 });
    render();
    await reachOtpStep(user);

    await user.click(screen.getByRole("button", { name: "Resend code" }));

    expect(emailResendOtp).toHaveBeenCalledWith({ email: EMAIL, purpose: "SIGNUP" });
  });
});
