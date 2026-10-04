import { useCallback, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import Catalog from "./Catalog";
import { api, currency } from "./api";
import Login from "./components/Login";
import ProductEditor from "./components/ProductEditor";
import ProductDetailsDialog from "./components/ProductDetailsDialog";
import WorkspaceNav from "./components/WorkspaceNav";
import CartPanel from "./features/checkout/CartPanel";
import ReceiptHistory from "./features/receipts/ReceiptHistory";

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
  const [productDetailsId, setProductDetailsId] = useState(null);

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
    setProductDetailsId(null);
    setReceipts([]);
    setTab("catalog");
  }, []);

  function handleError(requestError) {
    if (requestError.status === 401) reset();
    else setError(requestError.message);
  }

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

  const locked = Boolean(draft) || busy || creating;

  function add(product) {
    if (locked) return;
    setNotice("");
    requestId.current = null;
    setCart((items) => {
      const old = items.find((item) => item.id === product.id);
      if (old) {
        return items.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock, 10000) }
            : item,
        );
      }
      return items.length < 100 ? [...items, { ...product, quantity: 1 }] : items;
    });
  }

  function change(id, delta) {
    if (locked) return;
    requestId.current = null;
    setCart((items) =>
      items
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.min(item.quantity + delta, item.stock, 10000) }
            : item,
        )
        .filter((item) => item.quantity > 0),
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
          items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        },
      });
      setDraft(result);
      setCreating(false);
    } catch (requestError) {
      if (requestError.status && requestError.status < 500) {
        setCreating(false);
        requestId.current = null;
      }
      handleError(requestError);
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
      setRefresh((value) => value + 1);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function loadReceipts(before) {
    setTab("receipts");
    setBusy(true);
    setError("");
    try {
      const data = await api(`/receipts?limit=24${before ? `&before=${before}` : ""}`, { token });
      setReceipts((old) => (before ? [...old, ...data.items] : data.items));
      setReceiptCursor(data.next_cursor);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function inspectReceipt(id) {
    setError("");
    try {
      setSelected(await api(`/receipts/${id}`, { token }));
    } catch (requestError) {
      handleError(requestError);
    }
  }

  if (!user) return <Login onLogin={login} />;

  const saleAllowed = user.role !== "auditor";
  return (
    <div className="workspace">
      <WorkspaceNav
        tab={tab}
        user={user}
        onCatalog={() => setTab("catalog")}
        onReceipts={() => loadReceipts()}
        onLogout={logout}
      />
      <div className="main-column">
        <header className="topbar">
          <span>
            Супермаркет <span className="topbar-divider">/</span>{" "}
            {tab === "catalog" ? "Товары" : "Продажи"}
          </span>
          <span className="location"><span className="dot" /> Магазин №36</span>
        </header>
        {notice && <div className="notice" role="status"><Check size={18} />{notice}</div>}
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button className="icon-button" onClick={() => setError("")} aria-label="Скрыть ошибку">
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
              onDetails={(product) => setProductDetailsId(product.id)}
              cart={cart}
              refreshKey={refresh}
              disabled={locked}
            />
            {user.role === "manager" && (
              <div className="manager-actions">
                <button className="button secondary" onClick={() => setEditor({})}>
                  <Plus size={16} /> Новый товар
                </button>
              </div>
            )}
          </>
        ) : (
          <ReceiptHistory
            userRole={user.role}
            receipts={receipts}
            cursor={receiptCursor}
            busy={busy}
            selected={selected}
            saleAllowed={saleAllowed}
            canContinue={!locked && cart.length === 0}
            onLoadMore={() => loadReceipts(receiptCursor)}
            onInspect={inspectReceipt}
            onContinue={() => {
              setDraft(selected);
              setTab("catalog");
            }}
          />
        )}
        <footer className="page-footer">Маркет · Рабочее пространство магазина<span>Вариант 36</span></footer>
      </div>
      {saleAllowed && (
        <CartPanel
          cart={cart}
          draft={draft}
          busy={busy}
          creating={creating}
          locked={locked}
          onChange={change}
          onPrepare={prepare}
          onFinish={finish}
        />
      )}
      {editor && (
        <ProductEditor
          product={editor}
          token={token}
          onClose={() => setEditor(null)}
          onSaved={() => setRefresh((value) => value + 1)}
        />
      )}
      {productDetailsId !== null && (
        <ProductDetailsDialog
          productId={productDetailsId}
          token={token}
          onClose={() => setProductDetailsId(null)}
          onUnauthorized={reset}
        />
      )}
    </div>
  );
}
