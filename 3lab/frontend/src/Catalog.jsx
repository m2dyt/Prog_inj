import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  Search,
  Plus,
  Package,
  ChevronRight,
  ArrowLeft,
  SlidersHorizontal,
  Pencil,
} from "lucide-react";
import { api, currency, validateProductPage } from "./api";

const productShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  barcode: PropTypes.string.isRequired,
  category: PropTypes.string.isRequired,
  brand: PropTypes.string,
  image_url: PropTypes.string,
  price: PropTypes.string.isRequired,
  stock: PropTypes.number.isRequired,
  active: PropTypes.bool.isRequired,
  version: PropTypes.number.isRequired,
});
const categoryColors = {
  "Молочные продукты": "milk",
  "Хлеб и выпечка": "bread",
  "Овощи и фрукты": "fruit",
  Напитки: "drinks",
};

export function ProductCard({
  product,
  onAdd,
  onEdit,
  onDetails,
  quantity = 0,
  disabled = false,
}) {
  return (
    <article className="product-card">
      <button
        type="button"
        className="product-details-trigger"
        onClick={() => onDetails?.(product)}
        aria-label={`Открыть карточку товара ${product.name}`}
      >
        <div className={`product-art ${categoryColors[product.category] || "other"}`}>
          {product.image_url ? (
            <img src={product.image_url} alt="" loading="lazy" onError={(event) => { event.currentTarget.closest(".product-art")?.classList.add("image-failed"); event.currentTarget.remove(); }} />
          ) : (
            <Package size={48} strokeWidth={1.25} aria-hidden="true" />
          )}
          <span>{product.category}</span>
        </div>
        <h3>{product.name}</h3>
        <span className="details-link">Состав · КБЖУ · штрихкод</span>
      </button>
      <div className="product-info">
        <div className="product-meta">
          <span>{product.barcode}</span>
          <span className={product.stock === 0 ? "stock empty" : "stock"}>
            {product.stock === 0 ? "Нет в наличии" : `${product.stock} шт.`}
          </span>
        </div>
        <p className="unit">Цена за 1 шт.</p>
        <div className="product-bottom">
          <strong>{currency(product.price)}</strong>
          <div className="card-actions">
            {onEdit && (
              <button
                className="icon-button edit"
                aria-label={`Изменить ${product.name}`}
                onClick={() => onEdit(product)}
              >
                <Pencil size={17} />
              </button>
            )}
            {onAdd && (
              <button
                className="icon-button add"
                onClick={() => onAdd(product)}
                disabled={
                  disabled || !product.active || product.stock <= quantity
                }
                aria-label={`Добавить ${product.name}`}
              >
                <Plus size={20} />
              </button>
            )}
          </div>
        </div>
        {quantity > 0 && (
          <span className="in-cart">В корзине: {quantity} шт.</span>
        )}
      </div>
    </article>
  );
}
ProductCard.propTypes = {
  product: productShape.isRequired,
  onAdd: PropTypes.func,
  onEdit: PropTypes.func,
  onDetails: PropTypes.func,
  quantity: PropTypes.number,
  disabled: PropTypes.bool,
};

