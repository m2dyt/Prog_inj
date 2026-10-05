import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Package, X } from "lucide-react";
import Barcode from "react-barcode";
import { api, currency } from "../api";

export function isValidEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function BarcodeImage({ value, showCaption = true, className = "" }) {
  if (!isValidEan13(value)) {
    return <p className="barcode-unavailable">Для этого товара нет корректного EAN‑13.</p>;
  }

  return (
    <figure
      className={`barcode-figure ${className}`.trim()}
      aria-label={`Штрихкод EAN-13 ${value}`}
    >
      <div
        role="img"
        aria-label={`Штрихкод ${value}`}
        style={{ display: "inline-flex", justifyContent: "center", maxWidth: "100%", overflow: "hidden" }}
      >
        <Barcode
          value={value}
          format="EAN13"
          width={1.6}
          height={54}
          displayValue={showCaption}
          font="monospace"
          fontSize={13}
          margin={4}
          background="transparent"
          lineColor="#1e293b"
        />
      </div>
    </figure>
  );
}

BarcodeImage.propTypes = {
  value: PropTypes.string.isRequired,
  showCaption: PropTypes.bool,
  className: PropTypes.string,
};

function Nutrients({ product }) {
  const hasAny = [
    product.proteins,
    product.fats,
    product.carbohydrates,
    product.calories,
  ].some((value) => value !== null && value !== undefined);

  if (!hasAny) {
    return <p className="detail-missing">Пищевая ценность для этой позиции пока не внесена.</p>;
  }

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
            <strong>
              {value ?? "—"}
              <small>{value == null ? "" : ` ${unit}`}</small>
            </strong>
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

export default function ProductDetailsDialog({
  productId,
  token,
  onClose,
  onUnauthorized,
}) {
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
    <dialog
      ref={dialog}
      className="product-details"
      aria-labelledby="product-details-title"
      onCancel={onClose}
    >
      <header className="details-header">
        <div>
          <p className="eyebrow">КАРТОЧКА ТОВАРА</p>
          <h2 id="product-details-title">{product?.name || "Загрузка товара…"}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть карточку">
          <X />
        </button>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !product ? (
        <div className="details-loading" role="status">
          Загружаем сведения о товаре…
        </div>
      ) : (
        <div className="details-body">
          <div className="details-main">
            <div className="details-photo">
              {product.image_url && !imageFailed ? (
                <img
                  src={product.image_url}
                  alt={`Упаковка товара «${product.name}»`}
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="details-photo-fallback">
                  <Package size={48} strokeWidth={1.25} />
                  <span>Фото упаковки отсутствует</span>
                  <small>{product.category}</small>
                </div>
              )}
            </div>
            <div className="details-price">
              <strong>{currency(product.price)}</strong>
              <span>
                {product.stock ? `В наличии: ${product.stock} шт.` : "Нет в наличии"}
              </span>
            </div>
            {product.brand && <p className="detail-brand">Бренд: {product.brand}</p>}
            {product.description && (
              <p className="detail-description">{product.description}</p>
            )}
          </div>
          <div className="details-information">
            <section className="details-section barcode-side-section">
              <h3>Штрихкод упаковки</h3>
              <BarcodeImage value={product.barcode} />
            </section>
            <section className="details-section">
              <h3>КБЖУ</h3>
              <Nutrients product={product} />
            </section>
            <section className="details-section">
              <h3>Состав</h3>
              {product.ingredients ? (
                <p className="ingredients">{product.ingredients}</p>
              ) : (
                <p className="detail-missing">Состав для этой позиции пока не внесён.</p>
              )}
            </section>
            {product.source_url && (
              <a
                className="source-link"
                href={product.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Источник сведений о товаре
              </a>
            )}
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
