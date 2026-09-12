import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { X } from "lucide-react";

import { api } from "../api";

export default function ProductEditor({ product, token, onClose, onSaved }) {
  const dialog = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      barcode: form.get("barcode"),
      category: form.get("category"),
      price: form.get("price"),
    };
    if (product.id) {
      Object.assign(body, {
        version: product.version,
        active: form.get("active") === "on",
      });
    }
    try {
      await api(`/products${product.id ? `/${product.id}` : ""}`, {
        token,
        method: product.id ? "PUT" : "POST",
        body,
      });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function adjust(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/products/${product.id}/stock`, {
        token,
        method: "POST",
        body: { delta: Number(form.get("delta")), reason: form.get("reason") },
      });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-labelledby="edit-title"
      onCancel={onClose}
    >
      <header>
        <h2 id="edit-title">{product.id ? "Карточка товара" : "Новый товар"}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </header>
      <form onSubmit={submit}>
        <label>
          Название
          <input name="name" defaultValue={product.name} minLength={2} maxLength={160} required />
        </label>
        <label>
          Штрихкод
          <input name="barcode" defaultValue={product.barcode} pattern="[0-9]{8,14}" required />
        </label>
        <label>
          Категория
          <input
            name="category"
            defaultValue={product.category}
            minLength={2}
            maxLength={60}
            required
            list="categories"
          />
          <datalist id="categories">
            {["Молочные продукты", "Хлеб и выпечка", "Овощи и фрукты", "Напитки", "Бакалея"].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </datalist>
        </label>
        <label>
          Цена, ₽
          <input
            type="number"
            name="price"
            defaultValue={product.price}
            min="0.01"
            max="999999.99"
            step="0.01"
            required
          />
        </label>
        {product.id && (
          <label className="checkbox">
            <input name="active" type="checkbox" defaultChecked={product.active} /> Товар активен
          </label>
        )}
        <button className="button primary" disabled={busy}>Сохранить</button>
      </form>
      {product.id && (
        <form className="stock-form" onSubmit={adjust}>
          <h3>Изменить остаток · {product.stock} шт.</h3>
          <label>
            Количество со знаком
            <input name="delta" type="number" min="-1000000" max="1000000" step="1" required />
          </label>
          <label>
            Основание
            <input name="reason" minLength={5} maxLength={200} required />
          </label>
          <button className="button secondary" disabled={busy}>Провести изменение</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </dialog>
  );
}

ProductEditor.propTypes = {
  product: PropTypes.shape({
    id: PropTypes.number,
    name: PropTypes.string,
    barcode: PropTypes.string,
    category: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stock: PropTypes.number,
    active: PropTypes.bool,
    version: PropTypes.number,
  }).isRequired,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
