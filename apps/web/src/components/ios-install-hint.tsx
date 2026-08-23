"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pp-ios-install-dismissed";

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua);
  if (!iOS) return false;
  // Installed PWA runs standalone — nothing to prompt.
  if (window.matchMedia("(display-mode: standalone)").matches) return false;
  // Safari on iOS (the only browser that can add to home screen).
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosSafari()) return;
    // Reappear weekly after dismissal (matches the "reappear timer" idea).
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      dismissedAt = Date.now(); // storage unavailable — behave as dismissed
    }
    const week = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedAt > week) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border bg-card p-4 shadow-lg">
      <p className="text-sm font-semibold">Install PushPanel</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Tap the Share button <span aria-hidden>⎋</span> in Safari.</li>
        <li>Choose <strong>Add to Home Screen</strong>.</li>
        <li>Open the app icon from your home screen.</li>
      </ol>
      <button
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
          } catch {
            void 0;
          }
          setShow(false);
        }}
        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Got it
      </button>
    </div>
  );
}