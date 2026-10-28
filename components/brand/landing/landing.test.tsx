// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES, planFeatures } from "@/lib/billing/plans";
import { INTEGRATIONS, integrationsForPlan } from "@/lib/integrations/catalogue";
import { Connectors } from "./connectors";
import { FAQ, HERO_SCRIPT, PRICING, PROFESSIONS, SCENES, TRUST } from "./content";
import { DaySection } from "./day-scenes";
import { DaySwitch } from "./day-switch";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { LandingFooter } from "./footer";
import { AccountCta, LandingHeader } from "./header";
import { Hero } from "./hero";
import { THREAD } from "./phone-parts";
import { Pricing } from "./pricing";
import { Professions } from "./professions";
import { Trust } from "./trust";

/** Same rule as components/ui/button.test.tsx (the brand/auth scan), applied to the landing page's own files. */
const PHYSICAL_CLASS =
  /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|(^|:)(text-left|text-right|float-left|float-right|clear-left|clear-right|border-l|border-r|rounded-l|rounded-r)$/;

function classTokens(source: string): string[] {
  const literals = [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
  return literals.flatMap((l) => l.split(/[\s{}$]+/)).filter(Boolean);
}

const here = __dirname;
const sources = [
  ...readdirSync(here)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map((f) => join(here, f)),
  join(here, "..", "..", "..", "app", "page.tsx"),
];

function mockMatchMedia(matches: (q: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  mockMatchMedia((q) => q.includes("prefers-reduced-motion: reduce"));
});
afterEach(cleanup);

describe("landing sources", () => {
  it("finds the landing files and the page", () => {
    expect(sources.some((f) => f.endsWith("day-pinned.tsx"))).toBe(true);
    expect(sources.some((f) => f.endsWith(join("app", "page.tsx")))).toBe(true);
  });

  it.each(
    sources.map((f) => [
      f.slice(f.indexOf("components") >= 0 ? f.indexOf("components") : f.indexOf("app")),
      f,
    ]),
  )(
    "%s uses only logical (start/end) classes and never hard-codes the brand name",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      expect(classTokens(src).filter((t) => PHYSICAL_CLASS.test(t))).toEqual([]);
      expect(src.includes(BRAND.name)).toBe(false);
    },
  );
});

describe("copy", () => {
  const allCopy = JSON.stringify({ HERO_SCRIPT, SCENES, PROFESSIONS, TRUST, PRICING, FAQ, THREAD });

  it("never uses slash gender forms (שלח/י) — neutral phrasing only", () => {
    expect(allCopy).not.toMatch(/[א-ת]\/[א-ת]/);
  });

  it("every 'יום X׳ DD.MM' in the stories is the right weekday in 2026", () => {
    const days = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
    const all = [allCopy, readFileSync(join(here, "phone-parts.tsx"), "utf8")].join("\n");
    const pairs = [...all.matchAll(/יום ([א-ש])׳ (\d{1,2})\.(\d{1,2})/g)];
    expect(pairs.length).toBeGreaterThan(2);
    for (const [, day, d, m] of pairs) {
      expect(days[new Date(2026, Number(m) - 1, Number(d)).getDay()], `${d}.${m}`).toBe(day);
    }
  });

  it("the day has four scenes in clock order, ending the next morning", () => {
    expect(SCENES.map((s) => s.time)).toEqual(["13:05", "18:20", "18:24", "07:30"]);
  });
});

