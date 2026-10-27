import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Answer } from "@/components/copper/ask-copper-answer";
import type { Progress, Step } from "@/lib/copper/assistant/progress";

const tool = (
  name: string,
  state: "calling" | "done" | "error",
  input?: unknown,
  output?: unknown,
): Step => ({ type: "tool", id: name, name, state, input, output });

const show = (steps: Step[], extra: Partial<Progress> = {}, useTools = true) =>
  render(
    <Answer
      useTools={useTools}
      progress={{ steps, reply: "", status: "done", ...extra }}
    />,
  );

describe("Ask Copper answer", () => {
  it("shows stock as colored pills, with the restock date for back-ordered", () => {
    show([
      tool(
        "check_availability",
        "done",
        { product: "copper-notes" },
        {
          status: "ok",
          product: "Copper Notes",
          colors: [
            { color: "Desert Sand", stock: "in_stock", restockDate: null },
            {
              color: "Night Sky",
              stock: "backordered",
              restockDate: "2026-11-14",
            },
          ],
        },
      ),
    ]);
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(
      screen.getByText(/Back-ordered until Nov 14, 2026/),
    ).toBeInTheDocument();
  });

  it("names the real colors for a color that doesn't exist", () => {
    show([
      tool(
        "check_availability",
        "done",
        { product: "copper-notes", color: "Patina Teal" },
        {
          status: "not_a_color",
          product: "Copper Notes",
          color: "Patina Teal",
          colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
        },
      ),
    ]);
    expect(screen.getByText(/doesn't come in Patina Teal/)).toBeInTheDocument();
    expect(
      screen.getByText(/Brushed Copper, Desert Sand, Night Sky/),
    ).toBeInTheDocument();
  });

  it("says what is happening while a tool is still running", () => {
    show([tool("calculate_cost", "calling")], { status: "working" });
    const card = within(screen.getByTestId("tool-call"));
    expect(card.getByText(/filling in the details/i)).toBeInTheDocument();
    expect(card.getByText(/the app is running the code/i)).toBeInTheDocument();
    expect(screen.getByText(/deciding what to do next/i)).toBeInTheDocument();
  });

  it("writes plain words for tools that take no input", () => {
    show([tool("get_prices", "done", {}, { products: [], plans: [] })]);
    expect(
      screen.getByText(/just asked for the price list/i),
    ).toBeInTheDocument();
  });

  it("shows the tools-off station and warning, with no tool cards", () => {
    show([], { reply: "About $300." }, false);
    expect(
      screen.getByText(/tools given to copper: none/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/answer from memory alone/i)).toBeInTheDocument();
    expect(screen.queryByTestId("tool-call")).toBeNull();
  });
});
