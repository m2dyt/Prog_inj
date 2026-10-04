import { useCallback, useState } from "react";
import { api } from "../api";

export function useReceipts(token, onUnauthorized) {
  const [receipts, setReceipts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadReceipts = useCallback(
    async (before) => {
      setBusy(true);
      setError("");
      try {
        const data = await api(`/receipts?limit=24${before ? `&before=${before}` : ""}`, { token });
        setReceipts((old) => (before ? [...old, ...data.items] : data.items));
        setCursor(data.next_cursor);
      } catch (err) {
        if (err.status === 401) onUnauthorized?.();
        setError(err.message || "Не удалось загрузить историю чеков");
      } finally {
        setBusy(false);
      }
    },
    [token, onUnauthorized]
  );

  const inspectReceipt = useCallback(
    async (id) => {
      setError("");
      try {
        const item = await api(`/receipts/${id}`, { token });
        setSelected(item);
        return item;
      } catch (err) {
        if (err.status === 401) onUnauthorized?.();
        setError(err.message || "Не удалось открыть чек");
        throw err;
      }
    },
    [token, onUnauthorized]
  );

  const clear = useCallback(() => {
    setReceipts([]);
    setCursor(null);
    setSelected(null);
    setError("");
  }, []);

  return {
    receipts,
    cursor,
    selected,
    setSelected,
    busy,
    error,
    setError,
    loadReceipts,
    inspectReceipt,
    clear,
  };
}
