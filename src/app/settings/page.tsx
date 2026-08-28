"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

export default function SettingsPage() {
  const { apiKey, setApiKey, clearApiKey, hasKey } = useApiKey();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (apiKey) setInput(apiKey);
  }, [apiKey]);

  const save = async () => {
    if (!input.trim()) {
      setStatus("error");
      setErrorMsg("Paste your Unusual Whales API key first.");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const result = await setApiKey(input);
    if (result.ok) {
      setStatus("saved");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Could not save key");
    }
  };

  const clear = async () => {
    await clearApiKey();
    setInput("");
    setStatus("idle");
    setErrorMsg("");
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste your Unusual Whales API Bearer token below.
        </p>
      </div>

      {hasKey && status !== "saved" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          API key is saved. Go to Scanner to run a scan.
        </div>
      )}

      {status === "saved" && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-4 text-center">
          <p className="font-semibold text-emerald-300">Key saved successfully!</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-3 w-full rounded-xl bg-emerald-500 py-3 font-bold text-black"
          >
            Go to Scanner →
          </button>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-zinc-300">
          Unusual Whales API Key
        </label>
        <div className="relative">
          <input
            id="api-key"
            type={showKey ? "text" : "password"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted) setInput(pasted.trim());
            }}
            placeholder="Paste Bearer token here"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3.5 pr-16 font-mono text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>

        {status === "error" && (
          <p className="mt-2 text-sm text-red-400">{errorMsg}</p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-black active:bg-emerald-600 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save Key"}
        </button>

        <button
          type="button"
          onClick={clear}
          className="mt-2 w-full rounded-xl border border-zinc-700 py-3 text-sm text-zinc-400"
        >
          Clear Key
        </button>
      </div>

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
