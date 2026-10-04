import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { X } from "lucide-react";
import { api, currency } from "../api";

const LEFT = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const LEFT_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function isValidEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

function eanBits(value) {
  if (!isValidEan13(value)) return "";
  const digits = [...value].map(Number);
  const parity = PARITY[digits[0]];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    bits += (parity[index - 1] === "L" ? LEFT : LEFT_G)[digits[index]];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) {
    bits += [...LEFT[digits[index]]].map((bit) => (bit === "1" ? "0" : "1")).join("");
  }
  return bits + "101";
}

export function BarcodeImage({ value }) {
  const bits = useMemo(() => eanBits(value), [value]);
  if (!bits) return <p className="barcode-unavailable">Для этого товара нет корректного EAN‑13.</p>;
  const bars = [...bits].flatMap((bit, index) => (bit === "1" ? [<rect key={index} x={index + 12} y="5" width="1" height={index < 3 || (index >= 45 && index < 50) || index >= 92 ? 68 : 62} />] : []));
  return (
    <figure className="barcode-figure" aria-label={`Штрихкод EAN-13 ${value}`}>
      <svg viewBox="0 0 119 78" role="img" aria-label={`Штрихкод ${value}`} shapeRendering="crispEdges">
        <g fill="currentColor">{bars}</g>
        <text x="2" y="76" fontSize="7" fontFamily="monospace">{value[0]}</text>
        <text x="16" y="76" fontSize="7" fontFamily="monospace">{value.slice(1, 7)}</text>
        <text x="60" y="76" fontSize="7" fontFamily="monospace">{value.slice(7)}</text>
      </svg>
      <figcaption>{value} · EAN‑13</figcaption>
    </figure>
  );
}
BarcodeImage.propTypes = { value: PropTypes.string.isRequired };

function Nutrients({ product }) {
  const hasAny = [product.proteins, product.fats, product.carbohydrates, product.calories].some((value) => value !== null && value !== undefined);
  if (!hasAny) return <p className="detail-missing">Пищевая ценность для этой позиции пока не внесена.</p>;
  const values = [
    ["Белки", product.proteins, "г"],
    ["Жиры", product.fats, "г"],
    ["Углеводы", product.carbohydrates, "г"],
    ["Энергия", product.calories, "ккал"],
  ];
  return (
    <>
      <div className="nutrition-grid">
        {values.map(([label, value, unit]) => (
          <div className="nutrition-cell" key={label}>
            <strong>{value ?? "—"}<small>{value == null ? "" : ` ${unit}`}</small></strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="detail-caption">Значения на 100 г продукта</p>
    </>
  );
}
Nutrients.propTypes = {
  product: PropTypes.shape({
    proteins: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    fats: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    carbohydrates: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    calories: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
};

export default function ProductDetailsDialog({ productId, token, onClose, onUnauthorized }) {
  const dialog = useRef(null);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setProduct(null);
    setError("");
    setImageFailed(false);
    api(`/products/${productId}`, { token, signal: controller.signal })
      .then(setProduct)
      .catch((requestError) => {
        if (requestError.name === "AbortError") return;
        if (requestError.status === 401) onUnauthorized();
        setError(requestError.message || "Не удалось загрузить карточку товара");
      });
    return () => controller.abort();
  }, [productId, token, onUnauthorized]);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="product-details" aria-labelledby="product-details-title" onCancel={onClose}>
      <header className="details-header">
        <div><p className="eyebrow">КАРТОЧКА ТОВАРА</p><h2 id="product-details-title">{product?.name || "Загрузка товара…"}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть карточку"><X /></button>
      </header>
      {error ? <p className="error" role="alert">{error}</p> : !product ? <div className="details-loading" role="status">Загружаем сведения о товаре…</div> : (
        <div className="details-body">
          <div className="details-main">
            <div className="details-photo">
              {product.image_url && !imageFailed ? <img src={product.image_url} alt={`Упаковка товара «${product.name}»`} onError={() => setImageFailed(true)} /> : <span>Фото пока не добавлено</span>}
            </div>
            <div className="details-price"><strong>{currency(product.price)}</strong><span>{product.stock ? `В наличии: ${product.stock} шт.` : "Нет в наличии"}</span></div>
            {product.brand && <p className="detail-brand">Бренд: {product.brand}</p>}
            {product.description && <p className="detail-description">{product.description}</p>}
            <section className="details-section">
              <h3>Штрихкод упаковки</h3>
              <BarcodeImage value={product.barcode} />
            </section>
          </div>
          <div className="details-information">
            <section className="details-section">
              <h3>КБЖУ</h3>
              <Nutrients product={product} />
            </section>
            <section className="details-section">
              <h3>Состав</h3>
              {product.ingredients ? <p className="ingredients">{product.ingredients}</p> : <p className="detail-missing">Состав для этой позиции пока не внесён.</p>}
            </section>
            <p className="detail-caption">Штрихкод: {product.barcode}</p>
            {product.source_url && <a className="source-link" href={product.source_url} target="_blank" rel="noreferrer">Источник сведений о товаре</a>}
          </div>
        </div>
      )}
    </dialog>
  );
}

ProductDetailsDialog.propTypes = {
  productId: PropTypes.number.isRequired,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onUnauthorized: PropTypes.func.isRequired,
};
