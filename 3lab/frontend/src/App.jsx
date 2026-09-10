import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  ShoppingBasket,
  LayoutGrid,
  ReceiptText,
  LogOut,
  Minus,
  Plus,
  X,
  Check,
  ArrowUpRight,
} from "lucide-react";
import Catalog from "./Catalog";
import { api, cents, currency } from "./api";

function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          password: form.get("password"),
        },
      });
      await onLogin(result.access_token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-intro">
        <div className="brand">
          <ShoppingBasket /> маркет<span>36</span>
        </div>
        <p className="eyebrow">СИСТЕМА СУПЕРМАРКЕТА</p>
        <h1>
          Порядок в товарах.
          <br />
          Лёгкость в работе.
        </h1>
        <p>Каталог, остатки и продажи — в одном рабочем пространстве.</p>
        <div className="login-decoration" aria-hidden="true">
          <ShoppingBasket size={140} strokeWidth={1} />
        </div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <p className="eyebrow">С ВОЗВРАЩЕНИЕМ</p>
        <h2>Вход в систему</h2>
        <p className="muted">Используйте учётную запись сотрудника.</p>
        <label>
          Логин
          <input
            name="username"
            autoComplete="username"
            pattern="[a-z][a-z0-9_]{2,49}"
            required
            autoFocus
          />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
          <ArrowUpRight size={18} />
        </button>
        <small>Учебная информационная система · Вариант 36</small>
      </form>
    </main>
  );
}
Login.propTypes = { onLogin: PropTypes.func.isRequired };

