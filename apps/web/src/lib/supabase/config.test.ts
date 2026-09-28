import { afterEach, describe, expect, it } from "vitest";
import { getConfirmationUrl } from "./config";

const previousBase = process.env.APP_BASE_URL;
afterEach(() => { if (previousBase === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previousBase; });

describe("confirmation URL", () => {
  it("uses only the configured origin and fixed callback path", () => {
    process.env.APP_BASE_URL = "https://example.com/untrusted?next=https://evil.test";
    expect(getConfirmationUrl()).toBe("https://example.com/auth/callback");
  });
  it("accepts local development URLs without preserving a path", () => {
    process.env.APP_BASE_URL = "http://localhost:3000/welcome";
    expect(getConfirmationUrl()).toBe("http://localhost:3000/auth/callback");
    process.env.APP_BASE_URL = "http://127.0.0.1:3000";
    expect(getConfirmationUrl()).toBe("http://127.0.0.1:3000/auth/callback");
  });
  it("rejects absent, malformed, insecure remote and credential-bearing URLs", () => {
    delete process.env.APP_BASE_URL;
    expect(getConfirmationUrl()).toBeUndefined();
    for (const invalid of ["not a URL", "http://example.com", "http://192.168.1.1:3000", "ftp://example.com", "https://user:secret@example.com"]) {
      process.env.APP_BASE_URL = invalid;
      expect(getConfirmationUrl()).toBeUndefined();
    }
  });
});
