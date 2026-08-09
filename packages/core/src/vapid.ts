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
  const keys = generateVapidKeys();
  return {
    publicKey: keys.publicKey,
    privateKeyEnc: createCipher(encKey).encrypt(keys.privateKey),
    subject,
  };
}

/** Decrypt to the plain VAPID keypair needed for a single send. */
export function decryptVapidConfig(config: VapidConfig, encKey: string | undefined): VapidKeyPair {
  return {
    publicKey: config.publicKey,
    privateKey: createCipher(encKey).decrypt(config.privateKeyEnc),
  };
}
