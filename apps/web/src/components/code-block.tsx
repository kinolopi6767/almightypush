"use client";

import { useEffect, useRef, useState } from "react";

export function CodeBlock({ code, label }: { code: string; label: string }) {
 const [copied, setCopied] = useState(false);
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => () => {
  if (timer.current) clearTimeout(timer.current);
 }, []);

 const copy = async () => {
  try {
   await navigator.clipboard.writeText(code);
   setCopied(true);
   if (timer.current) clearTimeout(timer.current);
   timer.current = setTimeout(() => setCopied(false), 1500);
  } catch {
   // clipboard unavailable — nothing else to do
  }
 };

 return (
  <div className="codewell">
   <div className="codewell-head">
    <span className="font-mono">{label}</span>
    <button
     onClick={() => void copy()}
     className="btn btn-ghost btn-sm !h-7"
    >
     {copied ? "Copied" : "Copy"}
    </button>
   </div>
   <pre>
    <code>{code}</code>
   </pre>
  </div>
 );
}
