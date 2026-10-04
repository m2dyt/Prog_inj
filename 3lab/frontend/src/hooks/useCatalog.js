import { useEffect, useRef, useState } from "react";
import { api, validateProductPage } from "../api";

export function useCatalog({ token, refreshKey, onUnauthorized }) {
  const [search, setSearch] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState([]);
  const [state, setState] = useState({
    items: [],
    next_cursor: null,
    loading: true,
    error: "",
  });
  const [retryTrigger, setRetryTrigger] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(search.trim());
      setCursor(0);
      setHistory([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;

    if (debouncedQuery && debouncedQuery.length < 3) {
      setState({ items: [], next_cursor: null, loading: false, error: "" });
      return () => controller.abort();
    }

    setState((s) => ({ ...s, loading: true, error: "" }));
    const params = new URLSearchParams({
      q: debouncedQuery,
      category,
      after: String(cursor),
      limit: "24",
    });

    api(`/products?${params}`, { token, signal: controller.signal })
      .then(validateProductPage)
      .then((data) => {
        if (sequence.current === current) {
          setState({ ...data, loading: false, error: "" });
        }
      })
      .catch((err) => {
        if (err.name === "AbortError" || sequence.current !== current) return;
        if (err.status === 401) onUnauthorized?.();
        setState({
          items: [],
          next_cursor: null,
          loading: false,
          error: err.message || "Не удалось загрузить каталог",
        });
      });

    return () => controller.abort();
  }, [debouncedQuery, category, cursor, token, refreshKey, retryTrigger, onUnauthorized]);

  const selectCategory = (val) => {
    setCategory(val);
    setCursor(0);
    setHistory([]);
  };

  const goNext = () => {
    if (state.next_cursor === null || state.loading) return;
    setHistory((h) => [...h, cursor]);
    setCursor(state.next_cursor);
  };

  const goPrev = () => {
    if (history.length === 0 || state.loading) return;
    setCursor(history.at(-1));
    setHistory((h) => h.slice(0, -1));
  };

  const retry = () => setRetryTrigger((n) => n + 1);

  return {
    search,
    setSearch,
    debouncedQuery,
    category,
    selectCategory,
    cursor,
    history,
    items: state.items,
    nextCursor: state.next_cursor,
    loading: state.loading,
    error: state.error,
    goNext,
    goPrev,
    retry,
  };
}
