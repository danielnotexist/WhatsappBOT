import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { oauthReturnUrl } from "@/lib/auth/oauth-return";
import { payResultUrl } from "@/lib/billing/result";
import { FLASH_SIG_PARAM, flashQuery, readFlash, setFlash } from "./flash";

const key = randomBytes(32);

describe("signed result lines (?notice= / ?error=)", () => {
  it("a line this site set reads back; a crafted, altered or re-labelled one does not", () => {
    const sp = new URLSearchParams("tab=plan");
    setFlash(sp, "error", "הכרטיס לא עודכן.", key);
    expect(readFlash(sp, { key })).toEqual({ kind: "error", text: "הכרטיס לא עודכן." });
    // the phisher's own text on the real domain
    expect(readFlash(new URLSearchParams("tab=plan&error=להעביר 99 ₪ בביט ל-050"), { key })).toBeNull();
    // a real signature next to other words
    const altered = new URLSearchParams(sp);
    altered.set("error", "להעביר 99 ₪ בביט ל-050");
    expect(readFlash(altered, { key })).toBeNull();
    // an error's signature does not make the same words a notice
    const relabelled = new URLSearchParams({ notice: "הכרטיס לא עודכן.", [FLASH_SIG_PARAM]: sp.get(FLASH_SIG_PARAM)! });
    expect(readFlash(relabelled, { key })).toBeNull();
    // another key (another deployment) never verifies
    expect(readFlash(sp, { key: randomBytes(32) })).toBeNull();
    // page props shape, and the kinds a page accepts
    expect(readFlash(Object.fromEntries(new URLSearchParams(flashQuery("notice", "נשמר.", key))), { key })).toEqual({ kind: "notice", text: "נשמר." });
    expect(readFlash(new URLSearchParams(flashQuery("notice", "נשמר.", key)), { key, kinds: ["error"] })).toBeNull();
  });

  it("the OAuth return and the payment return sign what they send", () => {
    process.env.TOKEN_ENC_KEY ||= randomBytes(32).toString("base64");
    const back = new URL(oauthReturnUrl("https://alze.ai", "account", "google", { ok: false, error: "החיבור לא הושלם." }));
    expect(readFlash(back.searchParams)).toEqual({ kind: "error", text: "החיבור לא הושלם." });
    const onb = new URL(oauthReturnUrl("https://alze.ai", "onboarding", "microsoft", { ok: false, error: "נסו שוב." }));
    expect(readFlash(onb.searchParams, { kinds: ["error"] })?.text).toBe("נסו שוב.");
    const paid = payResultUrl("https://alze.ai", { signedIn: true, result: "paid", message: "התשלום התקבל." });
    expect(readFlash(paid.searchParams)).toEqual({ kind: "notice", text: "התשלום התקבל." });
  });
});
