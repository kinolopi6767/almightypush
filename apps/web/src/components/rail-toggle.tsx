"use client";

import { useEffect, useState } from "react";

const KEY = "pp-rail-collapsed";

/** Collapsible rail toggle — persists to localStorage (2026 standard). */
export function RailToggle() {
 const [collapsed, setCollapsed] = useState(false);

 useEffect(() => {
  try {
   setCollapsed(localStorage.getItem(KEY) === "1");
  } catch {
   /* private mode — stay expanded */
  }
 }, []);

 useEffect(() => {
  const rail = document.querySelector("aside[data-rail]");
  if (rail) rail.setAttribute("data-collapsed", collapsed ? "true" : "false");
  try {
   localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
   /* ignore */
  }
 }, [collapsed]);

 return (
  <button
   type="button"
   onClick={() => setCollapsed((c) => !c)}
   aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
   aria-pressed={collapsed}
   title={collapsed ? "Expand" : "Collapse"}
   className="hidden h-7 w-7 items-center justify-center rounded-md text-[var(--rail-muted)] transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
  >
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
    {collapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
   </svg>
  </button>
 );
}
