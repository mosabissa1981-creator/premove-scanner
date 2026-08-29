"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "premove_uw_api_key";

interface ApiKeyContextValue {
  apiKey: string;
  hasKey: boolean;
  hasServerCookie: boolean;
  isReady: boolean;
  setApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  clearApiKey: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

const keyListeners = new Set<() => void>();

function emitKeyChange() {
  for (const listener of keyListeners) listener();
}

function subscribeKey(callback: () => void): () => void {
  keyListeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    keyListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

function getKeySnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerKeySnapshot(): string {
  return "";
}

function saveToLocalStorage(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may fail in private mode — cookie is the primary store
  }
  emitKeyChange();
}

function normalizeKey(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "");
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  // Source the key from localStorage through an external store so we stay
  // SSR-safe (server snapshot is empty) without synchronously calling setState
  // inside an effect, which triggers cascading renders.
  const apiKey = useSyncExternalStore(subscribeKey, getKeySnapshot, getServerKeySnapshot);
  const [hasServerCookie, setHasServerCookie] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { credentials: "same-origin" });
      const data = await res.json();
      setHasServerCookie(Boolean(data.hasCookie || data.hasServerKey));
    } catch {
      setHasServerCookie(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/config", { credentials: "same-origin" });
        const data = await res.json();
        if (!cancelled) setHasServerCookie(Boolean(data.hasCookie || data.hasServerKey));
      } catch {
        if (!cancelled) setHasServerCookie(false);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    const trimmed = normalizeKey(key);
    if (!trimmed) {
      return { ok: false, error: "Paste your API key first" };
    }

    // Optimistic: persist locally first so scanning works immediately even if
    // the cookie round-trip is slow. This also notifies subscribers.
    saveToLocalStorage(trimmed);

    try {
      const res = await fetch("/api/settings/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Failed to save" };
      }

      setHasServerCookie(true);
      return { ok: true };
    } catch {
      // Local state already set — scan will still work via header this session.
      return { ok: true };
    }
  }, []);

  const clearApiKey = useCallback(async () => {
    try {
      await fetch("/api/settings", { method: "DELETE", credentials: "same-origin" });
    } catch {
      // ignore
    }
    saveToLocalStorage("");
    setHasServerCookie(false);
  }, []);

  const hasKey = Boolean(apiKey) || hasServerCookie;

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        hasKey,
        hasServerCookie,
        isReady,
        setApiKey,
        clearApiKey,
        refreshStatus,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used within ApiKeyProvider");
  return ctx;
}

export function apiHeaders(apiKey: string): HeadersInit {
  return apiKey ? { "x-uw-api-key": apiKey } : {};
}
