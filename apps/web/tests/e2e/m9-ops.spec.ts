import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

/**
 * M9 ops suite: /api/metrics + server status page, OpenAPI spec + API docs
 * page, and the integration guides page.
 */

test("metrics endpoint reports process and queue state", async ({ request }) => {
  const res = await request.get("/api/metrics");
  expect(res.status()).toBe(200);
  const m = (await res.json()) as {
    ok: boolean;
    uptimeSec: number;
    node: string;
    memory: { rss: number; heapUsed: number };
    db: { sizeBytes: number };
    queue: { queued: number; sending: number };
  };
  expect(m.ok).toBe(true);
  expect(m.uptimeSec).toBeGreaterThan(0);
  expect(m.node).toMatch(/^v\d+/);
  expect(m.memory.rss).toBeGreaterThan(0);
  expect(m.queue).toMatchObject({ queued: expect.any(Number), sending: expect.any(Number) });
});

test("server status page renders live cards", async ({ page }) => {
  await signInViaUi(page);
  await page.goto("/dashboard/status");
  await expect(page.getByRole("heading", { name: "Server status" })).toBeVisible();
  await expect(page.getByText("Uptime")).toBeVisible();
  await expect(page.getByText("Memory (heap)")).toBeVisible();
  await expect(page.getByText("Database", { exact: true })).toBeVisible();
  await expect(page.getByText("Worker readiness")).toBeVisible();
  await expect(page.getByText(/ready|degraded/)).toBeVisible();
});

test("openapi.json is served and describes the public endpoints", async ({ request }) => {
  const res = await request.get("/api/v1/openapi.json");
  expect(res.status()).toBe(200);
  const spec = (await res.json()) as { openapi: string; info: { title: string }; paths: Record<string, unknown> };
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.info.title).toBe("PushPanel API");
  expect(Object.keys(spec.paths)).toEqual(
    expect.arrayContaining(["/api/v1/subscribe", "/api/v1/info", "/api/v1/click/{deliveryId}", "/api/v1/automations/{id}/trigger"]),
  );
});

test("API docs page lists the endpoints from the spec", async ({ page }) => {
  await signInViaUi(page);
  await page.goto("/dashboard/api");
  await expect(page.getByRole("heading", { name: "API", exact: true })).toBeVisible();
  await expect(page.getByText("/api/v1/subscribe")).toBeVisible();
  await expect(page.getByText("/api/v1/info")).toBeVisible();
  await expect(page.getByText("/api/v1/automations/{id}/trigger")).toBeVisible();
  await expect(page.getByText("GET /api/v1/openapi.json")).toBeVisible();
});

test("guides page shows WordPress, Blogger and AMP sections with code", async ({ page }) => {
  await signInViaUi(page);
  await page.goto("/dashboard/guides");
  await expect(page.getByRole("heading", { name: "WordPress (push-on-publish webhook)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blogger (AutoMagic dynamic feed)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AMP pages (client SDK)" })).toBeVisible();
  await expect(page.getByText("functions.php").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Download WordPress plugin" })).toHaveAttribute("href", "/api/v1/plugin/wordpress");
});

test("wordpress plugin downloads as a valid zip", async ({ request }) => {
  const res = await request.get("/api/v1/plugin/wordpress");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const body = Buffer.from(await res.body());
  expect(body.subarray(0, 2).toString()).toBe("PK");
  // EOCD signature present at the tail (little-endian on disk)
  expect(body.subarray(body.length - 22, body.length - 18).toString("hex")).toBe("504b0506");
});