"use strict";
var PushPanel = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    init: () => init,
    isInstalledPwa: () => isInstalledPwa
  });
  var PROMPT_STORAGE_KEY = "__pushpanel_prompt_dismissed__";
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function guessDevice() {
    const ua = navigator.userAgent;
    const isMobile = /Mobi|Android/i.test(ua);
    const os = /Windows/i.test(ua) ? "windows" : /Mac OS X/.test(ua) ? "macos" : /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Linux/i.test(ua) ? "linux" : "unknown";
    const browser = /Edg\//i.test(ua) ? "edge" : /OPR\//i.test(ua) ? "opera" : /Firefox\//i.test(ua) ? "firefox" : /Chrome\//i.test(ua) ? "chrome" : /Safari\//i.test(ua) ? "safari" : "unknown";
    let timezone = "UTC";
    let locale = "en-US";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      locale = navigator.language || "en-US";
    } catch (e) {
    }
    return {
      device: isMobile ? "mobile" : "desktop",
      browser,
      os,
      timezone,
      locale,
      screenWidth: typeof window !== "undefined" ? window.screen.width : 0,
      screenHeight: typeof window !== "undefined" ? window.screen.height : 0
    };
  }
  function isInstalledPwa() {
    var _a;
    return typeof window !== "undefined" && (((_a = window.matchMedia) == null ? void 0 : _a.call(window, "(display-mode: standalone)").matches) || window.navigator.standalone === true);
  }
  function isIos() {
    if (typeof navigator === "undefined") return false;
    return /iP(hone|ad|od)/.test(navigator.userAgent);
  }
  function appleNotificationAllowed() {
    const apple = window.AppleNotificationPermission;
    return apple === "granted";
  }
  function injectStyles(customCss) {
    const id = "pp-sdk-styles";
    if (document.getElementById(id) && !customCss) return;
    let style = document.getElementById(id);
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
${customCss != null ? customCss : ""}
`;
  }
  function positionClass(position) {
    return `pp-sdk-${position}`;
  }
  function init(options) {
    var _a, _b, _c, _d, _e;
    const baseUrl = ((_a = options.baseUrl) != null ? _a : "").replace(/\/$/, "");
    const swPath = (_b = options.serviceWorkerPath) != null ? _b : "/sw.js";
    const prompt = (_c = options.prompt) != null ? _c : {};
    const pos = (_d = prompt.position) != null ? _d : "bottom-right";
    const texts = (_e = prompt.texts) != null ? _e : {};
    let current = "idle";
    let uiMounted = false;
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      current = "unsupported";
    }
    const isPromptDismissed = () => {
      try {
        return (localStorage == null ? void 0 : localStorage.getItem(PROMPT_STORAGE_KEY)) === "1";
      } catch (e) {
        return false;
      }
    };
    const markPromptDismissed = () => {
      try {
        localStorage == null ? void 0 : localStorage.setItem(PROMPT_STORAGE_KEY, "1");
      } catch (e) {
      }
    };
    const alreadySubscribed = () => typeof Notification !== "undefined" && Notification.permission === "granted";
    function mountUi() {
      var _a2, _b2;
      if (uiMounted || current === "unsupported" || alreadySubscribed()) return;
      uiMounted = true;
      injectStyles(prompt.customCss);
      const type = (_a2 = prompt.type) != null ? _a2 : "auto";
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
      const scheduleShow = () => queueMicrotask(() => {
        var _a3;
        return setTimeout(show, (_a3 = prompt.delayMs) != null ? _a3 : 1500);
      });
      if (prompt.scrollDepth !== void 0 && prompt.scrollDepth > 0 && prompt.scrollDepth <= 1) {
        let fired = false;
        const onScroll = () => {
          var _a3;
          const depth = (window.scrollY + window.innerHeight) / Math.max(document.documentElement.scrollHeight, 1);
          if (!fired && depth >= ((_a3 = prompt.scrollDepth) != null ? _a3 : 0)) {
            fired = true;
            window.removeEventListener("scroll", onScroll);
            scheduleShow();
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        setTimeout(() => {
          if (!fired) scheduleShow();
        }, ((_b2 = prompt.delayMs) != null ? _b2 : 1500) + 8e3);
        return;
      }
      if (prompt.idleMs !== void 0 && prompt.idleMs > 0) {
        let idleTimer = null;
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
    function mountCard(kind = "auto") {
      var _a2, _b2, _c2, _d2, _e2, _f, _g, _h;
      const isFullscreen = kind === "fullscreen";
      const isBackdrop = kind === "backdrop";
      let backdrop = null;
      if (isBackdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "pp-sdk-backdrop";
        backdrop.addEventListener("click", () => {
          var _a3;
          markPromptDismissed();
          current = "dismissed";
          backdrop == null ? void 0 : backdrop.remove();
          (_a3 = document.querySelector(".pp-sdk-card")) == null ? void 0 : _a3.remove();
        });
        document.body.appendChild(backdrop);
      }
      const wrap = document.createElement("div");
      if (isFullscreen) {
        wrap.className = "pp-sdk-fullscreen";
        const inner = document.createElement("div");
        inner.className = "pp-sdk-fullscreen-inner";
        const logo = document.createElement("div");
        logo.style.cssText = "width:64px;height:64px;margin:0 auto 20px;border-radius:18px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800";
        logo.textContent = "P";
        const title2 = document.createElement("div");
        title2.style.cssText = "font-size:24px;font-weight:700;margin:0";
        title2.textContent = (_a2 = texts.title) != null ? _a2 : "Get notifications";
        const msg2 = document.createElement("div");
        msg2.style.cssText = "margin:10px 0 0;color:rgba(255,255,255,.75);font-size:14px";
        msg2.textContent = (_b2 = texts.message) != null ? _b2 : "We can send you a push when something new happens.";
        const row2 = document.createElement("div");
        row2.style.cssText = "margin-top:28px;display:flex;flex-direction:column;gap:10px";
        const allow2 = document.createElement("button");
        allow2.type = "button";
        allow2.style.cssText = "border-radius:999px;border:0;padding:12px 20px;font-size:15px;font-weight:600;background:#fff;color:#0f172a;cursor:pointer";
        allow2.textContent = (_c2 = texts.allow) != null ? _c2 : "Allow";
        allow2.addEventListener("click", () => {
          void subscribe().finally(() => {
            wrap.remove();
            backdrop == null ? void 0 : backdrop.remove();
          });
        });
        const dismiss2 = document.createElement("button");
        dismiss2.type = "button";
        dismiss2.style.cssText = "border-radius:999px;border:1px solid rgba(255,255,255,.3);padding:10px 20px;font-size:14px;background:transparent;color:#fff;cursor:pointer";
        dismiss2.textContent = (_d2 = texts.dismiss) != null ? _d2 : "Not now";
        dismiss2.addEventListener("click", () => {
          markPromptDismissed();
          current = "dismissed";
          wrap.remove();
          backdrop == null ? void 0 : backdrop.remove();
        });
        row2.append(allow2, dismiss2);
        inner.append(logo, title2, msg2, row2);
        wrap.append(inner);
        document.body.appendChild(wrap);
        return;
      }
      wrap.className = `pp-sdk pp-sdk-card ${positionClass(pos)}`;
      const title = document.createElement("div");
      title.className = "pp-sdk-title";
      title.textContent = (_e2 = texts.title) != null ? _e2 : "Get notifications";
      const msg = document.createElement("div");
      msg.className = "pp-sdk-msg";
      msg.textContent = (_f = texts.message) != null ? _f : "We can send you a push when something new happens.";
      const row = document.createElement("div");
      row.className = "pp-sdk-row";
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "pp-sdk-btn pp-sdk-dismiss";
      dismiss.textContent = (_g = texts.dismiss) != null ? _g : "Not now";
      dismiss.addEventListener("click", () => {
        markPromptDismissed();
        current = "dismissed";
        wrap.remove();
        backdrop == null ? void 0 : backdrop.remove();
      });
      const allow = document.createElement("button");
      allow.type = "button";
      allow.className = "pp-sdk-btn pp-sdk-allow";
      allow.textContent = (_h = texts.allow) != null ? _h : "Allow";
      allow.addEventListener("click", () => {
        void subscribe().finally(() => {
          wrap.remove();
          backdrop == null ? void 0 : backdrop.remove();
        });
      });
      row.append(dismiss, allow);
      wrap.append(title, msg, row);
      document.body.appendChild(wrap);
    }
    function mountBell() {
      var _a2, _b2;
      const bell = document.createElement("button");
      bell.type = "button";
      bell.className = `pp-sdk pp-sdk-bell ${positionClass(pos)}`;
      bell.setAttribute("aria-label", (_a2 = texts.bellLabel) != null ? _a2 : "Enable push notifications");
      bell.title = (_b2 = texts.bellLabel) != null ? _b2 : "Enable push notifications";
      bell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
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
    async function subscribe() {
      if (current === "unsupported") return "unsupported";
      try {
        if (isIos() && !isInstalledPwa()) {
          current = "ios-not-installed";
          return current;
        }
        let permission;
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
        if (!registration.active) {
          await navigator.serviceWorker.ready;
          await new Promise((resolve) => {
            const poll = () => registration.active ? resolve() : setTimeout(poll, 50);
            poll();
          });
        }
        const applicationServerKey = urlBase64ToUint8Array(options.publicKey);
        let subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        if (options.endpointOverride) {
          subscription = { ...subscription, endpoint: options.endpointOverride };
        }
        const payload = {
          domainId: options.domain,
          subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys },
          ...guessDevice(),
          subscribeUrl: location.href
        };
        const res = await fetch(`${baseUrl}/api/v1/subscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`subscribe failed (${res.status})`);
        current = "subscribed";
      } catch (error) {
        current = "error";
        throw error;
      }
      return current;
    }
    async function unsubscribe() {
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
          body: JSON.stringify({ domainId: options.domain, endpoint: sub.endpoint })
        }).catch(() => void 0);
        await sub.unsubscribe().catch(() => void 0);
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
      unsubscribe
    };
  }
  return __toCommonJS(index_exports);
})();
