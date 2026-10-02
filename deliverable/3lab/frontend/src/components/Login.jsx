import { useState } from "react";
import PropTypes from "prop-types";
import { ArrowUpRight, ShoppingBasket } from "lucide-react";

import { api } from "../api";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          password: form.get("password"),
        },
      });
      await onLogin(result.access_token);
    } catch (requestError) {
      setError(requestError.message);
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
        {error && <p className="error" role="alert">{error}</p>}
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
