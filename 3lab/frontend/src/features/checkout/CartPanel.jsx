import PropTypes from "prop-types";
import { ArrowUpRight, Minus, Plus, ShoppingBasket } from "lucide-react";

import { cents, currency } from "../../api";

export default function CartPanel({ cart, draft, busy, creating, locked, onChange, onPrepare, onFinish }) {
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
            <p className="cart-hint">Подтвердите получение наличных. Остатки спишутся после подтверждения.</p>
            <button className="button primary" disabled={busy} onClick={() => onFinish("pay")}>
              {busy ? "Обработка…" : "Наличные получены"}
            </button>
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
