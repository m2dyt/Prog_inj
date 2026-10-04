import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CartPanel from "./CartPanel";

function renderDraft(onFinish = vi.fn()) {
  render(
    <CartPanel
      cart={[]}
      draft={{
        id: 36,
        total: "100.00",
        items: [{ product_id: 7, product_name: "Молоко", unit_price: "100.00", quantity: 1 }],
      }}
      busy={false}
      creating={false}
      locked
      onChange={vi.fn()}
      onPrepare={vi.fn()}
      onFinish={onFinish}
    />,
  );
  return onFinish;
}

describe("CartPanel payment simulation", () => {
  it("shows the cash shortfall, calculates change, and submits the amount", () => {
    const onFinish = renderDraft();
    const amount = screen.getByLabelText("Получено от покупателя");
    const acceptCash = screen.getByRole("button", { name: "Принять наличные" });

    fireEvent.change(amount, { target: { value: "60,00" } });
    expect(screen.getByText(/Не хватает/)).toBeTruthy();
    expect(acceptCash.disabled).toBe(true);

    fireEvent.change(amount, { target: { value: "150,00" } });
    expect(screen.getByText(/Сдача:/)).toBeTruthy();
    expect(acceptCash.disabled).toBe(false);
    fireEvent.click(acceptCash);

    expect(onFinish).toHaveBeenCalledWith("pay", {
      payment_method: "cash",
      cash_received: "150.00",
    });
  });

  it("can simulate both approval and terminal decline without card data", () => {
    const onFinish = renderDraft();
    fireEvent.click(screen.getByRole("radio", { name: /Карта/ }));

    fireEvent.click(screen.getByRole("button", { name: "Показать отказ терминала" }));
    expect(onFinish).toHaveBeenLastCalledWith("pay", {
      payment_method: "card_simulated",
      card_outcome: "declined",
    });

    fireEvent.click(screen.getByRole("button", { name: "Симулировать одобрение карты" }));
    expect(onFinish).toHaveBeenLastCalledWith("pay", {
      payment_method: "card_simulated",
    });
  });
});
