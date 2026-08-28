"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

function normalizeKey(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "");
}

export default function SettingsPage() {
  const { setApiKey, clearApiKey, hasKey } = useApiKey();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(true);
  const [charCount, setCharCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const readKey = () => {
    const fromRef = inputRef.current?.value ?? "";
    return normalizeKey(fromRef);
  };

  const updateCount = () => {
    setCharCount(readKey().length);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const key = readKey();
    if (!key) {
      setStatus("error");
      setErrorMsg("Paste your API key in the field above first.");
      return;
    }

    if (key.length < 20) {
      setStatus("error");
      setErrorMsg(`Key looks too short (${key.length} chars). Copy the full Bearer token.`);
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const result = await setApiKey(key);
    if (result.ok) {
      setStatus("saved");
      if (inputRef.current) inputRef.current.value = key;
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Could not save key");
    }
  };

  const handleClear = async () => {
    await clearApiKey();
    if (inputRef.current) inputRef.current.value = "";
    setCharCount(0);
    setStatus("idle");
    setErrorMsg("");
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste your Unusual Whales API key, then tap Save.
        </p>
      </div>

      {hasKey && status !== "saved" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          API key is saved. Go to Scanner to run a scan.
        </div>
      )}

      {status === "saved" && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-4 text-center">
          <p className="text-lg font-semibold text-emerald-300">Saved!</p>
          <p className="mt-1 text-sm text-emerald-400/80">Your API key is connected.</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black"
          >
            Go to Scanner →
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-zinc-300">
          Unusual Whales API Key
        </label>

        <div className="relative">
          <input
            ref={inputRef}
            id="api-key"
            name="apiKey"
            type="text"
            defaultValue=""
            onInput={updateCount}
            onPaste={() => setTimeout(updateCount, 100)}
            onBlur={updateCount}
            placeholder="Paste token here (UUID format)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3.5 pr-16 font-mono text-sm outline-none focus:border-emerald-500"
            style={showKey ? undefined : { WebkitTextSecurity: "disc" } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-zinc-400"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          {charCount > 0
            ? `${charCount} characters detected — ready to save`
            : "Paste your key, then check the character count appears"}
        </p>

        {status === "error" && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="mt-4 w-full touch-manipulation rounded-xl bg-emerald-500 py-4 text-base font-bold text-black active:scale-[0.98] disabled:opacity-50"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {status === "saving" ? "Saving…" : "Save Key"}
        </button>

        <button
          type="button"
          onClick={handleClear}
          className="mt-2 w-full touch-manipulation rounded-xl border border-zinc-700 py-3 text-sm text-zinc-400"
        >
          Clear Key
        </button>
      </form>

      <p className="text-center text-xs text-zinc-500">
        Get your key at{" "}
        <a
          href="https://unusualwhales.com/public-api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 underline"
        >
          unusualwhales.com/public-api
        </a>
      </p>

      <Link href="/" className="block text-center text-sm text-zinc-400 underline">
        ← Back to Scanner
      </Link>
    </div>
  );
}
