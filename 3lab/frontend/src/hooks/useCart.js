import { useCallback, useRef, useState } from "react";
import { api } from "../api";

export function useCart(token, onUnauthorized, onRefreshCatalog) {
  const [cart, setCart] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(null);

  const locked = Boolean(draft) || busy || creating;

  const clearCart = useCallback(() => {
    setCart([]);
    setDraft(null);
    requestId.current = null;
    setCreating(false);
    setBusy(false);
  }, []);

  const add = useCallback((product) => {
    if (locked) return;
    requestId.current = null;
    setCart((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) {
        return items.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock, 10000) }
            : item
        );
      }
      return items.length < 100 ? [...items, { ...product, quantity: 1 }] : items;
    });
  }, [locked]);

  const change = useCallback((id, delta) => {
    if (locked) return;
    requestId.current = null;
    setCart((items) =>
      items
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.min(item.quantity + delta, item.stock, 10000) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, [locked]);

  const prepare = useCallback(async () => {
    if (!cart.length || busy) return null;
    setBusy(true);
    setCreating(true);
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
      return result;
    } catch (requestError) {
      if (requestError.status && requestError.status < 500) {
        setCreating(false);
        requestId.current = null;
      }
      if (requestError.status === 401) onUnauthorized();
      throw requestError;
    } finally {
      setBusy(false);
    }
  }, [cart, busy, token, onUnauthorized]);

  const finish = useCallback(async (action) => {
    if (!draft) return null;
    setBusy(true);
    try {
      const result = await api(`/receipts/${draft.id}/${action}`, {
        token,
        method: "POST",
      });
      setDraft(null);
      setCart([]);
      requestId.current = null;
      onRefreshCatalog?.();
      return result;
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      throw requestError;
    } finally {
      setBusy(false);
    }
  }, [draft, token, onUnauthorized, onRefreshCatalog]);

  const resumeDraft = useCallback((existingDraft) => {
    setDraft(existingDraft);
  }, []);

  return {
    cart,
    draft,
    busy,
    creating,
    locked,
    add,
    change,
    prepare,
    finish,
    resumeDraft,
    clearCart,
  };
}
