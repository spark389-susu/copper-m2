import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateCost,
  calculateCostInput,
  checkAvailability,
  copperTools,
  getPrices,
  listProducts,
} from "@/lib/copper/assistant/tools";
import { readInventory } from "@/lib/copper/inventory";

vi.mock("@/lib/copper/inventory", () => ({ readInventory: vi.fn() }));

const row = (product: string, color: string, units: number) => ({
  sku: "X",
  product,
  color,
  units_in_stock: units,
  next_shipment: "2026-11-06",
});

beforeEach(() => {
  vi.mocked(readInventory).mockResolvedValue([
    row("Copper Notes", "Brushed Copper", 310),
    row("Copper Notes", "Desert Sand", 4),
    row("Copper Notes", "Night Sky", 0),
    row("Copper Home", "Patina Teal", 6),
  ]);
});

describe("calculate_cost", () => {
  it("counts Copper Plus once: Home + Plus, annual, 2 years is $307", () => {
    const result = calculateCost({
      products: ["copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(result.totalUsd).toBe(307);
    expect(result.lines).toHaveLength(2);
  });

  it("counts Plus once even with two devices, and the free plan adds no line", () => {
    const two = calculateCost({
      products: ["copper-home", "copper-home"],
      plan: "copper-plus",
      billing: "monthly",
      years: 1,
    });
    expect(two.totalUsd).toBe(149 * 2 + 7.99 * 12);
    const free = calculateCost({
      products: ["copper-notes"],
      plan: "free",
      billing: "annual",
      years: 3,
    });
    expect(free.lines).toHaveLength(1);
    expect(free.totalUsd).toBe(129);
  });

  it("rejects input outside its contract", () => {
    const ok = {
      products: ["copper-home"],
      plan: "free",
      billing: "annual",
      years: 1,
    };
    expect(calculateCostInput.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, years: 0 },
      { ...ok, years: 6 },
      { ...ok, years: 1.5 },
      { ...ok, plan: "gold" },
      { ...ok, billing: "weekly" },
      { ...ok, products: Array(6).fill("copper-home") },
      { ...ok, products: ["copper-pro"] },
      { ...ok, extra: true },
    ]) {
      expect(calculateCostInput.safeParse(bad).success).toBe(false);
    }
  });
});

describe("catalog tools", () => {
  it("get_products lists colors and says nothing about stock", () => {
    const { products } = listProducts();
    expect(products.map((p) => p.id)).toEqual(["copper-home", "copper-notes"]);
    expect(JSON.stringify(products)).not.toMatch(/stock/i);
  });

  it("get_prices returns products and plans", () => {
    const prices = getPrices();
    expect(prices.products).toHaveLength(2);
    expect(prices.plans.map((p) => p.id)).toEqual(["free", "copper-plus"]);
  });

  it("exposes all four tools with descriptions", () => {
    expect(Object.keys(copperTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "get_prices",
      "get_products",
    ]);
    for (const tool of Object.values(copperTools)) {
      expect(tool.description).toBeTruthy();
    }
  });
});

describe("check_availability", () => {
  it("reports in stock, low stock and back-ordered with a date", async () => {
    const result = await checkAvailability({ product: "copper-notes" });
    expect(result).toEqual({
      status: "ok",
      product: "Copper Notes",
      colors: [
        { color: "Brushed Copper", stock: "in_stock", restockDate: null },
        { color: "Desert Sand", stock: "low_stock", restockDate: null },
        {
          color: "Night Sky",
          stock: "backordered",
          restockDate: "2026-11-06",
        },
      ],
    });
  });

  it("accepts any capitalization and answers in the catalog's", async () => {
    const result = await checkAvailability({
      product: "copper-home",
      color: "patina TEAL",
    });
    expect(result).toMatchObject({
      status: "ok",
      colors: [{ color: "Patina Teal", stock: "low_stock" }],
    });
  });

  it("reads stock fresh every time", async () => {
    await checkAvailability({ product: "copper-notes" });
    await checkAvailability({ product: "copper-notes" });
    expect(readInventory).toHaveBeenCalledTimes(2);
  });

  it("says not_a_color for Copper Notes in Patina Teal, even if stock is down", async () => {
    vi.mocked(readInventory).mockResolvedValue(null);
    const result = await checkAvailability({
      product: "copper-notes",
      color: "Patina Teal",
    });
    expect(result).toEqual({
      status: "not_a_color",
      product: "Copper Notes",
      color: "Patina Teal",
      colors: ["Brushed Copper", "Desert Sand", "Night Sky"],
    });
    expect(readInventory).not.toHaveBeenCalled();
  });

  it("says unavailable, with no stock words, when stock can't be read", async () => {
    vi.mocked(readInventory).mockResolvedValue(null);
    const result = await checkAvailability({ product: "copper-home" });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toMatch(
      /in_stock|low_stock|backordered/,
    );
  });
});