describe("hero", () => {
  it("states the line, offers the signup and the sign-in, and plays the demo in a phone", async () => {
    render(<Hero />);
    await act(async () => {});
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(`מה שהבטחת לעשות.${BRAND.name} על זה.`);
    // one short line under the headline (Daniel, 28.10.2026), not a paragraph
    expect(screen.getByText("עוזרת אישית שמחוברת למייל, ליומן ולקבצים של העסק.")).toBeInTheDocument();
    expect(screen.queryByText(/כותבים לה או מקליטים/)).toBeNull();
    expect(screen.getByRole("link", { name: "בואו נתחיל - לוקח דקה" })).toHaveAttribute(
      "href",
      "/start",
    );
    expect(screen.getByRole("link", { name: "כניסה" })).toHaveAttribute("href", "/login");
    const phone = screen.getByRole("region", { name: `הדגמה: שיחה עם ${BRAND.name} בוואטסאפ` });
    // reduced motion: the whole conversation at once, ending with the approval buttons
    expect(within(phone).getByRole("group", { name: "אישור הטיוטה" })).toBeInTheDocument();
    expect(
      screen.getByText(`${TRIAL_MESSAGES} הודעות ראשונות בחינם, בלי כרטיס אשראי.`),
    ).toBeInTheDocument();
  });
});

