/**
 * Bounded request-body readers.
 *
 * Next.js App Router route handlers have no built-in body-size limit: a
 * public POST handler that calls `req.json()` buffers the entire body before
 * any validation, so a chunked multi-gigabyte upload can OOM the process.
 * These helpers stream the body with a hard byte cap and reject over-limit
 * requests (declared Content-Length is checked first as a fast path, but the
 * stream cap is authoritative — chunked requests have no Content-Length).
 */

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON body");
    this.name = "InvalidJsonBodyError";
  }
}

async function readBytes(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // body already broken — throwing is what matters
      }
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Read a JSON body with a hard byte cap. Throws BodyTooLarge/InvalidJson. */
export async function readJsonCapped<T = unknown>(req: Request, maxBytes: number): Promise<T> {
  const buf = await readBytes(req, maxBytes);
  if (buf.length === 0) throw new InvalidJsonBodyError();
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

/** Read a text body with a hard byte cap. Throws BodyTooLarge. */
export async function readTextCapped(req: Request, maxBytes: number): Promise<string> {
  const buf = await readBytes(req, maxBytes);
  return buf.toString("utf8");
}

export type BodyReadResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/**
 * Parse a JSON body with a hard cap, returning a discriminated result instead
 * of throwing — route handlers can answer with their own envelope/CORS helper:
 * `const body = await readJsonResult(req, LIMIT); if (!body.ok) return json(...)`.
 */
export async function readJsonResult<T = unknown>(req: Request, maxBytes: number): Promise<BodyReadResult<T>> {
  try {
    return { ok: true, data: await readJsonCapped<T>(req, maxBytes) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, status: 413, error: "Payload too large" };
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

/** Default caps by body kind (bytes). Sized well above legitimate payloads. */
export const BODY_LIMITS = {
  /** subscribe/resubscribe/unsubscribe/tags/optin/click-family SDK JSON */
  sdk: 32 * 1024,
  /** AI prompts and campaign payloads */
  api: 256 * 1024,
  /** webhook trigger bodies (WordPress posts can be long) */
  webhook: 512 * 1024,
} as const;
