"use client";

import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing else to do
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 bg-muted px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          onClick={() => void copy()}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border bg-muted/60 p-4 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}