describe("the systems she works with (lib/integrations/catalogue.ts)", () => {
  it("hero: no 'עובדת עם' strip any more - the systems are the connectors section's job", async () => {
    render(<Hero />);
    await act(async () => {});
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByText("עובדת עם")).toBeNull();
    expect(screen.queryByRole("link", { name: "כל החיבורים" })).toBeNull();
  });

  it("pricing: one compact row per plan - basic under 'חשבון אחד: Google או Microsoft', pro under its count - 8 paper tiles and '+K' that opens the full set ('בקרוב' on the business systems)", () => {
    render(<Pricing />);
    const label = { basic: "חשבון אחד: Google או Microsoft", pro: "כולל 16 חיבורים, ועוד 4 בקרוב" } as const;
    for (const plan of ["basic", "pro"] as const) {
      const card = screen.getByRole("article", { name: PLANS[plan].nameHe });
      expect(card).toHaveAttribute("data-tip-bounds");
      const row = within(card).getByRole("toolbar", { name: label[plan] });
      const names = integrationsForPlan(plan).flatMap((g) => g.items.map((i) => (i.status === "soon" ? `${i.name}, בקרוב` : i.name)));
      const shown = () => within(row).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
      expect(shown()).toEqual(names.slice(0, 8));
      // the official marks straight on the cream sheet: no picture tiles, no white chips
      expect(row.querySelector("img")).toBeNull();
      expect(row.querySelector(".bg-white")).toBeNull();
      expect(row.querySelectorAll("[data-mark='bare'] svg")).toHaveLength(8);
      fireEvent.click(within(card).getByRole("button", { name: `עוד ${names.length - 8} חיבורים` }));
      expect(shown()).toEqual(names);
    }
    const basicRow = within(screen.getByRole("article", { name: PLANS.basic.nameHe })).getByRole("toolbar");
    for (const name of ["Google Tasks", "Microsoft To Do", "SharePoint", "Google Slides", "monday.com, בקרוב"]) expect(within(basicRow).queryByRole("button", { name }), name).toBeNull();
    const proRow = within(screen.getByRole("article", { name: PLANS.pro.nameHe })).getByRole("toolbar");
    for (const name of ["Google Tasks", "Microsoft To Do", "SharePoint", "monday.com, בקרוב"]) expect(within(proRow).getByRole("button", { name }), name).toBeInTheDocument();
    // under the cards: one short line, the full comparison (opened on /pricing) and the call to action
    expect(screen.queryByText(/בבסיסי ובהודעות החינמיות מחברים חשבון אחד/)).toBeNull();
    expect(screen.queryByRole("link", { name: "לכל החיבורים" })).toBeNull();
    expect(screen.getByRole("link", { name: "להשוואה המלאה" })).toHaveAttribute("href", "/pricing#compare");
  });

  it("pricing: the real difference between the plans, from lib/billing/plans.ts (planFeatures)", () => {
    render(<Pricing />);
    const basic = screen.getByRole("article", { name: PLANS.basic.nameHe });
    const pro = screen.getByRole("article", { name: PLANS.pro.nameHe });
    // basic: its own lines; the account line stands over the icons instead of in the list
    const basicItems = within(basic).getAllByRole("listitem").filter((li) => !li.closest("[role=toolbar]"));
    expect(basicItems.map((li) => li.textContent)).toEqual(planFeatures("basic").lines.filter((l) => l.id !== "account").map((l) => l.text));
    expect(basic).not.toHaveTextContent("בקרוב");
    // pro: "כל מה שבבסיסי, ובנוסף:" and its lines, "בקרוב" on what is coming
    expect(within(pro).getByText("כל מה שבבסיסי, ובנוסף:")).toBeInTheDocument();
    for (const line of planFeatures("pro").lines) {
      const li = within(pro).getByText(line.text).closest("li")!;
      if (line.soon) expect(li, line.id).toHaveTextContent("בקרוב");
      else expect(li, line.id).not.toHaveTextContent("בקרוב");
    }
    for (const t of ["חיבור של Google ו-Microsoft יחד", "משימות ב-Google Tasks וב-Microsoft To Do", "סיכומי פגישות", "התראות יזומות ואזהרות פישינג"]) expect(pro).toHaveTextContent(t);
    expect(pro).toHaveTextContent(`שלושת הסוכנים המובנים, ועד ${PLANS.pro.customAgents} סוכנים משלך`);
    expect(basic).toHaveTextContent("סוכן אחד משלך");
  });

  it("the full list: three groups with their counts, a card per system with its mark and name only, 'בקרוב' where it is not connected yet", () => {
    render(<Connectors />);
    const section = screen.getByRole("region", { name: "מתחברת לכלים שכבר יש לכם." });
    expect(section).toHaveAttribute("id", "connectors");
    // the heading alone: no intro paragraph
    expect(section).not.toHaveTextContent("מתחברים פעם אחת");
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Google", "Microsoft 365", "מערכות העסק"]);
    // the count beside each heading
    expect(headings.map((h) => h.nextElementSibling?.textContent)).toEqual(["8 חיבורים", "8 חיבורים", "4 בקרוב"]);
    for (const i of INTEGRATIONS) {
      const item = screen.getByText(i.name).closest("li")!;
      // the mark and the name (and "בקרוב" on a card not connected yet) - no description line
      expect(item.querySelector(`[data-integration-tile='${i.id}'] svg`), i.id).not.toBeNull();
      expect(item, i.id).not.toHaveTextContent(i.benefit);
      expect(item.textContent, i.id).toBe(i.status === "soon" && i.vendor !== "business" ? `בקרוב${i.name}` : i.name);
    }
    expect(screen.queryByText("ועוד בהמשך")).toBeNull();
    expect(screen.getAllByRole("list").map((l) => l.getAttribute("aria-labelledby"))).toEqual([
      "connectors-google",
      "connectors-microsoft",
      "connectors-business",
    ]);
  });

  it("the header: three links - 'איך זה עובד', 'מחירים' (its own page) and 'כניסה'", () => {
    render(<LandingHeader />);
    const nav = screen.getByRole("navigation", { name: "ניווט באתר" });
    expect(within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["איך זה עובד", "#day"],
      ["מחירים", "/pricing"],
      ["כניסה", "/login"],
    ]);
  });

  it("on /pricing the header leads back to the landing's sections and marks 'מחירים' current", () => {
    render(<LandingHeader page="/pricing" />);
    expect(screen.getByRole("link", { name: "איך זה עובד" })).toHaveAttribute("href", "/#day");
    expect(screen.getByRole("link", { name: "מחירים" })).toHaveAttribute("aria-current", "page");
  });

  it("the full list: the official marks straight on the cards (no white chips, no picture tiles); the business systems are one compact row ending with 'בקשת מערכת'", async () => {
    const { container } = render(<Connectors />);
    expect(container.querySelector(".bg-white")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("[data-mark='bare']")).toHaveLength(INTEGRATIONS.length);
    const [google, microsoft, business] = screen.getAllByRole("list");
    // the accounts: a responsive grid, 3 columns on a phone, up to 8 (one row per account) on a desktop
    for (const list of [google!, microsoft!]) expect(list.className).toMatch(/grid-cols-3\b[\s\S]*xl:grid-cols-8/);
    // the systems on the way: one wrapping row of small pills
    expect(business!.className).toMatch(/\bflex\b[\s\S]*flex-wrap/);
    const ask = within(business!).getByRole("button", { name: "בקשת מערכת" });
    expect(ask.closest("li")!.textContent).toBe("בקשת מערכת");
    fireEvent.click(ask);
    expect(await screen.findByRole("dialog", { name: "בקשת מערכת" })).toBeInTheDocument();
  });
});

