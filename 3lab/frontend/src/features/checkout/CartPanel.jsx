import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { ArrowUpRight, Minus, Plus, ShoppingBasket } from "lucide-react";

import { cents, currency } from "../../api";

export default function CartPanel({ cart, draft, busy, creating, locked, onChange, onPrepare, onFinish }) {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashInput, setCashInput] = useState("");

  useEffect(() => {
    setPaymentMethod("cash");
    setCashInput("");
  }, [draft?.id]);

  const displayLines = draft
    ? draft.items.map((item) => ({
      id: item.product_id,
      name: item.product_name,
      price: item.unit_price,
      quantity: item.quantity,
    }))
    : cart;
  const count = displayLines.reduce((sum, item) => sum + item.quantity, 0);
  const total = draft
    ? draft.total
    : cart.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0) / 100;
  const normalizedCash = cashInput.trim().replace(",", ".");
  const validCash = /^\d{1,12}(?:\.\d{1,2})?$/.test(normalizedCash) && Number(normalizedCash) > 0;
  const cashCents = validCash ? Math.round(Number(normalizedCash) * 100) : null;
  const totalCents = cents(total);
  const cashShort = validCash && cashCents < totalCents;
  const changeCents = validCash ? cashCents - totalCents : null;

  return (
    <aside className="cart">
      <div className="cart-header">
        <div>
          <h2>Текущая продажа</h2>
          <p>{draft ? `Чек №${draft.id}` : "Новый чек"}</p>
        </div>
        <span className="cart-count">{count}</span>
      </div>
      <div className="cart-lines">
        {!displayLines.length ? (
          <div className="cart-empty">
            <ShoppingBasket size={44} strokeWidth={1.2} />
            <h3>Здесь будет покупка</h3>
            <p>Добавляйте товары из каталога с помощью кнопки «+».</p>
          </div>
        ) : (
          displayLines.map((item) => (
            <article className="cart-line" key={item.id}>
              <h3>{item.name}</h3>
              <span>{currency(item.price)} / шт.</span>
              <div>
                <div className="quantity">
                  <button disabled={locked} onClick={() => onChange(item.id, -1)} aria-label={`Уменьшить ${item.name}`}>
                    <Minus size={14} />
                  </button>
                  <span>{item.quantity}</span>
                  <button disabled={locked} onClick={() => onChange(item.id, 1)} aria-label={`Увеличить ${item.name}`}>
                    <Plus size={14} />
                  </button>
                </div>
                <strong>{currency((cents(item.price) * item.quantity) / 100)}</strong>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="cart-total">
        <p><span>{draft ? "К оплате" : "Предварительный итог"}</span><strong>{currency(total)}</strong></p>
        {draft ? (
          <>
            <fieldset className="payment-methods" disabled={busy}>
              <legend>Способ оплаты</legend>
              <label className={paymentMethod === "cash" ? "payment-option selected" : "payment-option"}>
                <input
                  type="radio"
                  name={`payment-method-${draft.id}`}
                  value="cash"
                  checked={paymentMethod === "cash"}
                  onChange={() => setPaymentMethod("cash")}
                />
                <span><strong>Наличные</strong><small>Внести полученную сумму и выдать сдачу</small></span>
              </label>
              <label className={paymentMethod === "card" ? "payment-option selected" : "payment-option"}>
                <input
                  type="radio"
                  name={`payment-method-${draft.id}`}
                  value="card"
                  checked={paymentMethod === "card"}
                  onChange={() => setPaymentMethod("card")}
                />
                <span><strong>Карта</strong><small>Учебная симуляция ответа терминала</small></span>
              </label>
            </fieldset>
            {paymentMethod === "cash" ? (
              <div className="cash-payment">
                <label htmlFor={`cash-received-${draft.id}`}>Получено от покупателя</label>
                <div className="cash-input-wrap">
                  <input
                    id={`cash-received-${draft.id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Например, 1000"
                    value={cashInput}
                    onChange={(event) => setCashInput(event.target.value)}
                    aria-describedby={`cash-change-${draft.id}`}
                  />
                  <span>₽</span>
                </div>
                <p id={`cash-change-${draft.id}`} className={cashShort ? "cash-change insufficient" : "cash-change"} aria-live="polite">
                  {!validCash
                    ? "Введите сумму, полученную от покупателя."
                    : cashShort
                      ? `Не хватает ${currency((totalCents - cashCents) / 100)}`
                      : `Сдача: ${currency(changeCents / 100)}`}
                </p>
                <button
                  className="button primary"
                  disabled={busy || !validCash || cashShort}
                  onClick={() => onFinish("pay", { payment_method: "cash", cash_received: normalizedCash })}
                >
                  {busy ? "Обработка…" : "Принять наличные"}
                </button>
              </div>
            ) : (
              <div className="card-payment">
                <p>Реального списания средств нет. Сервер сохраняет только результат учебной симуляции.</p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => onFinish("pay", { payment_method: "card_simulated" })}
                >
                  {busy ? "Терминал обрабатывает…" : "Симулировать одобрение карты"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => onFinish("pay", { payment_method: "card_simulated", card_outcome: "declined" })}
                >
                  Показать отказ терминала
                </button>
              </div>
            )}
            <button className="button secondary" disabled={busy} onClick={() => onFinish("cancel")}>Отменить чек</button>
          </>
        ) : (
          <>
            <button className="button primary" disabled={busy || !cart.length} onClick={onPrepare}>
              {busy ? "Обработка…" : creating ? "Проверить создание чека" : "Сформировать чек"}
              <ArrowUpRight size={18} />
            </button>
            <p className="cart-hint">
              {creating
                ? "Исход запроса неизвестен. Повтор использует тот же номер запроса."
                : "Точная сумма фиксируется сервером при формировании чека."}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

const lineShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  quantity: PropTypes.number.isRequired,
});

CartPanel.propTypes = {
  cart: PropTypes.arrayOf(lineShape).isRequired,
  draft: PropTypes.shape({
    id: PropTypes.number.isRequired,
    total: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({
      product_id: PropTypes.number.isRequired,
      product_name: PropTypes.string.isRequired,
      unit_price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      quantity: PropTypes.number.isRequired,
    })).isRequired,
  }),
  busy: PropTypes.bool.isRequired,
  creating: PropTypes.bool.isRequired,
  locked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  onPrepare: PropTypes.func.isRequired,
  onFinish: PropTypes.func.isRequired,
};
