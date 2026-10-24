import { describe, expect, it, vi } from "vitest";
import { RESEND_ENDPOINT, ResendMailer, otpEmailContent } from "./resend";

describe("ResendMailer", () => {
  it("posts a Hebrew RTL email with the code and bearer auth", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(RESEND_ENDPOINT);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string; text: string; from: string };
      expect(body.to).toEqual(["dana@example.com"]);
      expect(body.subject).toContain("123456");
      expect(body.html).toContain('dir="rtl"');
      expect(body.text).toContain("10 דקות");
      expect(body.from).toContain("no-reply@");
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    });
    const mailer = new ResendMailer({ apiKey: "re_test", from: "X <no-reply@x.co.il>", productName: "X", fetchImpl: fetchImpl as typeof fetch });
    const r = await mailer.sendOtp({ to: "dana@example.com", code: "123456", ttlMinutes: 10 });
    expect(r.id).toBe("em_1");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws on provider errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 422 }));
    const mailer = new ResendMailer({ apiKey: "k", from: "f", productName: "X", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(mailer.sendOtp({ to: "a@b.co", code: "000000", ttlMinutes: 10 })).rejects.toThrow(/422/);
  });

  it("an owner alert: one mail to every owner address, text + HTML, Reply-To only when given", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: "em_2" }), { status: 200 });
    });
    const mailer = new ResendMailer({ apiKey: "re_test", from: "X <no-reply@x.co.il>", productName: "X", fetchImpl: fetchImpl as typeof fetch });
    await mailer.sendOwnerAlert({ to: ["a@x.co", "b@x.co"], subject: "נרשם חדש", text: "t", html: "<p>h</p>", replyTo: "dana@example.com" });
    await mailer.sendOwnerAlert({ to: ["a@x.co"], subject: "s", text: "t", html: "h" });
    expect(bodies[0]).toEqual({ from: "X <no-reply@x.co.il>", to: ["a@x.co", "b@x.co"], subject: "נרשם חדש", text: "t", html: "<p>h</p>", reply_to: "dana@example.com" });
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });

  it("escapes the product name in HTML", () => {
    const c = otpEmailContent({ to: "a@b.co", code: "111111", ttlMinutes: 10 }, "<b>");
    expect(c.html).toContain("&lt;b&gt;");
  });
});
