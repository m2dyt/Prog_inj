import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Catalog, { ProductCard } from "./Catalog";
import { validateProductPage } from "./api";

const product = {
  id: 1,
  name: "Молоко 1 л",
  barcode: "4600000000001",
  category: "Молочные продукты",
  price: "99.90",
  stock: 2,
  active: true,
  version: 1,
};
afterEach(() => vi.unstubAllGlobals());
describe("catalog contract", () => {
  it("blocks adding unavailable stock and accepts available product", () => {
    const add = vi.fn();
    const { rerender } = render(
      <ProductCard product={product} onAdd={add} quantity={2} />,
    );
    expect(screen.getByRole("button", { name: /Добавить/ })).toBeDisabled();
    rerender(<ProductCard product={product} onAdd={add} quantity={1} />);
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    expect(add).toHaveBeenCalledWith(product);
  });
  it("shows an API failure and retries on demand", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Нет сети"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [product], next_cursor: null }),
      });
    vi.stubGlobal("fetch", fetch);
    render(<Catalog token="test-token" onUnauthorized={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет сети");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Молоко 1 л")).toBeVisible();
  });
  it("uses cursor pagination instead of requesting the entire catalog", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [product], next_cursor: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ ...product, id: 2, name: "Хлеб" }],
          next_cursor: null,
        }),
      });
    vi.stubGlobal("fetch", fetch);
    render(<Catalog token="test-token" onUnauthorized={() => {}} />);
    await screen.findByText("Молоко 1 л");
    fireEvent.click(screen.getByRole("button", { name: /Далее/ }));
    await screen.findByText("Хлеб");
    expect(fetch.mock.calls[1][0]).toContain("after=1");
    expect(screen.queryByText("Молоко 1 л")).not.toBeInTheDocument();
  });
  it("does not accept malformed production data", () => {
    expect(() =>
      validateProductPage({
        items: [{ ...product, price: "NaN" }],
        next_cursor: null,
      }),
    ).toThrow();
    expect(() => validateProductPage({ items: [product] })).toThrow();
  });
  it("signals an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ detail: "Сессия истекла" }),
        }),
    );
    const expire = vi.fn();
    render(<Catalog token="bad" onUnauthorized={expire} />);
    await waitFor(() => expect(expire).toHaveBeenCalledOnce());
  });
});
