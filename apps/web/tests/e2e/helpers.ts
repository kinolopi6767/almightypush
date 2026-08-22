import { createECDH, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpsServer } from "node:https";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page, APIRequestContext } from "@playwright/test";

const WEB_DIR = fileURLToPath(new URL("../..", import.meta.url));
const WORKER_ENTRY = path.join(WEB_DIR, "..", "worker", "dist", "index.cjs");

export const OWNER_EMAIL = "e2e-owner@test.io";
export const OWNER_PASSWORD = "s3cure-password-123";

/** Self-signed localhost keypair — web-push only speaks TLS, so the mock push
 *  service must be HTTPS. Tests are trusted via NODE_TLS_REJECT_UNAUTHORIZED=0
 *  (set in playwright.config for every spawned process). */
const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC/JhE2YcGg7M0s
A9HWwci061xI0JxH2TrxyCxKY+lqfu1eODoTNU32QyiRlPzyXYcxrBQ9+g2LOrH9
h2lsjLHOvsuznzQs+i6ZSRVw7e6JrJiiKq2+mi52M/i4jBDgqo41tmnsu5xZjy3S
/555A7IvMI3VM6FMN7uuC2q+1xVnE/otuQLFQrTOUI8qOB6+auLhhNpSh153cl5L
kGmBI1zLKlAUhQOpRWlBwDJzGm4bsCdMgvyzsH2iVcrdIKPNhZxX2vmB87IIUU2p
u7wnpbVJTHSsyESErh3VLGxim8oNZkZ8Rf8r6spibcw2+Y2MlFZjodNIiKHKR3Uf
Fg04yYpBAgMBAAECggEADimsESX0GqWBBuJaPA8hUmUKnOs2sSIjemz/pHFmXDl/
ApdS7OprAN9KqbgVd9W94cx4ttDeC7NeeG+okYjpLG2O7/D7WjEdSRvqUUg9KjPr
c+nf9A/ozQxJFk9rzrcEZhltHBkYhWWU78h4fZ9BprpyaoTH+OWQ6901Bw0uV56O
sW4L4jkTxuqetSMAk4MDKJLrDAXguxtW2IyP7dHyLtS7LSQ2yN3/+GyWouiMK4Sg
qYMiVk32LFuH9NsHf9HkuHqFUImHH+CWH4h2n2FUM2gsLcgyQnC1THT19is4/fKz
YndRwujz+7QcVT913uwriaosJ2+P+wEBP1biSwOzeQKBgQDguSFOxZI7Ga5XUlf9
H+mCJWOZjFNZ87/CfzT3ddiwa9JW/eC8LZGFlX3W5m5uXLGKJr/yd/kS70Fw/R/x
alaqHrYUCcjUzLyrB2/Kdt2VBkKLEyJoPwPcVOIUcDlLwrlKwpMfAOAepDDw/5jw
6Skzs9DdvuCr2I/SvfAtZ2JWRQKBgQDZwK5xsGaAFcafpPaUMB9V+/YK43wAmK01
D70Dk0ouXZdBGh5ExctpPAYYaR67O5v0zgvfN4bsnINoL4pfzPIPpdTaD6z8hvEP
+BpTh5wit+9ESjkNgWhMmUrbgwM6edLc25ZFlKnz5B72S6i+iOXsNZLYynAL84u0
iD3j3X5xzQKBgEa9QCThwJRmEyFdxGDj6MeVKXMuXxaTyitZi7zSFfIDHuVPaa0S
0xov4rsBMoX/G8wXQpj69ybktb7xj1qZVMqcfEh2hAeoo0NbRe9/12SP4eaRkWUr
YPW8qqYwZXjZxSYpddJunh5HJTjX3LcJTnT+B6Ol8Gdn9m4qaC6CusvZAoGAb9/+
AC04TGBjvwvbIAGlZ+De5XNA93F5tARVASxAdZfiKTGJEZ5pxrRvEUWY42tZ0im2
kcWOjaxQG0wplNTQHNf/htV88/VEjwbSR84pmvDTfkuACn9NHeW4PxWNqBKFErHD
ABbERqkSe0od9V6Seox/2OARNyK2yVciLRtUZpUCgYEAw4voDZSJO3qMtQUB8cub
2T3quYAeo76fGiEnByhZSveQmZd58UP70NworCryiK117REW3npd+cIo7SgYINPG
IRn/pydfCZcL1IYZk6+EiCcBdXz+NmyCdOOYa9kw8x8UdBBlwykfN2yam1dkLXcB
a/3J9xvbMQubHJdUnCM9vkw=
-----END PRIVATE KEY-----`;
const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUdfUK8NYtp9yJxTklLhpQIus5cVYwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgwODIyNDMzMFoXDTM2MDgw
NTIyNDMzMFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAvyYRNmHBoOzNLAPR1sHItOtcSNCcR9k68cgsSmPpan7t
Xjg6EzVN9kMokZT88l2HMawUPfoNizqx/YdpbIyxzr7Ls580LPoumUkVcO3uiayY
oiqtvpoudjP4uIwQ4KqONbZp7LucWY8t0v+eeQOyLzCN1TOhTDe7rgtqvtcVZxP6
LbkCxUK0zlCPKjgevmri4YTaUoded3JeS5BpgSNcyypQFIUDqUVpQcAycxpuG7An
TIL8s7B9olXK3SCjzYWcV9r5gfOyCFFNqbu8J6W1SUx0rMhEhK4d1SxsYpvKDWZG
fEX/K+rKYm3MNvmNjJRWY6HTSIihykd1HxYNOMmKQQIDAQABo28wbTAdBgNVHQ4E
FgQUCS6dSPX+i+3cYXgHxNF89DRK18YwHwYDVR0jBBgwFoAUCS6dSPX+i+3cYXgH
xNF89DRK18YwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAKuVF2A64vQ6+Ex2udkmaQ3NmElnncKu
4leriEw64C/4aNnP4d0siT3VCF4xY0hZhSWfA3mCfVsDHzRDVRDD+h8TLsPOWqKk
qW8YVMmqMiJIfZALSTaN2sSiQsIxFdi9hXLxw3xIIOh+vzKpR4iTo/ijbsv86xTX
Ejaf4PFrfkOl+85c3052ysAOyu+DiI612XpcScvC9Pg3RqPxutXFe8WFPmWEujOV
EBcHe3lYo1w2g4CcnIGDS+tx6Nob7CrJ/LOxxpdHPLe6ah9wRn2md9KuvEJ86tCM
y1XlKK1w196rKdGRxGD+VO+YmOj2lOrSHfmKh6uOURyRobxcaatJ6hs=
-----END CERTIFICATE-----`;

