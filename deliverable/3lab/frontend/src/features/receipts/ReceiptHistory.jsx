import PropTypes from "prop-types";
import { ReceiptText } from "lucide-react";

import { currency } from "../../api";

const statusNames = { draft: "Черновик", paid: "Оплачен", cancelled: "Отменён" };

export default function ReceiptHistory({
  userRole,
  receipts,
  cursor,
  busy,
  selected,
  saleAllowed,
  canContinue,
  onLoadMore,
  onInspect,
  onContinue,
}) {
  return (
    <section className="receipts">
      <p className="eyebrow">ПРОДАЖИ</p>
      <h1>История чеков</h1>
      <p className="muted">{userRole === "cashier" ? "Чеки вашей учётной записи" : "Все чеки магазина"}</p>
      <div className="receipt-list">
        {receipts.map((receipt) => (
          <button key={receipt.id} onClick={() => onInspect(receipt.id)}>
            <ReceiptText />
            <strong>Чек №{receipt.id}</strong>
            <span>{new Date(receipt.created_at).toLocaleString("ru-RU")}</span>
            <span className={`status ${receipt.status}`}>{statusNames[receipt.status]}</span>
          </button>
        ))}
      </div>
      {!busy && receipts.length === 0 && <p>Чеков пока нет.</p>}
      {cursor && (
        <button className="button secondary" disabled={busy} onClick={onLoadMore}>
          Загрузить ещё
        </button>
      )}
      {selected && (
        <article className="receipt-detail">
          <h2>Чек №{selected.id}</h2>
          {selected.items.map((item) => (
            <p key={item.product_id}>
              {item.product_name} × {item.quantity}
              <strong>{currency(item.line_total)}</strong>
            </p>
          ))}
          <p>Итого<strong>{currency(selected.total)}</strong></p>
          {selected.status === "draft" && saleAllowed && (
            <button className="button primary" disabled={!canContinue} onClick={onContinue}>
              Продолжить продажу
            </button>
          )}
        </article>
      )}
    </section>
  );
}

const receiptSummary = PropTypes.shape({
  id: PropTypes.number.isRequired,
  status: PropTypes.oneOf(["draft", "paid", "cancelled"]).isRequired,
  created_at: PropTypes.string.isRequired,
});

ReceiptHistory.propTypes = {
  userRole: PropTypes.string.isRequired,
  receipts: PropTypes.arrayOf(receiptSummary).isRequired,
  cursor: PropTypes.number,
  busy: PropTypes.bool.isRequired,
  selected: PropTypes.shape({
    id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    total: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({
      product_id: PropTypes.number.isRequired,
      product_name: PropTypes.string.isRequired,
      quantity: PropTypes.number.isRequired,
      line_total: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    })).isRequired,
  }),
  saleAllowed: PropTypes.bool.isRequired,
  canContinue: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
  onInspect: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired,
};
