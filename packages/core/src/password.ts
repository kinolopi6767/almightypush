import * as argon2 from "@node-rs/argon2";

/** argon2id with sane defaults for interactive login (memory 64MB, time 3, parallelism 4). */
export async function hashPassword(password: string): Promise<string> {
  // Defense-in-depth: every entry point validates length via zod, but a
  // programmatic caller passing megabytes would OOM the worker on argon2's
  // 64MB memory cost. Fail fast instead.
  if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
    throw new Error("Invalid password length");
  }
  return argon2.hash(password, {
    algorithm: 2, // Argon2id
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Timing-safe credential check for login paths. When the account does not
 * exist (or has no password), verifying against a fixed dummy hash keeps the
 * response latency indistinguishable from a real password mismatch, so
 * valid vs. invalid emails cannot be told apart by timing.
 */
const DUMMY_LOGIN_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$QOeiGs3Yh5PW+C+X+6ksBA$3COSiBvl8VN5VOHqG44uFb+hTUxuOhXDUAeGbMPdCDM";

export async function verifyPasswordOrDummy(storedHash: string | null | undefined, password: string): Promise<boolean> {
  if (!storedHash) {
    await verifyPassword(DUMMY_LOGIN_HASH, password);
    return false;
  }
  return verifyPassword(storedHash, password);
}