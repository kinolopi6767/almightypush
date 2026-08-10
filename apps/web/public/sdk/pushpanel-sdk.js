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
    init: () => init
  });
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
    return { device: isMobile ? "mobile" : "desktop", browser, os };
  }
  function init(options) {
    var _a, _b;
    const baseUrl = ((_a = options.baseUrl) != null ? _a : "").replace(/\/$/, "");
    const swPath = (_b = options.serviceWorkerPath) != null ? _b : "/sw.js";
    let current = "idle";
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      current = "unsupported";
    }
    return {
      state: () => current,
      async subscribe() {
        if (current === "unsupported") return "unsupported";
        try {
          const permission = await Notification.requestPermission();
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
    };
  }
  return __toCommonJS(index_exports);
})();
