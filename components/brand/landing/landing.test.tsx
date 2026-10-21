// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES, VAT_RATE } from "@/lib/billing/plans";
import { FAQ, HERO_SCRIPT, PRICING, PROFESSIONS, SCENES, TRUST } from "./content";
import { DaySection } from "./day-scenes";
import { DaySwitch } from "./day-switch";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { LandingFooter } from "./footer";
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
    expect(h1).toHaveTextContent(`הדברים שאמרת שתעשה.${BRAND.name} על זה.`);
    expect(screen.getByRole("link", { name: "בואו נתחיל — לוקח דקה" })).toHaveAttribute(
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
    expect(screen.getByRole("link", { name: "בואו נתחיל — לוקח דקה" })).toHaveAttribute(
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