describe("signed-in awareness (Daniel, 22.10.2026)", () => {
  it("signed in: 'לאזור האישי' in the header as the hero's honey pill, at the inline end; the header and the hero drop 'כניסה'", async () => {
    render(
      <>
        {/* the session holes of app/page.tsx, signed in: the account pill, no "כניסה" */}
        <LandingHeader account={<AccountCta />} signIn={null} />
        <Hero signIn={null} />
      </>,
    );
    await act(async () => {});
    const account = screen.getByRole("link", { name: "לאזור האישי" });
    expect(account).toHaveAttribute("href", "/account");
    const start = screen.getByRole("link", { name: "בואו נתחיל - לוקח דקה" });
    expect(account.className).toBe(start.className.replace(/\s*max-sm:flex-1|\s*sm:min-w-64/g, ""));
    // the last thing in the header: inline end (left in RTL)
    const header = screen.getByRole("banner");
    expect(header.querySelectorAll("a")[header.querySelectorAll("a").length - 1]).toBe(account);
    expect(screen.queryByRole("link", { name: "כניסה" })).toBeNull();
  });

  it("signed out (the prerendered shell): no button in the header, 'כניסה' as its last link and beside the hero's call to action", () => {
    render(
      <>
        <LandingHeader />
        <Hero />
      </>,
    );
    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("link", { name: "לאזור האישי" })).toBeNull();
    expect(within(header).getByRole("link", { name: "כניסה" })).toHaveAttribute("href", "/login");
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(within(hero).getByRole("link", { name: "כניסה" })).toHaveAttribute("href", "/login");
  });
});

describe("the day scene", () => {
  it("under reduced motion is a static ordered list of four scenes, each with its phone", () => {
    render(<DaySection variant="scenes" />);
    const list = screen.getAllByRole("list")[0]!;
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    for (const s of SCENES)
      expect(screen.getByRole("heading", { level: 3, name: s.title })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: `מסך הנעילה ב-07:30: סיכום הבוקר מ${BRAND.name}` }),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-day-track]")).toBeNull();
  });

  it("keeps the server-rendered sequence on small screens even with motion allowed", () => {
    mockMatchMedia(() => false);
    render(
      <DaySwitch>
        <p>רצף</p>
      </DaySwitch>,
    );
    expect(screen.getByText("רצף")).toBeInTheDocument();
  });
});

