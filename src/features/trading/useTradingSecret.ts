"use client";

import { useCallback, useState } from "react";

/**
 * Holds the operator's trading secret in memory only.
 *
 * The secret is never persisted: `localStorage` would leave it readable by any
 * script on the page and would survive a restart on a shared machine. That
 * means it is re-entered per session, which is the intended cost of having no
 * sign-in flow at all.
 *
 * Nothing is sent anywhere until it is set, and the server rejects every
 * trading call without it, so an empty value simply means the buttons stay
 * disabled rather than the app being quietly exposed.
 */
const SECRET_KEY = "trading.secret";

export function useTradingSecret(): {
  secret: string;
  setSecret: (value: string) => void;
  hasSecret: boolean;
  clear: () => void;
} {
  /**
   * Read once during the first render rather than in an effect.
   *
   * `sessionStorage` rather than `localStorage`: it dies with the tab, so a
   * forgotten secret does not stay usable on a shared machine, while still
   * surviving the React remount that a hot reload causes mid-trade. The
   * try/catch covers private browsing modes, where the value is simply empty
   * and trading needs a re-entry each reload.
   */
  const [secret, setStored] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(SECRET_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setSecret = useCallback((value: string) => {
    setStored(value);
    try {
      sessionStorage.setItem(SECRET_KEY, value);
    } catch {
      // Ignored for the same reason as above.
    }
  }, []);

  const clear = useCallback(() => {
    setStored("");
    try {
      sessionStorage.removeItem(SECRET_KEY);
    } catch {
      // Nothing to do.
    }
  }, []);

  return { secret, setSecret, hasSecret: secret.length > 0, clear };
}
