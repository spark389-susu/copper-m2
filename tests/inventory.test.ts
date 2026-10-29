import { beforeEach, describe, expect, it, vi } from "vitest";
import { readInventory } from "@/lib/copper/inventory";
import { createStatelessClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createStatelessClient: vi.fn() }));

// A fake Supabase client whose inventory query answers with `result`.
function fakeClient(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ select });
  vi.mocked(createStatelessClient).mockReturnValue({ from } as never);
  return { from, select };
}

beforeEach(() => {
  vi.mocked(createStatelessClient).mockReset();
});

describe("readInventory", () => {
  it("returns every row from the inventory table", async () => {
    const rows = [
      {
        sku: "CH-TEA",
        product: "Copper Home",
        color: "Patina Teal",
        units_in_stock: 6,
        next_shipment: "2026-11-06",
      },
    ];
    const { from } = fakeClient({ data: rows, error: null });
    expect(await readInventory()).toEqual(rows);
    expect(from).toHaveBeenCalledWith("inventory");
  });

  it("returns null when the database reports an error", async () => {
    fakeClient({ data: null, error: { message: "boom" } });
    expect(await readInventory()).toBeNull();
  });

  it("returns null when Supabase isn't configured", async () => {
    vi.mocked(createStatelessClient).mockReturnValue(null);
    expect(await readInventory()).toBeNull();
  });
});
