/**
 * Capture the onboarding-tour screenshots used by src/components/OnboardingTour.astro.
 *
 * Writes retina PNGs to public/onboarding/. Run after notable UI changes so the
 * intro never goes stale:
 *
 *   npm install                       # installs playwright (devDependency)
 *   npx playwright install chromium   # one-time browser download
 *   npm run shots                     # captures against the live site
 *
 * Options (env):
 *   SHOT_BASE_URL  site to capture        (default https://cladfacts.com)
 *   SHOT_COOKIE    raw Cookie header to send — use a logged-in premium session
 *                  so grades and charts aren't paywalled out of the shots
 *   REPORT_SLUG    pin the report screenshot to a specific post slug
 *
 * Each shot tries a specific element first and falls back to the viewport, so a
 * renamed selector degrades to a still-useful capture instead of failing.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = (process.env.SHOT_BASE_URL || "https://cladfacts.com").replace(/\/$/, "");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "onboarding");
const VIEWPORT = { width: 1280, height: 900 };

async function resolveReportSlug() {
  if (process.env.REPORT_SLUG) return process.env.REPORT_SLUG;
  try {
    const res = await fetch(`${BASE}/api/posts.json?limit=25`, {
      headers: process.env.SHOT_COOKIE ? { Cookie: process.env.SHOT_COOKIE } : {},
    });
    const data = await res.json();
    const posts = data?.posts || [];
    const broadcast = posts.find((p) => p.isBroadcast) || posts[0];
    return broadcast?.slug || null;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const slug = await resolveReportSlug();

  const shots = [
    { name: "home", path: "/", selector: null },                       // full front page (top)
    { name: "breaking", path: "/", selector: ".hero--breaking" },      // Breaking News strip
    { name: "frontpage", path: "/", selector: 'section.hero:has(h2:has-text("Front Page"))' },
    { name: "report", path: slug ? `/posts/${slug}/` : null, selector: ".gradeboard" },
    { name: "trends", path: "/trends/", selector: ".charts" },
  ];

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  // Don't let the tour open over the very screenshots we're capturing.
  await context.addInitScript(() => {
    try { localStorage.setItem("clad_tour_v1", "1"); } catch {}
  });
  if (process.env.SHOT_COOKIE) {
    await context.setExtraHTTPHeaders({ Cookie: process.env.SHOT_COOKIE });
  }
  const page = await context.newPage();

  for (const shot of shots) {
    if (!shot.path) {
      console.warn(`! skip ${shot.name}: no path (no report slug resolved?)`);
      continue;
    }
    const url = BASE + shot.path;
    const file = join(OUT, `${shot.name}.png`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      let captured = false;
      if (shot.selector) {
        const el = page.locator(shot.selector).first();
        if (await el.count().catch(() => 0)) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(400); // let lazy images / charts settle
          await el.screenshot({ path: file }).catch(() => {});
          captured = true;
        }
      }
      if (!captured) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: file }); // viewport fallback
      }
      console.log(`✓ ${shot.name}  ←  ${url}`);
    } catch (err) {
      console.error(`✗ ${shot.name}: ${String(err?.message || err).slice(0, 140)}`);
    }
  }

  await browser.close();
  console.log(`\nDone → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
