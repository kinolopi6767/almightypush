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
  /** Sandbox/dev only: replace the push service endpoint (e.g. a local mock). NOT for production use. */
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
  /** Attach key-value attributes to this subscriber for segmentation + {{tokens}}. Max 10 tags, values ≤200 chars. */
  setTags(tags: Record<string, string | number | boolean>): Promise<boolean>;
}

const PROMPT_STORAGE_KEY = "__pushpanel_prompt_dismissed__";
const pendingSubKey = (domain: number): string => `__pushpanel_pending_sub_${domain}__`;
/** Module-level singleton: re-init() with the same domain must not mount duplicate UI. */
interface PushPanelWindow extends Window {
  __pushpanel_instances__?: Map<number, PushPanelApi>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Compare two VAPID applicationServerKeys (ArrayBuffers) without external deps. */
function sameApplicationServerKey(a: ArrayBuffer | null, publicKey: string): boolean {
  if (!a) return false;
  try {
    const b = urlBase64ToUint8Array(publicKey);
    if (a.byteLength !== b.byteLength) return false;
    const av = new Uint8Array(a);
    for (let i = 0; i < av.length; i++) if (av[i] !== b[i]) return false;
    return true;
  } catch {
    return false;
  }
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
.pp-sdk-error{font-size:12px;color:#dc2626}
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

/* ── IndexedDB config store (shared with the service worker) ──────────────
 * The SW cannot read localStorage; pushsubscriptionchange needs the domain,
 * VAPID key and panel URL to re-subscribe. One small IDB record. */
const IDB_NAME = "pushpanel";
const IDB_STORE = "config";

function idbSet(key: string, value: unknown): void {
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
      } catch {
        void 0;
      }
    };
    // onerror intentionally ignored — reconciliation is best-effort
    req.onerror = () => undefined;
  } catch {
    void 0;
  }
}

const SYNC_THROTTLE_KEY = "__pushpanel_last_sync__";

/** Auto-resync (OneSignal "auto-resubscribe"): while permission is granted,
 * periodically re-post the CURRENT browser subscription so endpoint rotations
 * and server-side drift self-heal. Throttled to once per 12h per domain. */
