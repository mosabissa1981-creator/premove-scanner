import type { ScanResult } from "@/lib/unusualwhales/types";

export const LAST_SCAN_STORAGE_KEY = "premove_last_swing_scan";
const CACHE_VERSION = 1;

interface LastScanCache {
  version: number;
  savedAt: string;
  scan: ScanResult;
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

/** Load the last swing scan from localStorage (null if missing/corrupt). */
export function loadLastSwingScan(): ScanResult | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_SCAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastScanCache>;
    if (parsed.version !== CACHE_VERSION) return null;
    if (!isScanResult(parsed.scan)) return null;
    return parsed.scan;
  } catch {
    return null;
  }
}

/** Persist a successful swing scan until the user runs Find/Refresh again. */
export function saveLastSwingScan(scan: ScanResult): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const payload: LastScanCache = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      scan,
    };
    storage.setItem(LAST_SCAN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota — scan still works in-memory for this session.
  }
}

export function clearLastSwingScan(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(LAST_SCAN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
