export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function api(path, { token, signal, method = "GET", body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((e) => `${e.loc.slice(1).join(".")}: ${e.msg}`).join("; ")
      : detail;
    throw new ApiError(
      message || `Ошибка сервера (${response.status})`,
      response.status,
    );
  }
  if (!data) throw new ApiError("Сервер вернул некорректный ответ", 502);
  return data;
}
export const currency = (value) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(
    value,
  );
export const cents = (value) => Math.round(Number(value) * 100);

export function validateProductPage(data) {
  if (
    !Array.isArray(data?.items) ||
    !("next_cursor" in data) ||
    !(data.next_cursor === null || Number.isSafeInteger(data.next_cursor)) ||
    !data.items.every(
      (p) =>
        Number.isSafeInteger(p.id) &&
        p.id > 0 &&
        typeof p.name === "string" &&
        typeof p.category === "string" &&
        typeof p.barcode === "string" &&
        (p.brand == null || typeof p.brand === "string") &&
        (p.image_url == null || typeof p.image_url === "string") &&
        typeof p.active === "boolean" &&
        Number.isSafeInteger(p.stock) &&
        p.stock >= 0 &&
        Number.isSafeInteger(p.version) &&
        typeof p.price === "string" &&
        /^\d+(\.\d{1,2})?$/.test(p.price) &&
        Number(p.price) > 0,
    )
  ) {
    throw new ApiError("Получены некорректные данные каталога", 502);
  }
  return data;
}
