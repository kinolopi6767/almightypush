import type { Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createECDH, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VapidPushProvider } from "./providers/vapid";
import { generateVapidKeys, createVapidConfig, decryptVapidConfig } from "./vapid";
import type { PushSubscriptionPayload } from "./providers/index";

const ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Self-signed localhost cert: web-push always speaks TLS (https.request),
// so the mock push service must be an HTTPS server. Test-only — Node rejects
// the cert via the global agent, which NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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

let server: Server;
let received: { path: string; headers: Record<string, string | string[] | undefined>; body: Buffer }[] = [];
let statusCode = 201;

beforeAll(async () => {
  server = createHttpsServer({ key: TLS_KEY, cert: TLS_CERT }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers as never, body: Buffer.concat(chunks) });
      res.writeHead(statusCode, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function mockPort(): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("server not listening");
  return addr.port;
}

/** A realistic browser-style subscription keypair (P-256 65-byte public). */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

function subscription(): PushSubscriptionPayload {
  return {
    endpoint: `http://127.0.0.1:${mockPort()}/push/sub-1`,
    keys: browserKeys(),
  };
}

describe("vapid helpers", () => {
  it("round-trips a keypair through at-rest encryption", () => {
    const config = createVapidConfig(ENC_KEY, "mailto:admin@example.com");
    // VAPID keys: private is 32 bytes (43 base64url), public is 65 bytes (87).
    expect(config.publicKey).toHaveLength(87);
    expect(config.privateKeyEnc.startsWith("v1:")).toBe(true);

    const plain = decryptVapidConfig(config, ENC_KEY);
    expect(plain.privateKey).toHaveLength(43);
    expect(plain.privateKey).not.toBe(config.privateKeyEnc);
    expect(() => decryptVapidConfig(config, undefined)).toThrow(/APP_ENC_KEY/);

    const keys = generateVapidKeys();
    expect(keys.publicKey).toHaveLength(87);
    expect(keys.privateKey).toHaveLength(43);
  });
});

describe("VapidPushProvider", () => {
  const { publicKey, privateKey } = generateVapidKeys();
  const provider = new VapidPushProvider();
  const vapidOptions = {
    vapid: {
      subject: "mailto:admin@example.com",
      publicKey,
      privateKey,
    },
    ttl: 3600,
    urgency: "normal" as const,
  };

  it("sends an encrypted payload with VAPID headers and treats 201 as success", async () => {
    received = [];
    statusCode = 201;
    const result = await provider.send(subscription(), { title: "Hello", body: "M1" }, vapidOptions);
    expect(result).toEqual({ ok: true, statusCode: 201 });

    expect(received).toHaveLength(1);
    const req = received[0]!;
    expect(req.path).toBe("/push/sub-1");
    expect(req.body.length).toBeGreaterThan(10); // encrypted, not plain JSON
    expect(req.body.toString("utf8")).not.toContain("Hello");

    const vapid = req.headers.authorization as string;
    expect(vapid).toMatch(/^vapid t=[^ ]+,\s*k=/);
    const token = vapid.match(/t=([^ ,]+)/)?.[1] ?? "";
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64 ?? "", "base64url").toString("utf8"));
    expect(payload.aud).toBe(`http://127.0.0.1:${mockPort()}`);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.sub).toBe("mailto:admin@example.com");
  });

  it("maps 410 Gone to a failed result with statusCode", async () => {
    received = [];
    statusCode = 410;
    const result = await provider.send(subscription(), { title: "x" }, vapidOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(410);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});