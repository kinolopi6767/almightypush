import * as argon2 from "@node-rs/argon2";

/** argon2id with sane defaults for interactive login (memory 64MB, time 3, parallelism 4). */
export async function hashPassword(password: string): Promise<string> {
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