/**
 * PushPanel client SDK v1 — subscription + in-page prompt engine.
 * - requests notification permission (optionally via a branded prompt card
 *   or a floating bell widget)
 * - registers the panel's service worker
 * - subscribes via PushManager with the domain's VAPID public key
 * - reports the subscription to the panel's /api/v1/subscribe endpoint
 *
 * Built as a UMD bundle (`dist/pushpanel-sdk.js`, global `PushPanel`) so
 * sites can use it with a plain <script> tag.
 */

export interface PushPanelOptions {
  /** Domain id as shown in the panel */
  domain: number;
  /** Domain's VAPID public key (base64url) */
  publicKey: string;
  /** Panel base URL, e.g. https://push.example.com (defaults to current origin) */
  baseUrl?: string;
  /** Service worker path on the site (default /sw.js) */
  serviceWorkerPath?: string;
  /** Sandbox/dev only: replace the push service endpoint (e.g. a local mock). */
  endpointOverride?: string;
  /** In-page prompt engine behaviour (default: auto card). */
  prompt?: PushPromptConfig;
}

export interface PushPromptConfig {
  /**
   * auto — permission card (custom-card).
   * backdrop — card + dark backdrop overlay.
   * fullscreen — full-screen hero layout.
   * firstVisit — the card appears only on the first visit (localStorage).
   * bell — a floating bell widget; clicking subscribes.
   * none — no UI; call subscribe() yourself (e.g. your own button).
   */
  type?: "auto" | "backdrop" | "fullscreen" | "firstVisit" | "bell" | "none";
  /** where the card/bell sits on the viewport (ignored for fullscreen) */
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /** how long to wait before showing an auto/firstVisit card (ms) */
  delayMs?: number;
  /** dismiss means we never re-prompt in this browser (honours denial) */
  noRePromptIfDenied?: boolean;
  /** Visual trigger: show after scroll depth 0-1 (e.g. 0.65 = 65%) */
  scrollDepth?: number;
  /** Visual trigger: show after idle ms */
  idleMs?: number;
  /** Custom CSS injected into prompt card (LumaPush Full Custom CSS) */
  customCss?: string;
  texts?: {
    title?: string;
    message?: string;
    allow?: string;
    dismiss?: string;
    /** aria label for the bell widget */
    bellLabel?: string;
  };
}

export type PushPanelState = "unsupported" | "idle" | "denied" | "subscribed" | "error" | "ios-not-installed" | "dismissed";

export interface PushPanelApi {
  subscribe(): Promise<PushPanelState>;
  state(): PushPanelState;
  /** iOS PWA support: true when the site runs as an installed web app. */
  isInstalledPwa(): boolean;
  unsubscribe(): Promise<PushPanelState>;
}

const PROMPT_STORAGE_KEY = "__pushpanel_prompt_dismissed__";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function guessDevice(): { device: string; browser: string; os: string; timezone: string; locale: string; screenWidth: number; screenHeight: number } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const os = /Windows/i.test(ua)
    ? "windows"
    : /Mac OS X/.test(ua)
      ? "macos"
      : /Android/i.test(ua)
        ? "android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "ios"
          : /Linux/i.test(ua)
            ? "linux"
            : "unknown";
  const browser = /Edg\//i.test(ua)
    ? "edge"
    : /OPR\//i.test(ua)
      ? "opera"
      : /Firefox\//i.test(ua)
        ? "firefox"
        : /Chrome\//i.test(ua)
          ? "chrome"
          : /Safari\//i.test(ua)
            ? "safari"
            : "unknown";
  let timezone = "UTC";
  let locale = "en-US";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    locale = navigator.language || "en-US";
  } catch {
    void 0;
  }
  return {
    device: isMobile ? "mobile" : "desktop",
    browser,
    os,
    timezone,
    locale,
    screenWidth: typeof window !== "undefined" ? window.screen.width : 0,
    screenHeight: typeof window !== "undefined" ? window.screen.height : 0,
  };
}

