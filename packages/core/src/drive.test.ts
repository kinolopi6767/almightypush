import { describe, expect, it } from "vitest";
import { getGDriveAccessToken } from "./drive";

describe("drive token_uri SSRF pin", () => {
  const sa = (token_uri?: string) => ({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: "k", ...(token_uri === undefined ? {} : { token_uri }) });

  it("rejects non-Google token hosts before any network", async () => {
    await expect(getGDriveAccessToken(sa("http://169.254.169.254/token"))).rejects.toThrow(/Google OAuth endpoint/);
    await expect(getGDriveAccessToken(sa("https://evil.example.com/token"))).rejects.toThrow(/Google OAuth endpoint/);
    await expect(getGDriveAccessToken(sa("http://oauth2.googleapis.com/token"))).rejects.toThrow(/Google OAuth endpoint/);
    await expect(getGDriveAccessToken(sa("not a url"))).rejects.toThrow(/bad token_uri/);
  });

  it("rejects lookalike suffix hosts", async () => {
    await expect(getGDriveAccessToken(sa("https://googleapis.com.evil.com/x"))).rejects.toThrow(/Google OAuth endpoint/);
  });

  it("rejects invalid JSON and missing fields", async () => {
    await expect(getGDriveAccessToken("{{{")).rejects.toThrow(/not valid JSON/);
    await expect(getGDriveAccessToken("{}")).rejects.toThrow(/missing client_email/);
  });
});
