"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Live health badge: polls /api/health instead of hardcoding "operational". */
export function HealthBadge() {
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setState(res.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setState("down");
      }
    };
    void check();
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  if (state === "loading") {
    return (
      <span className="badge badge-neutral ml-1 hidden shrink-0 md:inline-flex" aria-label="Checking system status">
        <span className="badge-dot" aria-hidden /> Checking…
      </span>
    );
  }
  if (state === "ok") {
    return (
      <Link href="/dashboard/status" className="badge badge-ok ml-1 hidden shrink-0 md:inline-flex">
        <span className="badge-dot livedot pulsing" aria-hidden />
        System operational
      </Link>
    );
  }
  return (
    <Link href="/dashboard/status" className="badge ml-1 hidden shrink-0 border-destructive/40 text-destructive md:inline-flex" role="alert">
      <span className="badge-dot bg-destructive" aria-hidden />
      System degraded
    </Link>
  );
}
