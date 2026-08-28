"use client";

import { useEffect, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

export default function SettingsPage() {
  const { apiKey, setApiKey } = useApiKey();
  const [input, setInput] = useState(apiKey);
  const [saved, setSaved] = useState(false);
  const [serverKey, setServerKey] = useState(false);

  useEffect(() => {
    setInput(apiKey);
  }, [apiKey]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setServerKey(d.hasServerKey))
      .catch(() => {});
  }, []);

  const save = () => {
    setApiKey(input.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Connect your Unusual Whales API key. Start with the{" "}
          <strong className="text-emerald-400">1-week free trial</strong>, then API Basic
          at $150/mo from{" "}
          <a
            href="https://unusualwhales.com/public-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline"
          >
            unusualwhales.com/public-api
          </a>
          .
        </p>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
        <strong>Free trial tip:</strong> Sign up for the API Trial ($50/week or free trial
        if offered) at Unusual Whales, copy your Bearer token, and paste it below.
        Trial includes flow, dark pool, GEX, and screeners.
      </div>

      {serverKey && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Server-side API key detected in environment. You can still override with your own
          key below.
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Unusual Whales API Key
        </label>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Your Bearer token"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-sm outline-none focus:border-emerald-500"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Stored locally in your browser. Sent only to your own server API routes.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            {saved ? "Saved!" : "Save Key"}
          </button>
          <button
            type="button"
            onClick={() => {
              setInput("");
              setApiKey("");
            }}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:border-zinc-500"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-5 text-sm text-zinc-500">
        <h2 className="font-semibold text-zinc-300">Environment setup (optional)</h2>
        <p className="mt-2">
          For deployment, add to <code className="text-zinc-400">.env.local</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-emerald-400">
          UNUSUAL_WHALES_API_KEY=your_bearer_token_here
        </pre>
      </div>
    </div>
  );
}
