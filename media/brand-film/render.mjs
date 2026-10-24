// Renders index.html frame by frame with Playwright (seek(t) per frame), then encodes with ffmpeg.
//
//   node render.mjs --events                       # dump the sound events to build/events.json
//   node render.mjs --beats [--format wide]        # one PNG per beat -> build/beats-<format>/ (--offset 0.25 beats)
//   node render.mjs --at 3.2,8.25 [--format wide]  # specific times -> build/at-<format>/
//   node render.mjs --full [--format wide]         # 480 fps sub-frames -> tmix (8) -> 60 fps mp4 with audio
//   node render.mjs --loopcheck [--format wide]    # pixel compare of seek(0) and seek(T)
//   node render.mjs --full --encode-only           # re-encode existing sub-frames (build/frames-<format>/)
//
// The page is served from the repository root, limited to this folder; assets/mascot is a link to the site's
// public/brand/mascot (the hoopoe poses and her profile picture), so the film uses the same files as the site.
// Playwright comes from /opt/node-tools (browsers in /opt/pw-browsers); nothing is installed.

import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const SERVED = [HERE];
process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/opt/pw-browsers";
const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM || "/opt/node-tools/package.json");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const FORMAT = opt("format", "square");
const WIDE = FORMAT === "wide";
const W = WIDE ? 1920 : 1440;
const H = WIDE ? 1080 : 1440;
const FPS = 60;
const SUB = Number(opt("sub", "8")); // sub-frames per frame, blended with tmix for motion blur
const WORKERS = Number(opt("workers", "4"));
const BUILD = join(HERE, "build");
const OUT = join(HERE, "out");
const PAGE = "/" + join("media/brand-film", "index.html").replace(/\\/g, "/");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
};

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(REPO, path);
    if (!SERVED.some((d) => file.startsWith(d + "/")) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  // a missing font, image or script is fatal; the audio element (assets/audio/mix.wav) is only for HyperFrames
  page.on("response", (r) => r.status() >= 400 && !/mix\.wav|favicon/.test(r.url()) && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${port}${PAGE}${WIDE ? "?format=wide" : ""}`);
  await page.evaluate(() => window.FILM.ready);
  if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
  const root = await page.$("#root");
  const T = await page.evaluate(() => window.FILM.T);
  return { page, root, T };
}

async function shot({ page, root }, t, path) {
  await page.evaluate((tt) => window.FILM.seek(tt), t);
  await root.screenshot({ path, type: "png", animations: "disabled", caret: "initial" });
}

function run(cmd, a) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, a, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}`))));
  });
}

async function main() {
  mkdirSync(BUILD, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text"] });
  try {
    if (flag("events")) {
      const { page } = await openPage(browser, port);
      const ev = await page.evaluate(() => ({ T: window.FILM.T, beat: window.FILM.BEAT, sounds: window.FILM.sounds }));
      writeFileSync(join(BUILD, "events.json"), JSON.stringify(ev, null, 2));
      console.log(`events: ${ev.sounds.length} -> build/events.json`);
    }

    if (flag("beats") || opt("at")) {
      const dir = join(BUILD, flag("beats") ? `beats-${FORMAT}` : `at-${FORMAT}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const p = await openPage(browser, port);
      const off = Number(opt("offset", "0")) * 0.5;
      const times = flag("beats")
        ? Array.from({ length: Math.round(p.T / 0.5) }, (_, i) => [`beat-${String(i + 1).padStart(2, "0")}`, i * 0.5 + off])
        : opt("at")
            .split(",")
            .map((s) => [`t-${Number(s).toFixed(3)}`, Number(s)]);
      for (const [name, t] of times) await shot(p, t, join(dir, `${name}.png`));
      console.log(`${times.length} frames -> ${dir}`);
    }

    if (flag("loopcheck")) {
      const p = await openPage(browser, port);
      await p.page.evaluate(() => window.FILM.seek(0));
      const a = await p.root.screenshot();
      await p.page.evaluate(() => window.FILM.seek(window.FILM.T));
      const b = await p.root.screenshot();
      console.log(`seek(0) vs seek(${p.T}): ${Buffer.compare(a, b) === 0 ? "identical PNG bytes" : "DIFFERENT"}`);
    }

    if (flag("full")) {
      const probe = await openPage(browser, port);
      const T = probe.T;
      await probe.page.close();
      // frames 0..T*FPS inclusive: the last frame is the first frame (seek(T) === seek(0))
      const frames = T * FPS + 1;
      const lead = SUB - 1; // sub-frames before t=0 (wrapped), so frame 0 also gets its full shutter
      const total = frames * SUB;
      const dir = join(BUILD, `frames-${FORMAT}`);
      const encodeOnly = flag("encode-only");
      if (!encodeOnly) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      }
      const per = Math.ceil(total / WORKERS);
      const t0 = Date.now();
      let done = 0;
      if (!encodeOnly) await Promise.all(
        Array.from({ length: WORKERS }, async (_, w) => {
          const p = await openPage(browser, port);
          for (let k = w * per; k < Math.min(total, (w + 1) * per); k++) {
            const t = (k - lead) / (FPS * SUB);
            await shot(p, t, join(dir, `f${String(k).padStart(5, "0")}.png`));
            if (++done % 800 === 0) console.log(`${done}/${total} sub-frames, ${(done / ((Date.now() - t0) / 1000)).toFixed(1)}/s`);
          }
          await p.page.close();
        }),
      );
      if (readdirSync(dir).length !== total) throw new Error("missing sub-frames");

      const audio = join(HERE, "assets/audio/mix.wav");
      if (!existsSync(audio)) throw new Error("assets/audio/mix.wav missing - run: .venv/bin/python -I tools/mix_audio.py");
      mkdirSync(OUT, { recursive: true });
      const out = join(OUT, WIDE ? "alze-film-1920x1080.mp4" : "alze-film-1440.mp4");
      // sub-frame k shows t = (k - lead) / (FPS*SUB); tmix averages the SUB sub-frames up to k and select keeps
      // k = SUB*m + lead -> frame m at t = m/FPS, exposed over [t - lead/(FPS*SUB), t] (a trailing shutter).
      await run("ffmpeg", [
        "-v", "error", "-y",
        "-framerate", String(FPS * SUB),
        "-i", join(dir, "f%05d.png"),
        "-i", audio,
        "-filter_complex",
        `[0:v]tmix=frames=${SUB}:weights='${Array(SUB).fill(1).join(" ")}',select='eq(mod(n\\,${SUB})\\,${lead})',setpts=N/${FPS}/TB,format=yuv420p[v]`,
        "-map", "[v]", "-map", "1:a",
        "-r", String(FPS),
        "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-pix_fmt", "yuv420p",
        // the first and the closing frame are the same picture: both intra-coded, so they decode alike
        "-force_key_frames", `expr:eq(n,0)+eq(n,${frames - 1})`,
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-frames:v", String(frames),
        out,
      ]);
      console.log(`-> ${out}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
