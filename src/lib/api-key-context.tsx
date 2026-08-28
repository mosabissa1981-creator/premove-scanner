"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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

function saveToLocalStorage(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may fail in private mode — cookie is the primary store
  }
}

function readLocalStorage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState("");
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
    const stored = readLocalStorage();
    if (stored) setApiKeyState(stored);
    refreshStatus().finally(() => setIsReady(true));
  }, [refreshStatus]);

  const setApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) {
      return { ok: false, error: "Paste your API key first" };
    }

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Failed to save" };
      }

      setApiKeyState(trimmed);
      saveToLocalStorage(trimmed);
      setHasServerCookie(true);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error — try again" };
    }
  }, []);

  const clearApiKey = useCallback(async () => {
    try {
      await fetch("/api/settings", { method: "DELETE", credentials: "same-origin" });
    } catch {
      // ignore
    }
    setApiKeyState("");
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
