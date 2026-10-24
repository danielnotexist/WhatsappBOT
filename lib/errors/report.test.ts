import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { cleanContext, errorMessage, reportError, scrubSecrets } from "./report";

describe("scrubSecrets", () => {
  it("hides tokens, keys, codes in URLs and long opaque strings; keeps the words", () => {
    const out = scrubSecrets(
      "Graph 401 for Bearer eyJ0eXAiOiJKV1QiLCJhbGciOi.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpM at https://x.example/cb?code=abc123&state=zzz9 key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA password=hunter2 re_123456789012345 card 4580 1234 5678 9012",
    );
    expect(out).not.toMatch(/eyJ0eXAi|abc123|zzz9|sk-ant|hunter2|re_1234|4580 1234/);
    expect(out).toContain("Graph 401 for Bearer [הוסתר]");
    expect(out).toContain("?code=[הוסתר]&state=[הוסתר]");
    expect(scrubSecrets(`token ${"a1B2".repeat(12)} end`)).toBe("token [הוסתר] end");
  });

  it("keeps ids, paths and short numbers readable", () => {
    const t = "job 11111111-1111-4111-8111-111111111111 failed on /api/auth/google/callback after 3 attempts (HTTP 503)";
    expect(scrubSecrets(t)).toBe(t);
  });
});

describe("errorMessage / cleanContext", () => {
  it("the message of anything thrown, on one line, capped at 500", () => {
    expect(errorMessage(new TypeError("x is undefined"))).toBe("TypeError: x is undefined");
    expect(errorMessage(new Error("plain"))).toBe("plain");
    expect(errorMessage("a\n  b")).toBe("a b");
    expect(errorMessage({ code: 7 })).toBe('{"code":7}');
    expect(errorMessage(new Error("word ".repeat(200))).length).toBe(500);
  });

  it("a few short scalars; secret-named keys hidden; objects flattened and scrubbed", () => {
    const ctx = cleanContext({ path: "/account", n: 3, ok: true, token: "abc", nested: { authorization: "Bearer abcdefghijklmnop" }, gone: undefined, "bad key!": "x" });
    expect(ctx).toMatchObject({ path: "/account", n: 3, ok: true, token: "[הוסתר]", badkey: "x" });
    expect(Object.keys(ctx).sort()).toEqual(["badkey", "n", "nested", "ok", "path", "token"]);
    expect(ctx.nested).toContain("authorization");
    expect(ctx.nested).not.toContain("abcdefghijklmnop");
  });
});

describe("reportError", () => {
  it("writes a scrubbed row with the user, and never throws", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@example.com");
    await reportError("oauth.google", new Error("refresh failed: refresh_token=1//0gABCDEF"), { db, userId: u.id, context: { code: "invalid_grant" } });
    const [row] = await db.listAppErrors({ limit: 1 });
    expect(row).toMatchObject({ source: "oauth.google", user_id: u.id, context: { code: "invalid_grant" } });
    expect(row!.message).toBe("refresh failed: refresh_token=[הוסתר]");

    const broken = new MemoryDb();
    broken.insertAppError = async () => {
      throw new Error("db down");
    };
    await expect(reportError("bot", new Error("x"), { db: broken })).resolves.toBeUndefined();
  });
});
