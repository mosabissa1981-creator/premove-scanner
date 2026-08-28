"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

function SettingsForm() {
  const { refreshStatus, clearApiKey, hasKey } = useApiKey();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(true);
  const [charCount, setCharCount] = useState(0);

  const saved = searchParams.get("saved") === "1";
  const cleared = searchParams.get("cleared") === "1";
  const error = searchParams.get("error");

  useEffect(() => {
    if (saved || cleared) {
      refreshStatus();
    }
    if (cleared) {
      void clearApiKey();
    }
  }, [saved, cleared, refreshStatus, clearApiKey]);

  const updateCount = () => {
    const val = inputRef.current?.value ?? "";
    setCharCount(val.trim().replace(/^Bearer\s+/i, "").length);
  };

  const errorMessage = (() => {
    if (error === "empty") return "Paste your API key in the field above first.";
    if (error === "short") {
      const len = searchParams.get("len");
      return `Key looks too short (${len ?? "?"} chars). Copy the full Bearer token.`;
    }
    if (error === "invalid") return "Something went wrong. Try again.";
    return "";
  })();

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste your Unusual Whales API key, then tap Save.
        </p>
        <p className="mt-1 text-xs text-emerald-500/80">Mobile-friendly save (no JavaScript required)</p>
      </div>

      {saved && (
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

      {cleared && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
          API key cleared.
        </div>
      )}

      {hasKey && !saved && !cleared && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          API key is saved. Go to Scanner to run a scan.
        </div>
      )}

      {/* Native HTML form — works on iOS Safari without JavaScript */}
      <form
        method="POST"
        action="/api/settings/save"
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
            onInput={updateCount}
            onPaste={() => setTimeout(updateCount, 100)}
            placeholder="Paste token here (UUID format)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3.5 pr-16 font-mono text-sm outline-none focus:border-emerald-500"
            style={showKey ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
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

        {errorMessage && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          className="mt-4 w-full touch-manipulation rounded-xl bg-emerald-500 py-4 text-base font-bold text-black active:scale-[0.98]"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          Save Key
        </button>
      </form>

      <form method="POST" action="/api/settings/clear">
        <button
          type="submit"
          className="w-full touch-manipulation rounded-xl border border-zinc-700 py-3 text-sm text-zinc-400"
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

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-400">Loading settings…</div>}>
      <SettingsForm />
    </Suspense>
  );
}
