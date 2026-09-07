/**
 * Google Drive upload helper — pure fetch + JWT, no `googleapis` dep.
 * Works with a Service Account JSON (personal single-tenant: user creates SA,
 * shares a Drive folder with SA email, pastes JSON in panel — no OAuth flow).
 */

import { createSign } from "node:crypto";

function base64url(input: string | Buffer): string {
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwtSign(header: object, payload: object, privateKeyPem: string): string {
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${h}.${p}`);
  const sig = signer.sign(privateKeyPem);
  return `${h}.${p}.${base64url(sig)}`;
}

export interface GDriveServiceJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export async function getGDriveAccessToken(saJson: string | GDriveServiceJson): Promise<string> {
  // Corrupt vault ciphertext / truncated JSON must throw a clear error here —
  // callers (backup upload) treat any throw as best-effort skip + log.
  let sa: GDriveServiceJson;
  if (typeof saJson === "string") {
    try {
      sa = JSON.parse(saJson) as GDriveServiceJson;
    } catch {
      throw new Error("Service account JSON is not valid JSON");
    }
  } else {
    sa = saJson;
  }
  if (!sa.client_email || !sa.private_key) throw new Error("Invalid service account JSON: missing client_email/private_key");
  // SSRF pin: token_uri comes from pasted JSON — only Google's OAuth hosts
  // may receive the signed JWT. A crafted file pointing at 169.254.169.254
  // or an intranet host would otherwise turn backup uploads into an SSRF relay.
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  let tokenUrl: URL;
  try {
    tokenUrl = new URL(tokenUri);
  } catch {
    throw new Error("Invalid service account JSON: bad token_uri");
  }
  const tokenHost = tokenUrl.hostname.toLowerCase();
  if (tokenUrl.protocol !== "https:" || (tokenHost !== "oauth2.googleapis.com" && !tokenHost.endsWith(".googleapis.com"))) {
    throw new Error("Invalid service account JSON: token_uri must be a Google OAuth endpoint");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };
  const jwt = jwtSign(header, payload, sa.private_key);
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive token failed ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Drive token missing access_token");
  return data.access_token;
}

export async function uploadToGDrive(opts: {
  accessToken: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
  folderId?: string;
}): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `pushpanel_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata: Record<string, unknown> = { name: opts.fileName };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const bodyStart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType ?? "application/x-sqlite3"}\r\n\r\n`;
  const bodyEnd = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(bodyStart), opts.fileBuffer, Buffer.from(bodyEnd)]);

  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive upload failed ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as { id: string; webViewLink?: string };
}
