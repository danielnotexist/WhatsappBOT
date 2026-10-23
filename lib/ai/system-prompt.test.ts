import { describe, expect, it } from "vitest";
import { PLANS, TRIAL_MESSAGES } from "@/lib/billing/plans";
import type { SubscriptionRow } from "@/lib/db/types";
import { GOOGLE_SCOPES } from "@/lib/google/oauth";
import { MS_SCOPES } from "@/lib/ms/oauth";
import { BUILTIN_AGENTS } from "@/lib/agents/templates";
import { agentChoices, buildAgentSection, buildRouterAgentBlock } from "@/lib/agents/prompt";
import type { ResolvedAgent } from "@/lib/agents/policy";
import { accountContextOf } from "./account-context";
import { SUMMARY_PROMPT } from "./memory";
import { BASE_SYSTEM_PROMPT, ROUTER_INSTRUCTIONS, buildSystemPrompt, type UserContextInput } from "./system-prompt";

const NOW = new Date("2026-10-23T07:00:00Z"); // Friday 23.10.2026, 10:00 in Israel (summer time, +03:00)
const base: UserContextInput = { name: "דנה", businessName: null, businessType: null, timezone: "Asia/Jerusalem", morningTime: "07:30", connections: [], profile: {}, summary: null, facts: [], now: NOW };
const sub = (patch: Partial<SubscriptionRow>): SubscriptionRow => ({ id: "s", user_id: "u", plan: "basic", status: "active", next_charge_at: "2026-11-10T08:00:00.000Z", cancelled_at: null, started_at: null, charge_failures: 0, hyp_tokef: null, ...patch });

describe("system prompt — neutral Hebrew (Daniel's live test: \"כתוב\", \"אם תרצה\", \"אחרי שתאשר\", \"את או אתה\")", () => {
  it("states the neutral-addressing rule with do / don't examples", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("## פנייה ניטרלית למשתמש — חובה");
    expect(BASE_SYSTEM_PROMPT).toContain("כן: \"אפשר לכתוב ״שדרוג״\" · לא: \"כתוב ״שדרוג״\"");
    expect(BASE_SYSTEM_PROMPT).toContain("כן: \"אם מתאים\"");
    expect(BASE_SYSTEM_PROMPT).toContain("לא: \"אם תרצה\"");
    expect(BASE_SYSTEM_PROMPT).toContain("כן: \"אחרי האישור\" · לא: \"אחרי שתאשר\"");
    expect(BASE_SYSTEM_PROMPT).toContain("ואף פעם לא \"את או אתה\"");
  });

  it("forbids a gendered pronoun as the subject, in the present too (live eval: \"אתה על המסלול הבסיסי\" 3 of 3)", () => {
    expect(BASE_SYSTEM_PROMPT).toContain('- כן: "המסלול שלך: בסיסי" / "נשארו לך 749 הודעות" · לא: "אתה על המסלול הבסיסי" / "את בתקופת ניסיון".');
    expect(BASE_SYSTEM_PROMPT).toContain('לא לפתוח משפט ב"אתה" או "את" כנושא, גם בהווה');
  });

  it("the router's own reply is neutral too (live eval: \"אם תרצה\" / \"אם תצטרך\" in 6 of 8)", () => {
    expect(ROUTER_INSTRUCTIONS).toContain('- ב-reply: פנייה ניטרלית בלבד — "אם יש צורך" / "אם יעלה משהו", אף פעם לא "אם תרצה" / "אם תצטרך" / "אתה" / "את".');
    expect(ROUTER_INSTRUCTIONS).toContain('"תהיה לך גישה לדרייב?"');
  });

  it("writes its own rules in the infinitive — no masculine imperative outside the \"לא:\" examples", () => {
    const masculine = /(?:^|[\s"(])(?:כתוב|ענה|השתמש|אמור|הסבר|התעלם|ציין|שאל|טפל|תן|אתה|סכם|הוסף|בחר|החזר)(?=[\s,.:;!?")]|$)/u;
    const secretary = { key: "builtin:secretary", kind: "builtin", role: "secretary", rowId: null, name: BUILTIN_AGENTS.secretary.name, aliases: [], template: "secretary", capabilities: [], templateInstructions: BUILTIN_AGENTS.secretary.instructions, userInstructions: null, permissions: {}, status: "active", createdAt: null } as unknown as ResolvedAgent;
    // every model-facing text: the base prompt, the router, the memory summary, the agent section and the router's agent block
    for (const text of [BASE_SYSTEM_PROMPT, ROUTER_INSTRUCTIONS, SUMMARY_PROMPT, buildAgentSection(secretary), buildRouterAgentBlock(agentChoices([secretary]), "a1")]) {
      // the "don't" examples quote the forbidden forms on purpose; the button labels (שלח / ערוך / בטל) are the style guide's
      for (const line of text.split("\n").filter((l) => !l.includes("לא:") && !l.includes("אף פעם לא") && !l.includes("שלח בלי לשאול") && !l.includes("שלח / ערוך"))) {
        expect(line, line).not.toMatch(masculine);
      }
    }
  });

  it("forbids narrating internal retries and second-guessing a tool's result", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("לא לתאר ניסיונות, תיקונים או שגיאות פנימיות");
    expect(BASE_SYSTEM_PROMPT).toContain("בניסיון הראשון");
    expect(BASE_SYSTEM_PROMPT).toContain("לא לבטל ולא לקבוע מחדש משהו שכלי כבר ביצע");
  });
});