describe("sections", () => {
  it("professions: four real questions, each under its profession, which links to the profession's page - no answers", () => {
    render(<Professions />);
    expect(screen.queryByText(/ארבע שאלות מהיום-יום/)).toBeNull();
    for (const p of PROFESSIONS) {
      const heading = screen.getByRole("heading", { level: 3, name: p.profession });
      expect(within(heading).getByRole("link", { name: p.profession }).getAttribute("href")).toMatch(/^\/for\/[a-z]+$/);
      expect(screen.getByText(`״${p.ask}״`)).toBeInTheDocument();
      expect(screen.queryByText(p.answer)).toBeNull();
    }
    expect(screen.queryByRole("link", { name: /^עוד על/ })).toBeNull();
    // every profession page is linked from here (the /for pages stay reachable)
    expect(new Set(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).size).toBe(PROFESSIONS.length);
  });

  it("trust: the headline, four facts as short headings (no descriptions) and the chat list described as one image", () => {
    render(<Trust />);
    const h2 = screen.getByRole("heading", { level: 2, name: "היא רואה רק מה ששולחים לה." });
    const facts = h2.nextElementSibling as HTMLElement;
    expect(within(facts).getAllByRole("listitem").map((t) => t.textContent)).toEqual([...TRUST]);
    const section = screen.getByRole("region", { name: "היא רואה רק מה ששולחים לה." });
    // the details are on /privacy; the servers are in the EU, never "in Israel"
    expect(section).not.toHaveTextContent(/פרנקפורט|איש קשר נפרד|בישראל/);
    expect(screen.getByRole("img", { name: /רק השיחה עם/ })).toBeInTheDocument();
  });

  it("pricing comes from lib/billing/plans.ts, with one line for VAT and cancelling, and the annual face's yearly charge 'בחיוב אחד'", () => {
    render(<Pricing />);
    const basic = screen.getByRole("article", { name: PLANS.basic.nameHe });
    const pro = screen.getByRole("article", { name: PLANS.pro.nameHe });
    expect(basic).toHaveTextContent(`${PLANS.basic.priceIls}₪לחודש`);
    expect(pro).toHaveTextContent(`${PLANS.pro.priceIls}₪לחודש`);
    expect(basic).toHaveTextContent("עד 750 הודעות בחודש");
    expect(pro).toHaveTextContent("עד 3,000 הודעות בחודש");
    expect(screen.getByText("המחירים כוללים מע״מ. ביטול בכל רגע.")).toBeInTheDocument();
    expect(screen.queryByText(/קבלה נשלחת אוטומטית/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /שנתי/ }));
    expect(basic).toHaveTextContent(`${PLANS.basic.annualPriceIls} ₪ לשנה, בחיוב אחד`);
    expect(pro).toHaveTextContent("₪ לשנה, בחיוב אחד");
  });

  it("FAQ uses native <details>, closed by default", () => {
    const { container } = render(<Faq />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(FAQ.length);
    details.forEach((d) => expect(d.open).toBe(false));
    expect(container.querySelectorAll("summary")[0]).toHaveTextContent(FAQ[0]!.q);
  });

  it("end card and footer: one call to action, the legal pages and sign-in", () => {
    render(
      <>
        <FinalCta />
        <LandingFooter />
      </>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: `${BRAND.name} על זה.` }),
    ).toBeInTheDocument();
    // the heading, the hoopoe and the button - no subtitle
    expect(screen.queryByText(/דקה להרשמה/)).toBeNull();
    expect(screen.getByRole("link", { name: "בואו נתחיל - לוקח דקה" })).toHaveAttribute(
      "href",
      "/start",
    );
    const nav = screen.getByRole("navigation", { name: "קישורים" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/login", "/terms", "/privacy", "/accessibility"]);
  });
});

describe("the hoopoe (public/brand/mascot/)", () => {
  const mascotDir = join(here, "..", "..", "..", "public", "brand", "mascot");
  const srcOf = (img: Element) => decodeURIComponent(img.getAttribute("src") ?? "");

  it("every pose the page uses exists, and nothing still draws the old placeholder", () => {
    const files = readdirSync(mascotDir);
    for (const s of SCENES) expect(files).toContain(`${s.pose}.webp`);
    for (const pose of ["waving", "thinking", "celebrating"])
      expect(files).toContain(`${pose}.webp`);
    expect(files).toContain("whatsapp-profile.png");
    for (const f of sources) expect(readFileSync(f, "utf8")).not.toContain("mascot-placeholder");
  });

  it("the hero's hoopoe waves with a Hebrew description; the scenes' are decorative and match the hour", () => {
    render(
      <>
        <Hero />
        <DaySection variant="scenes" />
      </>,
    );
    expect(
      screen.getByRole("img", { name: `הדוכיפת של ${BRAND.name} מנופפת לשלום` }),
    ).toBeInTheDocument();
    const decorative = [...document.querySelectorAll("img[alt='']")].map(srcOf);
    for (const s of SCENES) {
      expect(decorative.some((src) => src.includes(`/brand/mascot/${s.pose}.webp`))).toBe(true);
    }
    // her WhatsApp profile picture in the chat headers
    expect(decorative.some((src) => src.includes("/brand/mascot/whatsapp-profile.png"))).toBe(true);
  });
});
