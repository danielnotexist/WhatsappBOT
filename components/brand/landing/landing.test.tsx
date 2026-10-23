// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES, VAT_RATE, planFeatures } from "@/lib/billing/plans";
import { INTEGRATIONS, featuredGroups, integrationsForPlan } from "@/lib/integrations/catalogue";
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
  it("hero: a quiet 'עובדת עם' strip under the call to action - featured tiles as one toolbar, and a link to the list", async () => {
    render(<Hero />);
    await act(async () => {});
    const strip = screen.getByRole("toolbar", { name: "עובדת עם" });
    const featured = featuredGroups().flatMap((g) => g.items.map((i) => i.name));
    expect(within(strip).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(featured);
    expect(within(strip).getAllByRole("button").filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "כל החיבורים" })).toHaveAttribute("href", "#connectors");
    // it follows the call to action and the trial line, never the headline
    const h1 = screen.getByRole("heading", { level: 1 });
    const cta = screen.getByRole("link", { name: "בואו נתחיל - לוקח דקה" });
    expect(h1.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cta.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      // the paper set on the cream sheet
      expect(row.querySelector("img")?.getAttribute("src")).toMatch(/brand%2Fintegrations%2Fpaper%2F|brand\/integrations\/paper\//);
      fireEvent.click(within(card).getByRole("button", { name: `עוד ${names.length - 8} חיבורים` }));
      expect(shown()).toEqual(names);
    }
    const basicRow = within(screen.getByRole("article", { name: PLANS.basic.nameHe })).getByRole("toolbar");
    for (const name of ["Google Tasks", "Microsoft To Do", "SharePoint", "Google Slides", "monday.com, בקרוב"]) expect(within(basicRow).queryByRole("button", { name }), name).toBeNull();
    const proRow = within(screen.getByRole("article", { name: PLANS.pro.nameHe })).getByRole("toolbar");
    for (const name of ["Google Tasks", "Microsoft To Do", "SharePoint", "monday.com, בקרוב"]) expect(within(proRow).getByRole("button", { name }), name).toBeInTheDocument();
    expect(screen.getByText(/בבסיסי ובהודעות החינמיות מחברים חשבון אחד, Google או Microsoft\. בפרו שניהם עובדים יחד/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "לכל החיבורים" })).toHaveAttribute("href", "#connectors");
    expect(screen.getByRole("link", { name: "להשוואה המלאה" })).toHaveAttribute("href", "/pricing");
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

  it("the full list: three groups, every system with its benefit, 'בקרוב' where it is not connected yet, and more to come", () => {
    render(<Connectors />);
    const section = screen.getByRole("region", { name: "מתחברת לכלים שכבר יש לכם." });
    expect(section).toHaveAttribute("id", "connectors");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Google", "Microsoft 365", "מערכות העסקבקרוב"]);
    for (const i of INTEGRATIONS) {
      const item = screen.getByText(i.name).closest("li")!;
      expect(item, i.id).toHaveTextContent(i.benefit);
      if (i.status === "soon") expect(item, i.id).toHaveTextContent("בקרוב");
      else expect(item, i.id).not.toHaveTextContent("בקרוב");
    }
    expect(screen.getByText("ועוד בהמשך")).toBeInTheDocument();
    expect(screen.getAllByRole("list").map((l) => l.getAttribute("aria-labelledby"))).toEqual([
      "connectors-google",
      "connectors-microsoft",
      "connectors-business",
    ]);
  });

  it("the header links to the list, and 'מחירים' to its own page", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "חיבורים" })).toHaveAttribute("href", "#connectors");
    expect(screen.getByRole("link", { name: "מחירים" })).toHaveAttribute("href", "/pricing");
  });

  it("on /pricing the header leads back to the landing's sections and marks 'מחירים' current", () => {
    render(<LandingHeader page="/pricing" />);
    expect(screen.getByRole("link", { name: "חיבורים" })).toHaveAttribute("href", "/#connectors");
    expect(screen.getByRole("link", { name: "מחירים" })).toHaveAttribute("aria-current", "page");
  });

  it("the full list: our night tiles (no white chips), and 'ועוד בהמשך' is a button that opens 'בקשת מערכת'", async () => {
    const { container } = render(<Connectors />);
    expect(container.querySelector(".bg-white")).toBeNull();
    const srcs = [...container.querySelectorAll("img")].map((i) => decodeURIComponent(i.getAttribute("src") ?? ""));
    expect(srcs.length).toBe(INTEGRATIONS.length + 1);
    for (const s of srcs) expect(s).toContain("/brand/integrations/night/");
    const ask = screen.getByRole("button", { name: "בקשת מערכת" });
    expect(ask).toHaveAccessibleDescription("חסרה מערכת שהעסק עובד איתה? אפשר לבקש אותה כאן.");
    expect(ask.closest("li")).toHaveTextContent("ועוד בהמשך");
    fireEvent.click(ask);
    expect(await screen.findByRole("dialog", { name: "בקשת מערכת" })).toBeInTheDocument();
  });
});

describe("signed-in awareness (Daniel, 22.10.2026)", () => {
  it("signed in: 'לאזור האישי' in the header as the hero's honey pill, at the inline end; the hero drops 'כניסה'", async () => {
    render(
      <>
        <LandingHeader account={<AccountCta />} />
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

  it("signed out (the prerendered shell): no button in the header, 'כניסה' beside the hero's call to action", () => {
    render(
      <>
        <LandingHeader />
        <Hero />
      </>,
    );
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "לאזור האישי" })).toBeNull();
    expect(screen.getByRole("link", { name: "כניסה" })).toHaveAttribute("href", "/login");
  });
});

describe("the day scene", () => {
  it("under reduced motion is a static ordered list of four scenes, each with its phone", () => {
    render(<DaySection />);
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
  it("professions: four real exchanges, each a question and her answer", () => {
    render(<Professions />);
    for (const p of PROFESSIONS) {
      expect(screen.getByRole("heading", { level: 3, name: p.profession })).toBeInTheDocument();
      expect(screen.getByText(`״${p.ask}״`)).toBeInTheDocument();
    }
  });

  it("trust: the headline, four facts and the chat list described as one image", () => {
    render(<Trust />);
    expect(
      screen.getByRole("heading", { level: 2, name: "היא רואה רק מה ששולחים לה." }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual(TRUST.map((t) => t.term));
    expect(screen.getByRole("img", { name: /רק השיחה עם/ })).toBeInTheDocument();
  });

  it("pricing comes from lib/billing/plans.ts, with the VAT note and the trial", () => {
    render(<Pricing />);
    const basic = screen.getByRole("article", { name: PLANS.basic.nameHe });
    const pro = screen.getByRole("article", { name: PLANS.pro.nameHe });
    expect(basic).toHaveTextContent(`${PLANS.basic.priceIls}₪לחודש`);
    expect(pro).toHaveTextContent(`${PLANS.pro.priceIls}₪לחודש`);
    expect(basic).toHaveTextContent("עד 750 הודעות בחודש");
    expect(pro).toHaveTextContent("עד 3,000 הודעות בחודש");
    expect(
      screen.getByText(new RegExp(`כוללים מע״מ \\(${Math.round(VAT_RATE * 100)}%\\)`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`^${TRIAL_MESSAGES} ההודעות הראשונות בחינם`)),
    ).toBeInTheDocument();
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
        <DaySection />
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