function ProductEditor({ product, token, onClose, onSaved }) {
  const dialog = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      barcode: form.get("barcode"),
      category: form.get("category"),
      price: form.get("price"),
    };
    if (product.id)
      Object.assign(body, {
        version: product.version,
        active: form.get("active") === "on",
      });
    try {
      await api(`/products${product.id ? `/${product.id}` : ""}`, {
        token,
        method: product.id ? "PUT" : "POST",
        body,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function adjust(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await api(`/products/${product.id}/stock`, {
        token,
        method: "POST",
        body: { delta: Number(form.get("delta")), reason: form.get("reason") },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
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
        <h2 id="edit-title">
          {product.id ? "Карточка товара" : "Новый товар"}
        </h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </header>
      <form onSubmit={submit}>
        <label>
          Название
          <input
            name="name"
            defaultValue={product.name}
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          Штрихкод
          <input
            name="barcode"
            defaultValue={product.barcode}
            pattern="[0-9]{8,14}"
            required
          />
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
            {[
              "Молочные продукты",
              "Хлеб и выпечка",
              "Овощи и фрукты",
              "Напитки",
              "Бакалея",
            ].map((c) => (
              <option key={c}>{c}</option>
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
            <input
              name="active"
              type="checkbox"
              defaultChecked={product.active}
            />{" "}
            Товар активен
          </label>
        )}
        <button className="button primary" disabled={busy}>
          Сохранить
        </button>
      </form>
      {product.id && (
        <form className="stock-form" onSubmit={adjust}>
          <h3>Изменить остаток · {product.stock} шт.</h3>
          <label>
            Количество со знаком
            <input
              name="delta"
              type="number"
              min="-1000000"
              max="1000000"
              step="1"
              required
            />
          </label>
          <label>
            Основание
            <input name="reason" minLength={5} maxLength={200} required />
          </label>
          <button className="button secondary" disabled={busy}>
            Провести изменение
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
ProductEditor.propTypes = {
  product: PropTypes.object.isRequired,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

export default function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("catalog");
  const [cart, setCart] = useState([]);
  const [draft, setDraft] = useState(null);
  const requestId = useRef(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [receiptCursor, setReceiptCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const reset = useCallback(() => {
    setToken("");
    setUser(null);
    setCart([]);
    setDraft(null);
    requestId.current = null;
    setCreating(false);
    setEditor(null);
    setNotice("");
    setError("");
    setSelected(null);
    setReceipts([]);
    setTab("catalog");
  }, []);
  const handleError = (e) => {
    if (e.status === 401) reset();
    else setError(e.message);
  };
  async function login(value) {
    const me = await api("/auth/me", { token: value });
    setToken(value);
    setUser(me);
  }
  async function logout() {
    try {
      await api("/auth/logout", { token, method: "POST" });
    } finally {
      reset();
    }
  }
  const total = cart.reduce((s, i) => s + cents(i.price) * i.quantity, 0) / 100;
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const locked = !!draft || busy || creating;
  function add(product) {
    if (locked) return;
    setNotice("");
    requestId.current = null;
    setCart((items) => {
      const old = items.find((i) => i.id === product.id);
      return old
        ? items.map((i) =>
            i.id === product.id
              ? {
                  ...i,
                  quantity: Math.min(i.quantity + 1, product.stock, 10000),
                }
              : i,
          )
        : items.length < 100
          ? [...items, { ...product, quantity: 1 }]
          : items;
    });
  }
  function change(id, delta) {
    if (locked) return;
    requestId.current = null;
    setCart((items) =>
      items
        .map((i) =>
          i.id === id
            ? { ...i, quantity: Math.min(i.quantity + delta, i.stock, 10000) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }
  async function prepare() {
    if (!cart.length || busy) return;
    setBusy(true);
    setCreating(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result = await api("/receipts", {
        token,
        method: "POST",
        body: {
          request_id: requestId.current,
          items: cart.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        },
      });
      setDraft(result);
      setCreating(false);
    } catch (e) {
      if (e.status && e.status < 500) {
        setCreating(false);
        requestId.current = null;
      }
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function finish(action) {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/receipts/${draft.id}/${action}`, {
        token,
        method: "POST",
      });
      setNotice(
        result.status === "paid"
          ? `Чек №${result.id} оплачен · ${currency(result.total)}`
          : `Чек №${result.id} отменён`,
      );
      setDraft(null);
      setCart([]);
      requestId.current = null;
      setRefresh((n) => n + 1);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function loadReceipts(before) {
    setTab("receipts");
    setBusy(true);
    setError("");
    try {
      const data = await api(
        `/receipts?limit=24${before ? `&before=${before}` : ""}`,
        { token },
      );
      setReceipts((old) => (before ? [...old, ...data.items] : data.items));
      setReceiptCursor(data.next_cursor);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function inspectReceipt(id) {
    setError("");
    try {
      setSelected(await api(`/receipts/${id}`, { token }));
    } catch (e) {
      handleError(e);
    }
  }
  if (!user) return <Login onLogin={login} />;
  const saleAllowed = user.role !== "auditor";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <ShoppingBasket /> маркет<span>36</span>
        </div>
        <p className="sidebar-caption">УПРАВЛЕНИЕ МАГАЗИНОМ</p>
        <nav>
          <button
            className={tab === "catalog" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("catalog")}
          >
            <LayoutGrid size={20} /> Каталог товаров
          </button>
          <button
            className={tab === "receipts" ? "nav-item active" : "nav-item"}
            onClick={() => loadReceipts()}
          >
            <ReceiptText size={20} /> История чеков
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="dot" /> Единая база товаров
          <p>
            Точные остатки.
            <br />
            Понятные продажи.
          </p>
        </div>
        <div className="profile">
          <span className="avatar">{user.display_name.slice(0, 1)}</span>
          <div>
            <strong>{user.display_name}</strong>
            <small>
              {
                { manager: "Менеджер", cashier: "Кассир", auditor: "Аудитор" }[
                  user.role
                ]
              }
            </small>
          </div>
          <button className="icon-button" onClick={logout} aria-label="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            Супермаркет <span className="topbar-divider">/</span>{" "}
            {tab === "catalog" ? "Товары" : "Продажи"}
          </span>
          <span className="location">
            <span className="dot" /> Магазин №36
          </span>
        </header>
        {notice && (
          <div className="notice" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label="Скрыть ошибку"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {tab === "catalog" ? (
          <>
            <Catalog
              token={token}
              onAdd={saleAllowed ? add : undefined}
              onEdit={user.role === "manager" ? setEditor : undefined}
              onUnauthorized={reset}
              cart={cart}
              refreshKey={refresh}
              disabled={locked}
            />
            {user.role === "manager" && (
              <div className="manager-actions">
                <button
                  className="button secondary"
                  onClick={() => setEditor({})}
                >
                  <Plus size={16} /> Новый товар
                </button>
              </div>
            )}
          </>
        ) : (
          <section className="receipts">
            <p className="eyebrow">ПРОДАЖИ</p>
            <h1>История чеков</h1>
            <p className="muted">
              {user.role === "cashier"
                ? "Чеки вашей учётной записи"
                : "Все чеки магазина"}
            </p>
            <div className="receipt-list">
              {receipts.map((r) => (
                <button key={r.id} onClick={() => inspectReceipt(r.id)}>
                  <ReceiptText />
                  <strong>Чек №{r.id}</strong>
                  <span>{new Date(r.created_at).toLocaleString("ru-RU")}</span>
                  <span className={`status ${r.status}`}>
                    {
                      {
                        draft: "Черновик",
                        paid: "Оплачен",
                        cancelled: "Отменён",
                      }[r.status]
                    }
                  </span>
                </button>
              ))}
            </div>
            {!busy && receipts.length === 0 && <p>Чеков пока нет.</p>}
            {receiptCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => loadReceipts(receiptCursor)}
              >
                Загрузить ещё
              </button>
            )}
            {selected && (
              <article className="receipt-detail">
                <h2>Чек №{selected.id}</h2>
                {selected.items.map((i) => (
                  <p key={i.product_id}>
                    {i.product_name} × {i.quantity}
                    <strong>{currency(i.line_total)}</strong>
                  </p>
                ))}
                <p>
                  Итого<strong>{currency(selected.total)}</strong>
                </p>
                {selected.status === "draft" && saleAllowed && (
                  <button
                    className="button primary"
                    disabled={locked || cart.length > 0}
                    onClick={() => {
                      setDraft(selected);
                      setTab("catalog");
                    }}
                  >
                    Продолжить продажу
                  </button>
                )}
              </article>
            )}
          </section>
        )}
        <footer className="page-footer">
          Маркет · Рабочее пространство магазина<span>Вариант 36</span>
        </footer>
      </div>
      {saleAllowed && (
        <aside className="cart">
          <div className="cart-header">
            <div>
              <h2>Текущая продажа</h2>
              <p>{draft ? `Чек №${draft.id}` : "Новый чек"}</p>
            </div>
            <span className="cart-count">
              {draft ? draft.items.reduce((s, i) => s + i.quantity, 0) : count}
            </span>
          </div>
          <div className="cart-lines">
            {!cart.length && !draft ? (
              <div className="cart-empty">
                <ShoppingBasket size={44} strokeWidth={1.2} />
                <h3>Здесь будет покупка</h3>
                <p>Добавляйте товары из каталога с помощью кнопки «+».</p>
              </div>
            ) : (
              (draft
                ? draft.items.map((i) => ({
                    id: i.product_id,
                    name: i.product_name,
                    price: i.unit_price,
                    quantity: i.quantity,
                  }))
                : cart
              ).map((i) => (
                <article className="cart-line" key={i.id}>
                  <h3>{i.name}</h3>
                  <span>{currency(i.price)} / шт.</span>
                  <div>
                    <div className="quantity">
                      <button
                        disabled={locked}
                        onClick={() => change(i.id, -1)}
                        aria-label={`Уменьшить ${i.name}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        disabled={locked}
                        onClick={() => change(i.id, 1)}
                        aria-label={`Увеличить ${i.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong>
                      {currency((cents(i.price) * i.quantity) / 100)}
                    </strong>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="cart-total">
            <p>
              <span>{draft ? "К оплате" : "Предварительный итог"}</span>
              <strong>{currency(draft ? draft.total : total)}</strong>
            </p>
            {draft ? (
              <>
                <p className="cart-hint">
                  Подтвердите получение наличных. Остатки спишутся после
                  подтверждения.
                </p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => finish("pay")}
                >
                  {busy ? "Обработка…" : "Наличные получены"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => finish("cancel")}
                >
                  Отменить чек
                </button>
              </>
            ) : (
              <>
                <button
                  className="button primary"
                  disabled={busy || !cart.length}
                  onClick={prepare}
                >
                  {busy
                    ? "Обработка…"
                    : creating
                      ? "Проверить создание чека"
                      : "Сформировать чек"}
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
      )}
      {editor && (
        <ProductEditor
          product={editor}
          token={token}
          onClose={() => setEditor(null)}
          onSaved={() => setRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
