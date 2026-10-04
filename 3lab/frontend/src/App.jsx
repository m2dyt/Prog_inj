import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus, ScanLine, X } from "lucide-react";

import Catalog from "./Catalog";
import { api, currency } from "./api";
import Login from "./components/Login";
import ProductEditor from "./components/ProductEditor";
import ProductDetailsDialog from "./components/ProductDetailsDialog";
import WorkspaceNav from "./components/WorkspaceNav";
import CartPanel from "./features/checkout/CartPanel";
import ReceiptHistory from "./features/receipts/ReceiptHistory";

export default function App() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("market_auth_token") || "";
    } catch {
      return "";
    }
  });
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(() => {
    try {
      return Boolean(localStorage.getItem("market_auth_token"));
    } catch {
      return false;
    }
  });
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
    try {
      localStorage.removeItem("market_auth_token");
    } catch {
      // ignore storage error
    }
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

  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("market_auth_token") || "";
    } catch {
      saved = "";
    }
    if (!saved) {
      setInitializing(false);
      return;
    }
    let active = true;
    api("/auth/me", { token: saved })
      .then((me) => {
        if (active) {
          setToken(saved);
          setUser(me);
          setInitializing(false);
        }
      })
      .catch(() => {
        if (active) {
          reset();
          setInitializing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reset]);

  function handleError(requestError) {
    if (requestError.status === 401) reset();
    else setError(requestError.message);
  }

  async function login(value) {
    const me = await api("/auth/me", { token: value });
    try {
      localStorage.setItem("market_auth_token", value);
    } catch {
      // ignore storage error
    }
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

  function playScannerBeep(success = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1750, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  const add = useCallback((product) => {
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
  }, [locked]);

  const handleBarcodeScanned = useCallback(async (barcode) => {
    if (locked) {
      playScannerBeep(false);
      setError("Касса занята оформлением чека. Завершите или отмените текущий чек перед сканированием.");
      return;
    }
    setError("");
    try {
      const res = await api(`/products?q=${encodeURIComponent(barcode)}&limit=1`, { token });
      const found = res.items?.find((p) => p.barcode === barcode) || res.items?.[0];
      if (!found || found.barcode !== barcode) {
        playScannerBeep(false);
        setError(`Товар со штрихкодом "${barcode}" не найден в каталоге`);
        return;
      }
      if (!found.active) {
        playScannerBeep(false);
        setError(`Товар "${found.name}" снят с продажи (архивирован)`);
        return;
      }
      const currentQty = cart.find((item) => item.id === found.id)?.quantity || 0;
      if (currentQty >= found.stock) {
        playScannerBeep(false);
        setError(`Товар "${found.name}" закончился на складе (в наличии ${found.stock} шт.)`);
        return;
      }
      add(found);
      playScannerBeep(true);
      setNotice(`Отсканировано: ${found.name} (${currency(found.price)})`);
      setTab("catalog");
    } catch (requestError) {
      playScannerBeep(false);
      handleError(requestError);
    }
  }, [locked, token, cart, add]);

  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    if (!user || user.role === "auditor") return;

    function onKeyDown(e) {
      const target = e.target;
      const isModal = Boolean(target?.closest?.(".product-dialog, .product-details-dialog"));
      if (isModal) return;

      const isSearchBox = target?.getAttribute?.("aria-label") === "Поиск товара";
      const now = Date.now();
      const delta = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        const rawCode = barcodeBuffer.current.trim();
        barcodeBuffer.current = "";
        if (/^\d{8,14}$/.test(rawCode)) {
          e.preventDefault();
          handleBarcodeScanned(rawCode);
          return;
        }
        if (isSearchBox && target?.value && /^\d{8,14}$/.test(target.value.trim())) {
          e.preventDefault();
          handleBarcodeScanned(target.value.trim());
          return;
        }
        return;
      }

      if (e.key.length === 1 && /^\d$/.test(e.key)) {
        if (delta > 120 && !isSearchBox) {
          barcodeBuffer.current = e.key;
        } else {
          barcodeBuffer.current += e.key;
        }
      } else if (e.key.length === 1 && !/^\d$/.test(e.key) && !isSearchBox) {
        barcodeBuffer.current = "";
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user, handleBarcodeScanned]);

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

  if (initializing) {
    return (
      <div className="session-restoring">
        <p className="eyebrow">ВОССТАНОВЛЕНИЕ СЕССИИ…</p>
      </div>
    );
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
          <div className="topbar-right">
            {saleAllowed && (
              <span className="scanner-badge" title="Сканируйте штрихкоды товаров в любой момент для мгновенного добавления в чек">
                <ScanLine size={14} /> Сканер активен
              </span>
            )}
            <span className="location"><span className="dot" /> Магазин №36</span>
          </div>
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
