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
      brand: form.get("brand") || null,
      description: form.get("description") || null,
      ingredients: form.get("ingredients") || null,
      proteins: form.get("proteins") || null,
      fats: form.get("fats") || null,
      carbohydrates: form.get("carbohydrates") || null,
      calories: form.get("calories") || null,
      image_url: form.get("image_url") || null,
      source_url: form.get("source_url") || null,
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
        <details className="product-extra-fields">
          <summary>Фото, состав и КБЖУ</summary>
          <label>Бренд<input name="brand" defaultValue={product.brand || ""} maxLength={100} /></label>
          <label>Описание<textarea name="description" defaultValue={product.description || ""} maxLength={2000} rows={3} /></label>
          <label>Состав<textarea name="ingredients" defaultValue={product.ingredients || ""} maxLength={6000} rows={4} /></label>
          <div className="nutrition-inputs">
            <label>Белки, г<input name="proteins" type="number" defaultValue={product.proteins ?? ""} min="0" max="1000" step="0.01" /></label>
            <label>Жиры, г<input name="fats" type="number" defaultValue={product.fats ?? ""} min="0" max="1000" step="0.01" /></label>
            <label>Углеводы, г<input name="carbohydrates" type="number" defaultValue={product.carbohydrates ?? ""} min="0" max="1000" step="0.01" /></label>
            <label>Ккал<input name="calories" type="number" defaultValue={product.calories ?? ""} min="0" max="10000" step="0.01" /></label>
          </div>
          <label>HTTPS-ссылка на фото<input name="image_url" type="url" defaultValue={product.image_url || ""} maxLength={2048} /></label>
          <label>Источник данных<input name="source_url" type="url" defaultValue={product.source_url || ""} maxLength={2048} /></label>
        </details>
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
    brand: PropTypes.string,
    description: PropTypes.string,
    ingredients: PropTypes.string,
    proteins: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    fats: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    carbohydrates: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    calories: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    image_url: PropTypes.string,
    source_url: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    stock: PropTypes.number,
    active: PropTypes.bool,
    version: PropTypes.number,
  }).isRequired,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