export interface MockPushServer {
  port: number;
  received: { path: string; headers: Record<string, string | string[] | undefined>; body: Buffer }[];
  close: () => Promise<void>;
}

/** Spawns the sender worker (dev mode) against the e2e DB. Resolves once the
 *  worker reports its database is open. Must be stopped by the caller. */
export function startWorker(): Promise<{ stop: () => Promise<void> }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_PATH: process.env.E2E_DB_PATH,
    APP_ENC_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    WORKER_TICK_MS: "1000",
    WORKER_IDLE_TICK_MS: "1000",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  };
  const child: ChildProcess = spawn(process.execPath, [WORKER_ENTRY], {
    cwd: WEB_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  const tee = (stream: "stdout" | "stderr", data: Buffer) => {
    if (stream === "stderr") stderr += String(data);
    process.stdout.write(`[worker] ${String(data)}`);
  };
  child.stdout?.on("data", (c) => tee("stdout", c));
  child.stderr?.on("data", (c) => tee("stderr", c));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`worker did not start in time:\n${stderr}`));
    }, 60_000);
    child.stdout?.on("data", (chunk) => {
      const out = String(chunk);
      if (out.includes("database open")) {
        clearTimeout(timeout);
        resolve({
          stop: () =>
            new Promise<void>((done) => {
              child.once("exit", () => done());
              child.kill("SIGTERM");
            }),
        });
      }
    });
    child.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error(`worker exited early:\n${stderr}`));
    });
  });
}

