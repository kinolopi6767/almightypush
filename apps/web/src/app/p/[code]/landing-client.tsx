"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LandingClientProps {
  code: string;
  baseUrl: string;
  targetUrl: string;
  prompt: string;
  forceSubscribe: boolean;
  domainId: number | null;
  publicKey: string;
}

type SdkGlobal = { PushPanel?: { init: (opts: { domain: number; publicKey: string; baseUrl?: string }) => { subscribe(): Promise<string>; state(): string } } };
declare global {
  // eslint-disable-next-line no-var
  var PushPanel: SdkGlobal["PushPanel"];
}

export function LandingClient({ code, baseUrl, targetUrl, prompt, forceSubscribe, domainId, publicKey }: LandingClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"ready" | "unsupported" | "denied" | "subscribed" | "error">("ready");
  // e2e/dev hook: headless Chromium cannot pushManager.subscribe, so a
  // `dev=1` query param simulates a successful subscription. Production
  // traffic never carries it.
  const isDev = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dev") === "1";

  const go = useCallback(
    (subscribed: boolean) => {
      const url = new URL(targetUrl);
      url.searchParams.set("ref", "lp");
      if (subscribed) url.searchParams.set("sub", "1");
      window.location.href = url.toString();
    },
    [targetUrl],
  );

  const finish = useCallback(
    async (ok: boolean) => {
      if (ok) {
        await fetch(`${baseUrl}/api/v1/lp/subscribed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }).catch(() => undefined);
      }
      go(ok);
    },
    [baseUrl, code, go],
  );
  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      if (isDev) {
        await finish(true);
        return;
      }
      if (!domainId || !publicKey) {
        console.warn("lp: no domain/publicKey", { domainId, publicKey: Boolean(publicKey) });
        await finish(false);
        return;
      }
      const api = window.PushPanel?.init({ domain: domainId, publicKey, baseUrl });
      if (!api) {
        console.warn("lp: PushPanel SDK not loaded");
        setState("error");
        setBusy(false);
        if (!forceSubscribe) await finish(false);
        return;
      }
      const result = await api.subscribe();
      console.info("lp: subscribe result", result);
      setState((result as "denied" | "subscribed" | "error") ?? "error");
      if (result === "subscribed") {
        await finish(true);
      } else if (result === "denied") {
        if (forceSubscribe) {
          setState("denied");
          setBusy(false);
          return;
        }
        await finish(false);
      } else {
        await finish(false);
      }
    } catch (error) {
      console.warn("lp: subscribe error", error);
      setBusy(false);
      setState("error");
      if (!forceSubscribe) await finish(false);
    }
  }, [domainId, publicKey, baseUrl, forceSubscribe, finish]);

  const skip = useCallback(() => {
    if (!forceSubscribe) void finish(false);
  }, [forceSubscribe, finish]);

  useEffect(() => {
    if (!domainId || !publicKey || !forceSubscribe) return;
    let cancelled = false;
    const attempt = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        if (window.PushPanel) {
          if (!cancelled) await subscribe();
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    };
    void attempt();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(1200px 600px at 50% -10%, #1d4ed8, #0f172a)",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 20px",
            borderRadius: 18,
            background: "#fff",
            color: "#1d4ed8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          P
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>{prompt}</h1>
        <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.75)", fontSize: 14 }}>
          We&apos;ll only send you updates you care about. Unsubscribe anytime.
        </p>

        {state === "denied" && (
          <p style={{ color: "#fca5a5", marginTop: 16, fontSize: 14 }}>
            Notifications are blocked. Enable them in your browser settings and try again.
          </p>
        )}
        {state === "error" && <p style={{ color: "#fca5a5", marginTop: 16, fontSize: 14 }}>Something went wrong — please try again.</p>}

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => void subscribe()}
            disabled={busy || state === "subscribed"}
            style={{
              borderRadius: 999,
              border: 0,
              padding: "12px 20px",
              fontSize: 15,
              fontWeight: 600,
              background: "#fff",
              color: "#0f172a",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Subscribing…" : "Allow notifications"}
          </button>
          {!forceSubscribe && (
            <button
              onClick={skip}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.3)",
                padding: "10px 20px",
                fontSize: 14,
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              No thanks, take me there
            </button>
          )}
        </div>
      </div>
    </main>
  );
}