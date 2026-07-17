import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Paginated } from "@linkedout/contracts/v2";

import { InfiniteList } from "@/components/infinite-list";
import { renderWithProviders } from "@/test/utils";

/**
 * A skeleton is silent: it is a stack of empty boxes with no text, so a screen reader is
 * told nothing at all while a page loads or fails. These lock the announcements, which are
 * invisible by construction and so cannot be caught by looking at the page.
 */

const never = () => new Promise<Paginated<string>>(() => {});
const boom = () => Promise.reject(new Error("nope"));

function renderList(queryFn: () => Promise<Paginated<string>>, loadingLabel?: string) {
  return renderWithProviders(
    <InfiniteList<string>
      queryKey={["infinite-list-test", queryFn.name, loadingLabel ?? "-"]}
      queryFn={queryFn}
      renderItem={(item) => <p>{item}</p>}
      getItemKey={(item) => item}
      skeleton={<div data-testid="skeleton" />}
      empty={<p>Nothing here</p>}
      {...(loadingLabel ? { loadingLabel } : {})}
    />,
  );
}

describe("InfiniteList accessibility", () => {
  it("names what is loading rather than rendering a silent skeleton", async () => {
    renderList(never);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton").parentElement).toHaveAttribute("aria-busy");
  });

  it("lets a caller say what is arriving", async () => {
    renderList(never, "Loading saved Ls…");

    expect(await screen.findByText("Loading saved Ls…")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("announces a failed page, which lands below content already read", async () => {
    renderList(boom);

    // `alert`, not plain text: the reader has already scrolled past this point, so nothing
    // would draw them back to discover that loading stopped and a retry appeared.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/./);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument(),
    );
  });
});