export default function Catalog({
  token,
  onAdd,
  onEdit,
  onUnauthorized,
  onDetails,
  cart = [],
  refreshKey = 0,
  disabled = false,
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState([]);
  const [state, setState] = useState({
    items: [],
    next_cursor: null,
    loading: true,
    error: "",
  });
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setCursor(0);
      setHistory([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    if (q && q.length < 3) {
      setState({ items: [], next_cursor: null, loading: false, error: "" });
      return () => controller.abort();
    }
    setState((s) => ({ ...s, loading: true, error: "" }));
    const params = new URLSearchParams({
      q,
      category,
      after: String(cursor),
      limit: "24",
    });
    api(`/products?${params}`, { token, signal: controller.signal })
      .then(validateProductPage)
      .then((data) => {
        if (sequence.current === current)
          setState({ ...data, loading: false, error: "" });
      })
      .catch((error) => {
        if (error.name === "AbortError" || sequence.current !== current) return;
        if (error.status === 401) onUnauthorized();
        setState({
          items: [],
          next_cursor: null,
          loading: false,
          error: error.message || "Не удалось загрузить каталог",
        });
      });
    return () => controller.abort();
  }, [q, category, cursor, token, refreshKey, retry, onUnauthorized]);
  const selectCategory = (value) => {
    setCategory(value);
    setCursor(0);
    setHistory([]);
  };
  return (
    <section className="catalog" aria-label="Каталог товаров">
      <div className="section-heading">
        <div>
          <p className="eyebrow">РАБОЧЕЕ МЕСТО</p>
          <h1>Каталог товаров</h1>
          <p className="muted">Всё для покупок, которые радуют каждый день.</p>
        </div>
        <span className="quiet-badge">
          <SlidersHorizontal size={15} /> Поиск и фильтры
        </span>
      </div>
      <div className="search-row">
        <label className="search-box">
          <Search size={20} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название или полный штрихкод"
            aria-label="Поиск товара"
            maxLength={160}
          />
          <kbd>Поиск</kbd>
        </label>
        <label className="select-box">
          <span className="sr-only">Категория</span>
          <select
            value={category}
            onChange={(e) => selectCategory(e.target.value)}
          >
            <option value="">Все категории</option>
            {Object.keys(categoryColors).map((name) => (
              <option key={name}>{name}</option>
            ))}
            <option>Бакалея</option>
          </select>
        </label>
      </div>
      <div className="catalog-summary">
        <span>
          {q && q.length < 3
            ? "Введите не менее трёх символов"
            : category || "Все товары"}
        </span>
        <span>Страница {history.length + 1} · до 24 товаров</span>
      </div>
      <div className="catalog-content" aria-busy={state.loading}>
        {state.loading ? (
          <div className="product-grid" aria-label="Загрузка товаров">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : state.error ? (
          <div className="empty-state" role="alert">
            <Package />
            <h2>Не удалось загрузить товары</h2>
            <p>{state.error}</p>
            <button
              className="button secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Повторить
            </button>
          </div>
        ) : !state.items.length ? (
          <div className="empty-state" role="status">
            <Search />
            <h2>
              {q && q.length < 3 ? "Уточните запрос" : "Товары не найдены"}
            </h2>
            <p>Попробуйте другое название или выберите все категории.</p>
          </div>
        ) : (
          <div className="product-grid">
            {state.items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={onAdd}
                onEdit={onEdit}
                onDetails={onDetails}
                disabled={disabled}
                quantity={cart.find((i) => i.id === product.id)?.quantity || 0}
              />
            ))}
          </div>
        )}
      </div>
      <nav className="pagination" aria-label="Страницы каталога">
        <button
          className="button secondary"
          disabled={state.loading || history.length === 0}
          onClick={() => {
            setCursor(history.at(-1));
            setHistory((h) => h.slice(0, -1));
          }}
        >
          <ArrowLeft size={16} /> Назад
        </button>
        <span aria-live="polite">
          {state.loading ? "Загрузка…" : `Показано: ${state.items.length}`}
        </span>
        <button
          className="button secondary"
          disabled={state.loading || state.next_cursor === null}
          onClick={() => {
            setHistory((h) => [...h, cursor]);
            setCursor(state.next_cursor);
          }}
        >
          Далее <ChevronRight size={16} />
        </button>
      </nav>
    </section>
  );
}
Catalog.propTypes = {
  token: PropTypes.string.isRequired,
  onAdd: PropTypes.func,
  onEdit: PropTypes.func,
  onUnauthorized: PropTypes.func.isRequired,
  onDetails: PropTypes.func,
  cart: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      quantity: PropTypes.number.isRequired,
    }),
  ),
  refreshKey: PropTypes.number,
  disabled: PropTypes.bool,
};
