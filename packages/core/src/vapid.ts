import webpush from "web-push";
import { createCipher } from "./crypto";

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

/** Generate a P-256 (prime256v1) VAPID keypair (base64url). */
export function generateVapidKeys(): VapidKeyPair {
  const keys = webpush.generateVAPIDKeys();
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

export interface VapidConfig {
  publicKey: string;
  /** privateKey encrypted at rest (AES-256-GCM) */
  privateKeyEnc: string;
  /** contact mailto: or https: URL — part of the VAPID JWT */
  subject: string;
}

export function createVapidConfig(encKey: string | undefined, subject: string): VapidConfig {
  // RFC 8292: subject must be mailto: or https:. An invalid subject fails at
  // EVERY future send, so reject at creation time instead.
  const s = subject.trim();
  if (!/^mailto:[^\s@]+@[^\s@]+$/i.test(s) && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(s)) {
    throw new Error("VAPID subject must be a mailto: address or https: URL");
  }
  if (s.length > 200) throw new Error("VAPID subject too long");
  const keys = generateVapidKeys();
  return {
    publicKey: keys.publicKey,
    privateKeyEnc: createCipher(encKey).encrypt(keys.privateKey),
    subject: s,
  };
}

/** Decrypt to the plain VAPID keypair needed for a single send. */
export function decryptVapidConfig(config: VapidConfig, encKey: string | undefined): VapidKeyPair {
  // Validate shapes early: a corrupt vault row must surface as a config error,
  // not as a cryptic web-push failure at send time.
  if (!config || typeof config.publicKey !== "string" || config.publicKey.length < 80 || config.publicKey.length > 100) {
    throw new Error("Invalid VAPID public key");
  }
  return {
    publicKey: config.publicKey,
    privateKey: createCipher(encKey).decrypt(config.privateKeyEnc),
  };
}
