import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Catalog, { ProductCard } from "./Catalog";
import ProductDetailsDialog, { BarcodeImage, isValidEan13 } from "./components/ProductDetailsDialog";
import { validateProductPage } from "./api";

const product = {
  id: 1,
  name: "Молоко 1 л",
  barcode: "4602547000886",
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
  it("opens the product detail view from a card and renders a valid EAN-13", () => {
    const open = vi.fn();
    render(<ProductCard product={product} onDetails={open} />);
    fireEvent.click(screen.getByRole("button", { name: /Открыть карточку товара/ }));
    expect(open).toHaveBeenCalledWith(product);
    expect(isValidEan13(product.barcode)).toBe(true);
    const { container } = render(<BarcodeImage value={product.barcode} />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(`Штрихкод ${product.barcode}`);
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(35);
    expect(isValidEan13("4602547000880")).toBe(false);
  });
  it("loads product composition, nutrition, photo and barcode through the API", async () => {
    const previousShowModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    const detail = {
      ...product,
      brand: "Пискарёвское",
      description: "Пастеризованное молоко 2,5%.",
      ingredients: "Молоко нормализованное.",
      proteins: "3.00",
      fats: "2.50",
      carbohydrates: "4.70",
      calories: "53.00",
      image_url: "https://images.example.test/milk.png",
      source_url: "https://source.example.test/milk",
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => detail,
    });
    vi.stubGlobal("fetch", fetch);
    try {
      render(
        <ProductDetailsDialog
          productId={detail.id}
          token="test-token"
          onClose={() => {}}
          onUnauthorized={() => {}}
        />,
      );
      expect(await screen.findByText("Молоко нормализованное.")).toBeVisible();
      expect(screen.getByRole("img", { name: /Упаковка товара/ })).toHaveAttribute("src", detail.image_url);
      expect(screen.getByText("3.00", { exact: true })).toBeVisible();
      expect(screen.getByRole("img", { name: `Штрихкод ${detail.barcode}` })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/products/1", expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        cache: "no-store",
      }));
    } finally {
      if (previousShowModal) HTMLDialogElement.prototype.showModal = previousShowModal;
      else delete HTMLDialogElement.prototype.showModal;
    }
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
