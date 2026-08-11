"use client";

import { useCallback, useEffect, useState } from "react";

interface LandingClientProps {
  code: string;
  baseUrl: string;
  targetUrl: string;
  prompt: string;
  forceSubscribe: boolean;
  domainId: number | null;
  publicKey: string;
  /** e2e hook — only the authenticated p/[code] server page may enable it */
  devMode: boolean;
}

type SdkGlobal = { PushPanel?: { init: (opts: { domain: number; publicKey: string; baseUrl?: string }) => { subscribe(): Promise<string>; state(): string } } };
declare global {
  var PushPanel: SdkGlobal["PushPanel"];
}

export function LandingClient({ code, baseUrl, targetUrl, prompt, forceSubscribe, domainId, publicKey, devMode }: LandingClientProps) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"ready" | "unsupported" | "denied" | "subscribed" | "error">("ready");

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
      if (devMode) {
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
          // Blocked, but a force-subscribe link still has to deliver the
          // visitor: show the explanation, then move them on.
          setState("denied");
          setBusy(false);
          setTimeout(() => void finish(false), 4000);
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
    if (!forceSubscribe) return;
    // Force-subscribe links must always resolve to the target URL. A link
    // whose domain has no VAPID keys has nothing to subscribe to — send the
    // visitor on instead of trapping them on the landing page.
    if (!domainId || !publicKey) {
      const t = setTimeout(() => void finish(false), 300);
      return () => clearTimeout(t);
    }
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
  }, [domainId, publicKey, forceSubscribe, finish, subscribe]);

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