describe("system prompt — the product and the account (\"איזה מנוי אני\", \"אתה יכול ליצור לי סוכן\", \"לשדרג לפרו\")", () => {
  it("states the plans from lib/billing/plans.ts, the agents, and the upgrade / agent tools", () => {
    expect(BASE_SYSTEM_PROMPT).toContain(`- תקופת ניסיון: ${TRIAL_MESSAGES} הודעות`);
    // what each plan includes (lib/billing/plans.ts entitlements, the split of 23.10.2026)
    const oneAccount = "חשבון אחד: Google או Microsoft (לא שניהם); מייל, יומן (כולל קישור Meet / Teams), קריאת קבצים, תזכורות, סיכום בוקר והודעות קוליות";
    expect(BASE_SYSTEM_PROMPT).toContain(`- תקופת ניסיון: ${TRIAL_MESSAGES} הודעות. כולל: ${oneAccount}. שלושת הסוכנים המובנים (מזכירה, מתמחה, מנהלת חשבונות) כמו שהם, בלי סוכנים משלך.`);
    expect(BASE_SYSTEM_PROMPT).toContain(`- מסלול בסיסי: ${PLANS.basic.priceIls} ₪ לחודש כולל מע״מ, עד ${PLANS.basic.messages} הודעות בחודש. כולל: ${oneAccount}. בלי הסוכנים המובנים, סוכן אחד משלך.`);
    expect(BASE_SYSTEM_PROMPT).toContain(
      `- מסלול פרו: ${PLANS.pro.priceIls} ₪ לחודש כולל מע״מ, עד 3,000 הודעות בחודש. כולל: Google ו-Microsoft יחד; מייל, יומן (כולל קישור Meet / Teams), קריאת קבצים, תזכורות, סיכום בוקר והודעות קוליות; Google Tasks ו-Microsoft To Do; SharePoint; חיפוש וקריאה בכל ה-Drive (Docs, Sheets, Slides); שמירת מסמכים חדשים ב-Drive; התראות יזומות (״דברים שכדאי לא לפספס״ בסיכום הבוקר, עד 2 התראות דחופות ביום) ואזהרות פישינג. שלושת הסוכנים המובנים (מזכירה, מתמחה, מנהלת חשבונות), עד ${PLANS.pro.customAgents} סוכנים משלך. בקרוב, עוד לא פעיל ובלי מועד: סיכומי פגישות, חיבור למערכות העסק, כמו monday.com.`,
    );
    expect(BASE_SYSTEM_PROMPT).toContain("- שירות שלא כלול במסלול של המשתמש");
    expect(BASE_SYSTEM_PROMPT).toContain("הכלי pro_feature");
    expect(BASE_SYSTEM_PROMPT).toContain("start_agent_creation");
    expect(BASE_SYSTEM_PROMPT).toContain("אף פעם לא לומר שאי אפשר ליצור סוכנים");
    expect(BASE_SYSTEM_PROMPT).toContain("תמיד הכלי start_upgrade");
    expect(ROUTER_INSTRUCTIONS).toContain("המנוי, שדרוג, תשלום, יצירת סוכן");
  });

  it("gives the plan in force and what is left of it, from the subscription and the usage counter", () => {
    const trial = buildSystemPrompt({ ...base, account: accountContextOf(null, 7, NOW), agentNames: ["מזכירה", "מתמחה", "מנהלת חשבונות"] });
    expect(trial).toContain("- מסלול: תקופת ניסיון (אין מנוי בתשלום). נשארו 7 מתוך 10 הודעות (ההודעה הנוכחית כבר נספרה).");
    expect(trial).toContain("- סוכנים פעילים עכשיו: ״מזכירה״, ״מתמחה״, ״מנהלת חשבונות״.");
    expect(trial).toContain("- שדרוג או הפעלת מנוי: הכלי start_upgrade.");

    const basic = buildSystemPrompt({ ...base, account: accountContextOf(sub({}), 740, NOW) });
    expect(basic).toContain("- מסלול: בסיסי (99 ₪ לחודש), פעיל. נשארו 740 מתוך 750 הודעות החודש (ההודעה הנוכחית כבר נספרה). החיוב הבא: יום ג׳ 10.11.");
    expect(basic).toContain("- סוכנים במסלול הזה: בלי המובנים, סוכן אחד משלך.");
    expect(basic).toContain("- כלול במסלול הזה: חשבון אחד: Google או Microsoft (לא שניהם);");
    expect(basic).toContain("- לא כלול במסלול הזה (רק בפרו): חיבור של Google ושל Microsoft יחד; משימות ב-Google Tasks וב-Microsoft To Do; חיפוש וקריאה ב-SharePoint של הארגון; שמירת מסמכים חדשים ב-Google Drive; חיפוש וקריאה בכל הקבצים ב-Google Drive (Docs, Sheets ו-Slides); התראות יזומות מהמייל ומהיומן ואזהרות פישינג. בקשה לאחד מהם: הכלי pro_feature.");
    expect(basic).toContain("- שדרוג לפרו: הכלי start_upgrade.");

    const pro = buildSystemPrompt({ ...base, account: accountContextOf(sub({ plan: "pro", scheduled_plan: "basic" }), 2990, NOW) });
    expect(pro).toContain("- מסלול: פרו (299 ₪ לחודש), פעיל. נשארו 2,990 מתוך 3,000 הודעות החודש (ההודעה הנוכחית כבר נספרה).");
    expect(BASE_SYSTEM_PROMPT).toContain("לא לתקן בסוגריים הודעות קודמות");
    expect(pro).toContain("- מתוכנן מעבר למסלול בסיסי ב-יום ג׳ 10.11.");
    expect(pro).not.toContain("start_upgrade.\n"); // no upgrade line for pro
    expect(pro).toContain("- כלול במסלול הזה: Google ו-Microsoft יחד;");
    expect(pro).not.toContain("- לא כלול במסלול הזה");

    const cancelled = buildSystemPrompt({ ...base, account: accountContextOf(sub({ status: "cancelled", cancelled_at: "2026-10-20T08:00:00Z" }), 10, NOW) });
    expect(cancelled).toContain("- מסלול: בסיסי (99 ₪ לחודש) — המנוי בוטל, והמסלול פעיל עד יום ג׳ 10.11.");
  });

  it("only user facts from the profile reach the model — never bot state (an OAuth start, a login nonce, timestamps)", () => {
    const prompt = buildSystemPrompt({
      ...base,
      profile: {
        pain_points: ["pain_email", "pain_followup"],
        morning_summary_enabled: false,
        oauth_pending: { microsoft: { state: "st-123", verifier: "verifier-secret", started_at: "2026-10-23T00:40:00Z", via: "chat" }, google: null },
        login_token: { nonce_hash: "hash-abc", exp: 1 },
        trial_ended_notified_at: "2026-10-22T08:00:00Z",
        pending_input: "שאלה",
        onboarding: { step: "done" },
      },
    });
    expect(prompt).toContain("- מה מעמיס במיוחד: מיילים שמחכים לתשובה; מעקבים ותזכורות");
    expect(prompt).toContain("- סיכום בוקר: כבוי");
    for (const leak of ["oauth_pending", "verifier-secret", "st-123", "login_token", "hash-abc", "trial_ended_notified_at", "pending_input", "onboarding"]) expect(prompt).not.toContain(leak);
  });
});

