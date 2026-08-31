"use client";

import type { ReactNode } from "react";

export type OdteFilterMode = "all" | "odte";

export function OdteExpiryToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: OdteFilterMode;
  onChange: (mode: OdteFilterMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-900/80 p-0.5"
      role="group"
      aria-label="Expiry filter"
    >
      <ToggleButton
        active={value === "all"}
        disabled={disabled}
        onClick={() => onChange("all")}
      >
        All Expiries
      </ToggleButton>
      <ToggleButton
        active={value === "odte"}
        disabled={disabled}
        onClick={() => onChange("odte")}
      >
        0DTE Only
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-zinc-400 hover:text-zinc-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}
