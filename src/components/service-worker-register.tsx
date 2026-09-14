"use client";

import { useEffect } from "react";
import { registerAlertServiceWorker } from "@/lib/alerts/web-push-client";

/** Registers the Web Push service worker once on app load. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerAlertServiceWorker();
  }, []);
  return null;
}