describe("system prompt — connections and what they allow (granted scopes)", () => {
  it("lists each connected account with its capabilities; Drive is honest about drive.file", () => {
    const prompt = buildSystemPrompt({
      ...base,
      connections: [
        { provider: "microsoft", accountEmail: "dana@levi-law.co.il", scopes: ["openid", "offline_access", "https://graph.microsoft.com/Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read.All"] },
        { provider: "google", accountEmail: "dana.levi@gmail.com", scopes: ["openid", "email", GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend] },
      ],
    });
    const section = prompt.slice(prompt.indexOf("## חיבורים"), prompt.indexOf("## זמן"));
    expect(section).toContain("- Microsoft 365 מחובר (dana@levi-law.co.il):");
    expect(section).toContain("מייל Outlook — קריאה, חיפוש, סיכום והעברה");
    expect(section).toContain("קבצים ב-OneDrive וב-SharePoint — חיפוש וקריאה בלבד");
    expect(section).toContain("כולל פגישה עם קישור Teams");
    expect(section).toContain("- Google מחובר (dana.levi@gmail.com):");
    expect(section).toContain("רק קבצים שנוצרו או נפתחו דרכי (הרשאת drive.file). אין גישה לשאר הקבצים ב-Drive");
    // live eval: Sonnet added "או ששותפו איתי" — the line rules it out explicitly
    expect(section).toContain("גם לא לקבצים או לתיקיות ששותפו עם המשתמש");
    expect(section).toContain("  • חשבון אחר או חיבור מחדש: אפשר לכתוב ״לחבר מחדש את גוגל״");
    // every capability line opens in Hebrew (WhatsApp lays a line out by its first letter)
    for (const line of section.split("\n").filter((l) => l.startsWith("  • "))) expect(line.slice(4), line).toMatch(/^[\u0590-\u05FF]/);
    expect(section).toContain("כולל פגישה עם קישור Google Meet");
    expect(section).toContain("קריאת מיילים ב-Gmail — עדיין אין הרשאה");
    expect(prompt).toContain('לא לומר "יתברר אחרי האישור"');

    const reading = buildSystemPrompt({ ...base, gmailRead: true, connections: [{ provider: "google", accountEmail: "a@gmail.com", scopes: [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailSend] }] });
    expect(reading).toContain("קריאה, חיפוש וסיכום של מיילים ב-Gmail");
    expect(reading).not.toContain("יומן Google — הצגה"); // calendar.events not granted → not claimed
  });

  it("a provider that is not connected: what a connection would allow (the scopes the app asks for)", () => {
    const prompt = buildSystemPrompt({ ...base, connections: [{ provider: "microsoft", accountEmail: "dana@levi-law.co.il", scopes: [...MS_SCOPES] }] });
    expect(prompt).toContain("- Google לא מחובר. אחרי חיבור (״לחבר את גוגל״):");
    expect(prompt).toContain("קבצים ב-Google Drive — רק קבצים שנוצרו או נפתחו דרכי");
    expect(prompt).toContain("קריאת מיילים ב-Gmail — בשלב הזה רק למשתמשים הראשונים");
    expect(prompt).not.toContain("Microsoft 365 לא מחובר");
  });

  it("one account on basic: the other provider cannot join; a paused second account is named as such; SharePoint and the whole Drive are pro", () => {
    const account = accountContextOf(sub({}), 700, NOW);
    const ms = { provider: "microsoft" as const, accountEmail: "dana@levi-law.co.il", scopes: [...MS_SCOPES] };
    const one = buildSystemPrompt({ ...base, account, connections: [ms] });
    const section = one.slice(one.indexOf("## חיבורים"), one.indexOf("## זמן"));
    expect(section).toContain("- Google לא מחובר, ובמסלול הזה אי אפשר לחבר אותו בנוסף ל-Microsoft 365 (חשבון אחד). חשבון שני: הכלי pro_feature (second_account).");
    expect(section).not.toContain("אחרי חיבור (״לחבר את גוגל״)");
    expect(section).toContain("קבצים ב-OneDrive — חיפוש וקריאה בלבד (בלי שמירה ובלי שיתוף; SharePoint רק בפרו)");

    const paused = buildSystemPrompt({ ...base, account, connections: [ms], pausedProviders: ["google"] });
    expect(paused).toContain("- Google מחובר אבל מושהה: במסלול הזה עובדים עם חשבון אחד, והפעיל הוא Microsoft 365. אין גישה ל-Google עד שבוחרים: ניתוק של אחד מהם באזור האישי, או שדרוג לפרו (שניהם יחד).");

    const google = buildSystemPrompt({ ...base, account, connections: [{ provider: "google", accountEmail: "a@gmail.com", scopes: [GOOGLE_SCOPES.driveFile] }] });
    expect(google).toContain("חיפוש בכל ה-Drive ושמירת מסמכים — רק בפרו");
    expect(google).toContain("- Microsoft 365 לא מחובר, ובמסלול הזה אי אפשר לחבר אותו בנוסף ל-Google");
  });
});

describe("system prompt — \"מחר\" after midnight", () => {
  it("in the small hours names the coming morning's date and the one-tap move; not during the day", () => {
    const night = buildSystemPrompt({ ...base, now: new Date("2026-10-23T00:43:00Z") }); // 03:43 in Israel
    expect(night).toContain("עכשיו: 23.10.2026, יום שישי, השעה 03:43");
    expect(night).toContain("- עכשיו אחרי חצות: מי שאומר עכשיו \"מחר\" מתכוון בדרך כלל לבוקר הקרוב — כלומר להיום, יום ו׳ 23.10.");
    expect(night).toContain("לא לתקן, לבטל או לקבוע מחדש בעצמך");
    const day = buildSystemPrompt(base);
    expect(day).toContain("\"מחר\" = מחר לפי התאריך הזה");
    expect(day).not.toContain("אחרי חצות");
    expect(buildSystemPrompt({ ...base, now: new Date("2026-10-23T02:00:00Z") })).not.toContain("עכשיו אחרי חצות"); // 05:00
  });
});
