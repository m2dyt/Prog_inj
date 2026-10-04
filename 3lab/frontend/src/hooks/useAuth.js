import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const TOKEN_KEY = "market_auth_token";

export function useAuth() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(Boolean(token));

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
    setToken("");
    setUser(null);
  }, []);

  const login = useCallback(async (value) => {
    const me = await api("/auth/me", { token: value });
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      // ignore storage errors
    }
    setToken(value);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api("/auth/logout", { token, method: "POST" });
      }
    } finally {
      reset();
    }
  }, [token, reset]);

  // Восстановление сессии при обновлении страницы
  useEffect(() => {
    if (!token) {
      setInitializing(false);
      return;
    }

    let active = true;
    api("/auth/me", { token })
      .then((me) => {
        if (active) {
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
  }, [token, reset]);

  return {
    token,
    user,
    initializing,
    login,
    logout,
    reset,
  };
}
