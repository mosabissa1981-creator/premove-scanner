import type { ScanResult } from "@/lib/unusualwhales/types";
import type { ScanMode } from "@/lib/scoring/scan-mode";

export const LAST_SCAN_STORAGE_KEY = "premove_last_swing_scan";
export const LAST_PENNY_SCAN_STORAGE_KEY = "premove_last_penny_scan";
const CACHE_VERSION = 1;

interface LastScanCache {
  version: number;
  savedAt: string;
  scan: ScanResult;
}

function storageKeyForMode(mode: ScanMode): string {
  return mode === "penny" ? LAST_PENNY_SCAN_STORAGE_KEY : LAST_SCAN_STORAGE_KEY;
}

function getLocalStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) return null;
    // Touch storage so private-mode throws are caught here.
    const probe = "__premove_ls_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") return false;
  const scan = value as Partial<ScanResult>;
  return (
    typeof scan.scannedAt === "string" &&
    typeof scan.candidatesScreened === "number" &&
    Array.isArray(scan.results) &&
    Array.isArray(scan.errors)
  );
}

/** Load the last scan from localStorage (null if missing/corrupt). */
export function loadLastSwingScan(mode: ScanMode = "swing"): ScanResult | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKeyForMode(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastScanCache>;
    if (parsed.version !== CACHE_VERSION) return null;
    if (!isScanResult(parsed.scan)) return null;
    return parsed.scan;
  } catch {
    return null;
  }
}

/** Persist a successful scan until the user runs Find/Refresh again. */
export function saveLastSwingScan(scan: ScanResult, mode: ScanMode = "swing"): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const payload: LastScanCache = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      scan,
    };
    storage.setItem(storageKeyForMode(mode), JSON.stringify(payload));
  } catch {
    // Private mode / quota — scan still works in-memory for this session.
  }
}

export function clearLastSwingScan(mode: ScanMode = "swing"): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKeyForMode(mode));
  } catch {
    // ignore
  }
}
