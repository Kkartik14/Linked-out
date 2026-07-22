import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OtpInput } from "@/components/auth/otp-input";

function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <>
      <span id="otp-label">Code</span>
      <OtpInput value={value} onChange={setValue} onComplete={onComplete} labelledBy="otp-label" />
      <output data-testid="value">{value}</output>
    </>
  );
}

// jsdom does not reliably follow the programmatic focus-advance across `user.keyboard`, so tests
// target each box explicitly. The auto-advance itself is asserted separately via `toHaveFocus`.
async function typeInBoxes(user: ReturnType<typeof userEvent.setup>, code: string) {
  const boxes = screen.getAllByRole("textbox");
  for (let i = 0; i < code.length; i++) {
    await user.type(boxes[i]!, code[i]!);
  }
}

describe("OtpInput", () => {
  it("builds the code as digits are entered and reports completion once", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    expect(screen.getAllByRole("textbox")).toHaveLength(8);
    await typeInBoxes(user, "12345678");

    expect(screen.getByTestId("value")).toHaveTextContent("12345678");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("12345678");
  });

  it("advances focus to the next box after a digit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const boxes = screen.getAllByRole("textbox");
    await user.type(boxes[0]!, "5");

    expect(boxes[1]).toHaveFocus();
  });

  it("ignores non-digit characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const boxes = screen.getAllByRole("textbox");
    await user.type(boxes[0]!, "a");
    expect(screen.getByTestId("value")).toHaveTextContent("");

    await user.type(boxes[0]!, "5");
    expect(screen.getByTestId("value")).toHaveTextContent("5");
  });

  it("distributes a pasted code across the boxes", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    const boxes = screen.getAllByRole("textbox");
    await user.click(boxes[0]!);
    await user.paste("87654321");

    expect(screen.getByTestId("value")).toHaveTextContent("87654321");
    expect(onComplete).toHaveBeenCalledWith("87654321");
  });

  it("removes a digit on backspace", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await typeInBoxes(user, "123");
    expect(screen.getByTestId("value")).toHaveTextContent("123");

    const boxes = screen.getAllByRole("textbox");
    await user.click(boxes[2]!);
    await user.keyboard("{Backspace}");

    expect(screen.getByTestId("value")).toHaveTextContent("12");
  });
});
