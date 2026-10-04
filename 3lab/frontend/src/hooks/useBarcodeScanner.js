import { useCallback, useEffect, useRef } from "react";
import { api, currency } from "../api";

export function playScannerBeep(success = true) {
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

export function useBarcodeScanner({
  enabled,
  locked,
  token,
  cart,
  onAddProduct,
  onSuccessNotice,
  onError,
}) {
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  const handleBarcodeScanned = useCallback(
    async (barcode) => {
      if (locked) {
        playScannerBeep(false);
        onError?.("Касса занята оформлением чека. Завершите или отмените текущий чек перед сканированием.");
        return;
      }
      try {
        const res = await api(`/products?q=${encodeURIComponent(barcode)}&limit=1`, { token });
        const found = res.items?.find((p) => p.barcode === barcode) || res.items?.[0];
        if (!found || found.barcode !== barcode) {
          playScannerBeep(false);
          onError?.(`Товар со штрихкодом "${barcode}" не найден в каталоге`);
          return;
        }
        if (!found.active) {
          playScannerBeep(false);
          onError?.(`Товар "${found.name}" снят с продажи (архивирован)`);
          return;
        }
        const currentQty = cart.find((item) => item.id === found.id)?.quantity || 0;
        if (currentQty >= found.stock) {
          playScannerBeep(false);
          onError?.(`Товар "${found.name}" закончился на складе (в наличии ${found.stock} шт.)`);
          return;
        }
        onAddProduct?.(found);
        playScannerBeep(true);
        onSuccessNotice?.(`Отсканировано: ${found.name} (${currency(found.price)})`);
      } catch (requestError) {
        playScannerBeep(false);
        onError?.(requestError.message || "Ошибка при сканировании");
      }
    },
    [locked, token, cart, onAddProduct, onSuccessNotice, onError]
  );

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e) {
      const target = e.target;
      const isModal = Boolean(target?.closest?.(".ant-modal, .product-dialog, .product-details-dialog, dialog"));
      if (isModal) return;

      const isSearchBox =
        target?.getAttribute?.("aria-label") === "Поиск товара" ||
        target?.getAttribute?.("placeholder")?.includes("штрихкод");
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
  }, [enabled, handleBarcodeScanned]);

  return { handleBarcodeScanned };
}