export async function startMockPushServer(): Promise<MockPushServer> {
  const received: MockPushServer["received"] = [];
  const server = createHttpsServer({ key: TLS_KEY, cert: TLS_CERT }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers as never, body: Buffer.concat(chunks) });
      res.writeHead(201, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

export interface MockHttpServer {
  port: number;
  /** responses keyed by path (or "default"); body is JSON-serialized unless contentType is xml/plain */
  responses: Map<string, { status?: number; contentType?: string; body: unknown }>;
  close: () => Promise<void>;
}

/** Plain-HTTP mock for upstream fetches (WP REST API, RSS feeds) in worker tests. */
export async function startMockHttpServer(): Promise<MockHttpServer> {
  const responses = new Map<string, { status?: number; contentType?: string; body: unknown }>();
  const server = createServer((req, res) => {
    const hit = responses.get(req.url ?? "/") ?? responses.get("default");
    if (!hit) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const body = typeof hit.body === "string" && hit.contentType?.startsWith("text") ? String(hit.body) : JSON.stringify(hit.body);
    res.writeHead(hit.status ?? 200, { "content-type": hit.contentType ?? "application/json" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    responses,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Realistic browser-style subscription keys (P-256 65-byte public key). */
export function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") };
}

/**
 * Ensures the owner exists (first-run setup UI, if the DB is fresh) and signs
 * in. Idempotent — every e2e test calls this; only the first creates.
 */
export async function signInViaUi(page: Page): Promise<void> {
  await page.request.post("/api/auth/signout", { form: {} }).catch(() => undefined);
  await page.goto("/setup");
  if (await page.getByRole("heading", { name: /set up pushpanel/i }).isVisible().catch(() => false)) {
    await page.getByLabel("Name").fill("E2E Owner");
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /setup/i }).click();
    // The action either redirects to /login (success) or reports that the
    // owner already exists (stays on /setup) — both mean "proceed to
    // sign-in". Never hang waiting on one specific outcome.
    await page.waitForURL(/\/login|\/dashboard/, { timeout: 30_000 }).catch(() => undefined);
    if (!/\/login|\/dashboard/.test(page.url())) await page.goto("/login");
  }
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Creates a domain through the panel UI and returns its id. */
export async function createDomain(page: Page, hostname: string): Promise<number> {
  await page.goto("/dashboard/domains");
  await page.getByLabel("Hostname").fill(hostname);
  await page.getByRole("button", { name: /create domain/i }).click();
  await page.waitForURL(/\/dashboard\/domains\/\d+/);
  return Number(new URL(page.url()).pathname.split("/").pop());
}

/** SDK-equivalent subscribe call against the mock push service. */
export async function subscribeViaApi(
  request: APIRequestContext,
  mock: MockPushServer,
  domainId: number,
  label = "sub",
  device?: string,
): Promise<void> {
  const res = await request.post("/api/v1/subscribe", {
    data: {
      domainId,
      subscription: {
        endpoint: `https://127.0.0.1:${mock.port}/push/${label}`,
        keys: browserKeys(),
      },
      browser: "chromium",
      os: "linux",
      device: device ?? "desktop",
      // simulates the SDK payload from a panel-hosted page (sandbox demo)
      subscribeUrl: "https://127.0.0.1:3100/demo",
    },
  });
  if (!res.ok()) throw new Error(`subscribe failed: ${res.status()} ${await res.text()}`);
}

/** Local datetime-local value (browser-local time) for `ms` from now. */
export function localDateTime(msFromNow: number): string {
  const d = new Date(Date.now() + msFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
