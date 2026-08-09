"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

declare global {
  interface Window {
    PushPanel?: {
      init(options: {
        domain: number;
        publicKey: string;
        baseUrl?: string;
        serviceWorkerPath?: string;
        endpointOverride?: string;
      }): { subscribe(): Promise<string>; state(): string };
    };
  }
}

function DemoContent() {
  const searchParams = useSearchParams();
  const domain = Number(searchParams.get("domain") ?? 0);
  const ep = searchParams.get("ep") ?? undefined;
  const [status, setStatus] = useState("loading");
  const apiRef = useRef<ReturnType<NonNullable<Window["PushPanel"]>["init"]> | null>(null);

  useEffect(() => {
    if (!domain) {
      setStatus("missing-domain");
      return;
    }
    const script = document.createElement("script");
    script.src = "/sdk/pushpanel-sdk.js";
    script.onload = () => {
      fetch(`/api/v1/info?domain=${domain}`)
        .then((r) => r.json())
        .then((info) => {
          if (!info.publicKey) {
            setStatus("missing-key");
            return;
          }
          apiRef.current = window.PushPanel?.init({
            domain,
            publicKey: info.publicKey,
            baseUrl: "",
            serviceWorkerPath: "/sw.js",
            endpointOverride: ep,
          }) ?? null;
          setStatus(apiRef.current ? "ready" : "error");
        })
        .catch(() => setStatus("error"));
    };
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [domain, ep]);

  const handleSubscribe = useCallback(async () => {
    if (!apiRef.current) return;
    try {
      const next = await apiRef.current.subscribe();
      setStatus(next);
    } catch {
      setStatus("error");
    }
  }, []);

  if (!domain) return <p>Pass ?domain=&lt;id&gt; to load a sandbox.</p>;

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">PushPanel sandbox</h1>
      <p className="text-sm text-muted-foreground">
        This page loads the SDK for domain #{domain || "—"} and subscribes to the real push service. Send a test push
        from the panel to receive it.
      </p>
      <p className="text-sm">SDK state: <span className="font-mono">{status}</span></p>
      {status === "ready" && (
        <button
          onClick={handleSubscribe}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Subscribe to push
        </button>
      )}
    </div>
  );
}

export default function DemoPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>}>
      <DemoContent />
    </Suspense>
  );
}
