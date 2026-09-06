import { describe, expect, it } from "vitest";
import { canEdit, canManage, isOwner, normalizeRole, requireEditorRole } from "@/lib/roles";
import { OPENAPI_SPEC } from "@/lib/openapi";

describe("roles", () => {
  it("fails closed on unknown/missing roles", () => {
    expect(normalizeRole(undefined)).toBe("viewer");
    expect(normalizeRole("superadmin")).toBe("viewer");
    expect(canEdit(undefined)).toBe(false);
    expect(canEdit("viewer")).toBe(false);
    expect(requireEditorRole("viewer")).toMatch(/Viewer/);
  });

  it("allows editor+ to edit, admin+ to manage, owner only for owner", () => {
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("admin")).toBe(true);
    expect(canEdit("owner")).toBe(true);
    expect(canManage("editor")).toBe(false);
    expect(canManage("admin")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("owner")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(canEdit("EDITOR")).toBe(true);
    expect(isOwner("Owner")).toBe(true);
  });
});

describe("openapi completeness", () => {
  it("documents every public v1 route", () => {
    const paths = Object.keys((OPENAPI_SPEC as { paths: Record<string, unknown> }).paths);
    for (const p of [
      "/api/v1/subscribe",
      "/api/v1/resubscribe",
      "/api/v1/unsubscribe",
      "/api/v1/optin",
      "/api/v1/tags",
      "/api/v1/info",
      "/api/v1/click/{deliveryId}",
      "/api/v1/send",
      "/api/v1/stats",
      "/api/v1/track",
      "/api/v1/journeys",
      "/api/v1/automations/{id}/trigger",
      "/api/v1/lp/subscribed",
      "/api/v1/ai/hook",
      "/api/v1/ai/spam-score",
      "/api/v1/ai/translate",
      "/api/v1/ai/url-to-campaign",
      "/api/v1/ai/image",
      "/api/v1/ai/research",
    ]) {
      expect(paths, p).toContain(p);
    }
  });
});