function schedulePeriodicSync(
  api: { state: () => PushPanelState },
  opts: { domain: number; baseUrl?: string; serviceWorkerPath?: string },
): void {
  try {
    const last = Number(localStorage.getItem(SYNC_THROTTLE_KEY) ?? 0);
    if (Date.now() - last < 12 * 3_600_000) return;
    localStorage.setItem(SYNC_THROTTLE_KEY, String(Date.now()));
  } catch {
    return; // no storage — skip sync rather than hammering
  }
  setTimeout(async () => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (api.state() !== "subscribed") return;
    try {
      const reg = (await navigator.serviceWorker.getRegistration(opts.serviceWorkerPath ?? "/sw.js")) ?? undefined;
      const sub = await reg?.pushManager.getSubscription();
      if (!reg || !sub || !opts.baseUrl) return;
      await fetch(`${opts.baseUrl.replace(/\/+$/, "")}/api/v1/resubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainId: opts.domain,
          subscription: { endpoint: sub.endpoint, keys: sub.toJSON().keys },
        }),
      });
    } catch {
      void 0;
    }
  }, 5_000);
}

export function init(options: PushPanelOptions): PushPanelApi {
  // Singleton per domain: landing pages call init() inside click handlers,
  // host pages sometimes double-init — duplicates stacked prompt cards/bells.
  const w = window as PushPanelWindow;
  if (!w.__pushpanel_instances__) w.__pushpanel_instances__ = new Map();
  const existing = w.__pushpanel_instances__.get(options.domain);
  if (existing) return existing;

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

  const storageGet = (key: string): string | null => {
    try {
      return localStorage?.getItem(key);
    } catch {
      return null; // private mode
    }
  };
  const storageSet = (key: string, value: string): void => {
    try {
      localStorage?.setItem(key, value);
    } catch {
      // storage may be unavailable — ignore
    }
  };

  const isPromptDismissed = (): boolean => storageGet(PROMPT_STORAGE_KEY) === "1";
  const markPromptDismissed = (): void => storageSet(PROMPT_STORAGE_KEY, "1");

  const alreadySubscribed = (): boolean =>
    typeof Notification !== "undefined" && Notification.permission === "granted";

  /** Opt-in funnel telemetry — once per stage per browsing session. */
  const trackOptin = (stage: "prompt_shown" | "prompt_allowed" | "prompt_denied" | "prompt_dismissed"): void => {
    try {
      if (!options.baseUrl) return;
      const key = `__pp_funnel_${stage}__`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return; // no storage — skip rather than spam
    }
    void fetch(`${baseUrl}/api/v1/optin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domainId: options.domain, stage }),
      keepalive: true,
    }).catch(() => undefined);
  };

  /** Central teardown for prompt triggers (scroll/idle listeners + timers). */
  const teardowns: (() => void)[] = [];
  const teardownTriggers = (): void => {
    while (teardowns.length) teardowns.pop()?.();
  };

  /** Offline queue: if the panel is unreachable at subscribe time, stash the
   * payload and flush it on the next init — the browser holds a live push
   * subscription either way, so losing the DB row would lose the subscriber
   * forever (permission=granted suppresses every future prompt). */
  function queuePendingSubscription(payload: unknown): void {
    try {
      localStorage.setItem(pendingSubKey(options.domain), JSON.stringify(payload));
    } catch {
      void 0;
    }
  }

  async function flushPendingSubscription(): Promise<void> {
    const raw = storageGet(pendingSubKey(options.domain));
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as unknown;
      const res = await fetch(`${baseUrl}/api/v1/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        try {
          localStorage.removeItem(pendingSubKey(options.domain));
        } catch {
          void 0;
        }
        current = "subscribed";
      }
    } catch {
      // panel still down — retry on the next visit
    }
  }

  function mountUi(): void {
    // Denial/dismissal respect applies to ALL prompt types (bell included —
    // nagging users who said no is how panels get blocked site-wide).
    if (uiMounted || current === "unsupported" || alreadySubscribed()) return;
    const type = prompt.type ?? "auto";
    if (type !== "none" && type !== "bell") {
      if (type === "firstVisit" && isPromptDismissed()) return;
    }
    if (prompt.noRePromptIfDenied && ("Notification" in window ? Notification.permission === "denied" : true)) return;
    uiMounted = true;
    injectStyles(prompt.customCss);

    if (type === "bell") {
      mountBell();
      trackOptin("prompt_shown");
      return;
    }
    if (type === "none") return;

    const show = () => {
      teardownTriggers();
      if (document.querySelector(".pp-sdk-card, .pp-sdk-fullscreen")) return;
      mountCard(type);
      trackOptin("prompt_shown");
    };

    const scheduleShow = () => queueMicrotask(() => setTimeout(show, prompt.delayMs ?? 1500));

    // LumaPush visual triggers: scroll depth & idle
    if (prompt.scrollDepth !== undefined && prompt.scrollDepth > 0 && prompt.scrollDepth <= 1) {
      let fired = false;
      const onScroll = () => {
        const depth = (window.scrollY + window.innerHeight) / Math.max(document.documentElement.scrollHeight, 1);
        if (!fired && depth >= (prompt.scrollDepth ?? 0)) {
          fired = true;
          teardownTriggers();
          scheduleShow();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      teardowns.push(() => window.removeEventListener("scroll", onScroll));
      // fallback delay if user never scrolls
      const t = setTimeout(() => {
        if (!fired) scheduleShow();
      }, (prompt.delayMs ?? 1500) + 8000);
      teardowns.push(() => clearTimeout(t));
      return;
    }
    if (prompt.idleMs !== undefined && prompt.idleMs > 0) {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const reset = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(scheduleShow, prompt.idleMs);
      };
      const events = ["mousemove", "keydown", "scroll", "touchstart"] as const;
      events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
      teardowns.push(() => {
        if (idleTimer) clearTimeout(idleTimer);
        events.forEach((e) => window.removeEventListener(e, reset));
      });
      reset();
      return;
    }

    scheduleShow();
  }

  /** Inline error text on the prompt so failures aren't silent. */
  function showCardError(message: string): void {
    const el = document.querySelector<HTMLElement>(".pp-sdk-card .pp-sdk-error, .pp-sdk-fullscreen .pp-sdk-error");
    if (el) {
      el.textContent = message;
      return;
    }
    const host = document.querySelector(".pp-sdk-card, .pp-sdk-fullscreen-inner");
    if (!host) return;
    const err = document.createElement("div");
    err.className = "pp-sdk pp-sdk-error";
    err.setAttribute("role", "alert");
    err.textContent = message;
    host.appendChild(err);
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
        trackOptin("prompt_dismissed");
        teardownTriggers();
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
        subscribe()
          .catch(() => showCardError("Couldn't enable notifications — try again."))
          .finally(() => {
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
        trackOptin("prompt_dismissed");
        teardownTriggers();
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
        trackOptin("prompt_dismissed");
      teardownTriggers();
      wrap.remove();
      backdrop?.remove();
    });
    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "pp-sdk-btn pp-sdk-allow";
    allow.textContent = texts.allow ?? "Allow";
    allow.addEventListener("click", () => {
      subscribe()
        .catch(() => showCardError("Couldn't enable notifications — try again."))
        .finally(() => {
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
      subscribe()
        .then((state) => {
          if (state === "subscribed" || state === "denied") bell.remove();
        })
        .catch(() => showCardError("Couldn't enable notifications."));
    });
    document.body.appendChild(bell);
  }

  /** Wait until the SW registration has an active worker (bounded). */
  async function waitForActive(registration: ServiceWorkerRegistration): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (!registration.active) {
      if (Date.now() > deadline) throw new Error("service worker activation timeout");
      await new Promise((r) => setTimeout(r, 50));
    }
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
        trackOptin("prompt_denied");
        return current;
      }
      const registration = await navigator.serviceWorker.register(swPath);
      // wait for the worker to be active — pushManager.subscribe requires one
      if (!registration.active) {
        await waitForActive(registration);
      }
      const applicationServerKey = urlBase64ToUint8Array(options.publicKey);

      // Endpoint reuse: push services rotate endpoints; blindly subscribing
      // again creates a SECOND live subscription for the same person (double
      // notifications + inflated counts). Reuse when the VAPID key matches.
      const prev = await registration.pushManager.getSubscription();
      let subscription: PushSubscription;
      if (prev && sameApplicationServerKey(prev.options.applicationServerKey, options.publicKey)) {
        subscription = prev;
      } else {
        if (prev) await prev.unsubscribe().catch(() => undefined);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      if (options.endpointOverride) {
        // Spread of a PushSubscription copies nothing (IDL attributes live on
        // the prototype) — rebuild from its JSON representation instead.
        const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
        subscription = { endpoint: options.endpointOverride, keys: json.keys } as unknown as PushSubscription;
      }
      const payload = {
        domainId: options.domain,
        subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys },
        ...guessDevice(),
        subscribeUrl: location.href,
      };
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/v1/subscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // panel unreachable (deploy/network blip) — queue for next visit
        queuePendingSubscription(payload);
        throw new Error("panel unreachable — will retry on next visit");
      }
      if (!res.ok) {
        // The browser now holds a live push subscription either way — if the
        // row never reached the DB this user is silently lost forever. Queue
        // for the next visit on any server-side failure as well.
        if (res.status >= 500 || res.status === 429) queuePendingSubscription(payload);
        throw new Error(`subscribe failed (${res.status})`);
      }
      current = "subscribed";
      trackOptin("prompt_allowed");
    } catch (error) {
      current = "error";
      throw error;
    }
    return current;
  }

  /** Our own registration for swPath — NEVER serviceWorker.ready, which can
   * return a co-existing site worker whose push subscription we'd then
   * destroy. Returns null when PushPanel's SW isn't registered. */
  async function getOwnRegistration(): Promise<ServiceWorkerRegistration | null> {
    try {
      return (await navigator.serviceWorker.getRegistration(swPath)) ?? null;
    } catch {
      return null;
    }
  }

  async function unsubscribe(): Promise<PushPanelState> {
    if (current === "unsupported") return "unsupported";
    try {
      const registration = await getOwnRegistration();
      const sub = await registration?.pushManager.getSubscription();
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

  async function setTags(tags: Record<string, string | number | boolean>): Promise<boolean> {
    if (current === "unsupported") return false;
    try {
      const registration = await getOwnRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (!sub) return false;
      // Stringify values (OneSignal-style flat tags), cap count/lengths server-side.
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(tags)) {
        if (typeof k !== "string" || !k.trim()) continue;
        clean[k.trim().slice(0, 64)] = String(v).slice(0, 200);
      }
      const res = await fetch(`${baseUrl}/api/v1/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domainId: options.domain, endpoint: sub.endpoint, tags: clean }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Recovery path runs regardless of prompt gating: a returning visitor with
  // permission=granted must still flush a subscription queued while the panel
  // was down (mountUi early-returns for them).
  void flushPendingSubscription();
  queueMicrotask(mountUi);

  idbSet("subscription", { domainId: options.domain, publicKey: options.publicKey, baseUrl });


  const api: PushPanelApi = {
    state: () => current,
    isInstalledPwa,
    subscribe,
    unsubscribe,
    setTags,
  };
  w.__pushpanel_instances__!.set(options.domain, api);
  schedulePeriodicSync(api, options);
  return api;
}