export function isInstalledPwa(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/**
 * iOS 18+ exposes Web App Push on installed PWAs. Apple grants permission
 * through the OS (no requestPermission prompt) — the SDK just checks the
 * Apple-specific signal before falling back to the standard flow.
 */
function appleNotificationAllowed(): boolean {
  const apple = (window as unknown as { AppleNotificationPermission?: unknown }).AppleNotificationPermission;
  return apple === "granted";
}

function injectStyles(customCss?: string): void {
  const id = "pp-sdk-styles";
  if (document.getElementById(id) && !customCss) return;
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = `
.pp-sdk{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:inherit;z-index:2147483647}
.pp-sdk *{all:unset;box-sizing:border-box}
.pp-sdk-card{position:fixed;z-index:2147483647;width:min(340px,92vw);display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:14px;background:var(--pp-sdk-bg,#ffffff);color:var(--pp-sdk-fg,#1a1a1a);box-shadow:0 10px 30px rgba(0,0,0,.18);border:1px solid rgba(0,0,0,.08)}
.pp-sdk-card.pp-sdk-bottom-left{left:16px;bottom:16px}.pp-sdk-card.pp-sdk-bottom-right{right:16px;bottom:16px}.pp-sdk-card.pp-sdk-top-left{left:16px;top:16px}.pp-sdk-card.pp-sdk-top-right{right:16px;top:16px}
.pp-sdk-title{font-size:15px;font-weight:700}
.pp-sdk-msg{font-size:13px;line-height:1.45;opacity:.9}
.pp-sdk-row{display:flex;gap:8px;justify-content:flex-end}
.pp-sdk-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer}
.pp-sdk-allow{background:var(--pp-sdk-accent,#2563eb);color:#fff}
.pp-sdk-dismiss{background:rgba(0,0,0,.06)}
.pp-sdk-bell{position:fixed;z-index:2147483647;width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--pp-sdk-accent,#2563eb);color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.25)}
.pp-sdk-bell.pp-sdk-bottom-left{left:16px;bottom:16px}.pp-sdk-bell.pp-sdk-bottom-right{right:16px;bottom:16px}.pp-sdk-bell.pp-sdk-top-left{left:16px;top:16px}.pp-sdk-bell.pp-sdk-top-right{right:16px;top:16px}
.pp-sdk-bell svg{width:26px;height:26px;display:block}
.pp-sdk-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)}
.pp-sdk-fullscreen{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 600px at 50% -10%, #1d4ed8, #0f172a);color:#fff;padding:24px}
.pp-sdk-fullscreen-inner{max-width:460px;text-align:center}
${customCss ?? ""}
`;
}

function positionClass(position: NonNullable<PushPromptConfig["position"]>): string {
  return `pp-sdk-${position}`;
}

export function init(options: PushPanelOptions): PushPanelApi {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const swPath = options.serviceWorkerPath ?? "/sw.js";
  const prompt: PushPromptConfig = options.prompt ?? {};
  const pos = prompt.position ?? "bottom-right";
  const texts = prompt.texts ?? {};
  let current: PushPanelState = "idle";
  let uiMounted = false;

  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    current = "unsupported";
  }

  const isPromptDismissed = (): boolean => {
    try {
      return localStorage?.getItem(PROMPT_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const markPromptDismissed = (): void => {
    try {
      localStorage?.setItem(PROMPT_STORAGE_KEY, "1");
    } catch {
      // storage may be unavailable (private mode) — ignore
    }
  };

  const alreadySubscribed = (): boolean =>
    typeof Notification !== "undefined" && Notification.permission === "granted";

  function mountUi(): void {
    if (uiMounted || current === "unsupported" || alreadySubscribed()) return;
    uiMounted = true;
    injectStyles(prompt.customCss);

    const type = prompt.type ?? "auto";
    if (type === "bell") {
      mountBell();
      return;
    }
    if (type === "none") return;
    if (type === "firstVisit" && isPromptDismissed()) return;
    if (prompt.noRePromptIfDenied && ("Notification" in window ? Notification.permission === "denied" : true)) return;

    const show = () => {
      if (uiMounted && document.querySelector(".pp-sdk-card, .pp-sdk-fullscreen")) return;
      mountCard(type);
    };

    const scheduleShow = () => queueMicrotask(() => setTimeout(show, prompt.delayMs ?? 1500));

    // LumaPush visual triggers: scroll depth & idle
    if (prompt.scrollDepth !== undefined && prompt.scrollDepth > 0 && prompt.scrollDepth <= 1) {
      let fired = false;
      const onScroll = () => {
        const depth = (window.scrollY + window.innerHeight) / Math.max(document.documentElement.scrollHeight, 1);
        if (!fired && depth >= (prompt.scrollDepth ?? 0)) {
          fired = true;
          window.removeEventListener("scroll", onScroll);
          scheduleShow();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      // fallback delay if user never scrolls
      setTimeout(() => {
        if (!fired) scheduleShow();
      }, (prompt.delayMs ?? 1500) + 8000);
      return;
    }
    if (prompt.idleMs !== undefined && prompt.idleMs > 0) {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const reset = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(scheduleShow, prompt.idleMs);
      };
      ["mousemove", "keydown", "scroll", "touchstart"].forEach((e) => window.addEventListener(e, reset, { passive: true }));
      reset();
      return;
    }

    scheduleShow();
  }

  function mountCard(kind: string = "auto"): void {
    const isFullscreen = kind === "fullscreen";
    const isBackdrop = kind === "backdrop";

    let backdrop: HTMLElement | null = null;
    if (isBackdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "pp-sdk-backdrop";
      backdrop.addEventListener("click", () => {
        markPromptDismissed();
        current = "dismissed";
        backdrop?.remove();
        document.querySelector(".pp-sdk-card")?.remove();
      });
      document.body.appendChild(backdrop);
    }

    // built without innerHTML so no text from config is ever injected as HTML
    const wrap = document.createElement("div");
    if (isFullscreen) {
      wrap.className = "pp-sdk-fullscreen";
      const inner = document.createElement("div");
      inner.className = "pp-sdk-fullscreen-inner";
      const logo = document.createElement("div");
      logo.style.cssText = "width:64px;height:64px;margin:0 auto 20px;border-radius:18px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800";
      logo.textContent = "P";
      const title = document.createElement("div");
      title.style.cssText = "font-size:24px;font-weight:700;margin:0";
      title.textContent = texts.title ?? "Get notifications";
      const msg = document.createElement("div");
      msg.style.cssText = "margin:10px 0 0;color:rgba(255,255,255,.75);font-size:14px";
      msg.textContent = texts.message ?? "We can send you a push when something new happens.";
      const row = document.createElement("div");
      row.style.cssText = "margin-top:28px;display:flex;flex-direction:column;gap:10px";
      const allow = document.createElement("button");
      allow.type = "button";
      allow.style.cssText = "border-radius:999px;border:0;padding:12px 20px;font-size:15px;font-weight:600;background:#fff;color:#0f172a;cursor:pointer";
      allow.textContent = texts.allow ?? "Allow";
      allow.addEventListener("click", () => {
        void subscribe().finally(() => {
          wrap.remove();
          backdrop?.remove();
        });
      });
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.style.cssText = "border-radius:999px;border:1px solid rgba(255,255,255,.3);padding:10px 20px;font-size:14px;background:transparent;color:#fff;cursor:pointer";
      dismiss.textContent = texts.dismiss ?? "Not now";
      dismiss.addEventListener("click", () => {
        markPromptDismissed();
        current = "dismissed";
        wrap.remove();
        backdrop?.remove();
      });
      row.append(allow, dismiss);
      inner.append(logo, title, msg, row);
      wrap.append(inner);
      document.body.appendChild(wrap);
      return;
    }

    wrap.className = `pp-sdk pp-sdk-card ${positionClass(pos)}`;

    const title = document.createElement("div");
    title.className = "pp-sdk-title";
    title.textContent = texts.title ?? "Get notifications";
    const msg = document.createElement("div");
    msg.className = "pp-sdk-msg";
    msg.textContent = texts.message ?? "We can send you a push when something new happens.";

    const row = document.createElement("div");
    row.className = "pp-sdk-row";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "pp-sdk-btn pp-sdk-dismiss";
    dismiss.textContent = texts.dismiss ?? "Not now";
    dismiss.addEventListener("click", () => {
      markPromptDismissed();
      current = "dismissed";
      wrap.remove();
      backdrop?.remove();
    });
    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "pp-sdk-btn pp-sdk-allow";
    allow.textContent = texts.allow ?? "Allow";
    allow.addEventListener("click", () => {
      void subscribe().finally(() => {
        wrap.remove();
        backdrop?.remove();
      });
    });

    row.append(dismiss, allow);
    wrap.append(title, msg, row);
    document.body.appendChild(wrap);
  }

  function mountBell(): void {
    const bell = document.createElement("button");
    bell.type = "button";
    bell.className = `pp-sdk pp-sdk-bell ${positionClass(pos)}`;
    bell.setAttribute("aria-label", texts.bellLabel ?? "Enable push notifications");
    bell.title = texts.bellLabel ?? "Enable push notifications";
    // CSP-safe: build SVG via DOM, no innerHTML
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const p1 = document.createElementNS(svgNS, "path");
    p1.setAttribute("d", "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9");
    const p2 = document.createElementNS(svgNS, "path");
    p2.setAttribute("d", "M13.73 21a2 2 0 0 1-3.46 0");
    svg.append(p1, p2);
    (svg as unknown as HTMLElement).style.width = "26px";
    (svg as unknown as HTMLElement).style.height = "26px";
    (svg as unknown as HTMLElement).style.display = "block";
    bell.append(svg);
    bell.addEventListener("click", () => {
      if (alreadySubscribed()) {
        bell.remove();
        return;
      }
      void subscribe().then((state) => {
        if (state === "subscribed" || state === "denied") bell.remove();
      });
    });
    document.body.appendChild(bell);
  }

  async function subscribe(): Promise<PushPanelState> {
    if (current === "unsupported") return "unsupported";
    try {
      // iOS push only exists on installed PWAs (iOS 16.4+ macOS, 18+ iOS).
      if (isIos() && !isInstalledPwa()) {
        current = "ios-not-installed";
        return current;
      }
      let permission: NotificationPermission;
      if (isIos() && appleNotificationAllowed()) {
        permission = "granted";
      } else {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        current = "denied";
        return current;
      }
      const registration = await navigator.serviceWorker.register(swPath);
      // wait for the worker to be active — pushManager.subscribe requires one
      if (!registration.active) {
        await navigator.serviceWorker.ready;
        await new Promise<void>((resolve) => {
          const poll = () => (registration.active ? resolve() : setTimeout(poll, 50));
          poll();
        });
      }
      const applicationServerKey = urlBase64ToUint8Array(options.publicKey);
      let subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      if (options.endpointOverride) {
        subscription = { ...subscription, endpoint: options.endpointOverride } as PushSubscription;
      }
      const payload = {
        domainId: options.domain,
        subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys },
        ...guessDevice(),
        subscribeUrl: location.href,
      };
      const res = await fetch(`${baseUrl}/api/v1/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`subscribe failed (${res.status})`);
      current = "subscribed";
    } catch (error) {
      current = "error";
      throw error;
    }
    return current;
  }

  async function unsubscribe(): Promise<PushPanelState> {
    if (current === "unsupported") return "unsupported";
    try {
      if (!navigator.serviceWorker.controller) return "idle";
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) {
        current = "idle";
        return current;
      }
      await fetch(`${baseUrl}/api/v1/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domainId: options.domain, endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
      current = "idle";
    } catch (error) {
      current = "error";
      throw error;
    }
    return current;
  }

  queueMicrotask(mountUi);

  return {
    state: () => current,
    isInstalledPwa,
    subscribe,
    unsubscribe,
  };
}
