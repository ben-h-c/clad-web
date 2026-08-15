/**
 * Smoke the notable-person extractor against fixtures + last-week posts.
 * Run: node --experimental-strip-types scripts/checkNotablePeople.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { extractNotablePeopleFromText, mergePersonTags } from "../src/lib/notablePeople.ts";
import {
  buildPoliticianSpotlightItems,
  lightPoliticianAggsFromPosts,
} from "../src/lib/homePoliticians.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "src/content/posts");

const fixtures = [
  {
    name: "banderas prose",
    parts: {
      headline: "Antonio Banderas draws Oscar buzz for chef role in 'Tony' biopic",
      summary:
        "CBC News clip covers online Oscar buzz for Antonio Banderas in the 2026 film 'Tony.'",
      topics: ["Antonio Banderas", "Tony film", "Oscar predictions"],
    },
    want: ["antonio-banderas"],
    reject: ["oscar-buzz", "tony-film", "oscar-predictions"],
  },
  {
    name: "junk honorifics and orgs",
    parts: {
      headline: "Defense Secretary Announces Operation Epic After Al Jazeera Report",
      summary: "President Trump posted on Truth Social after the Daily Wire segment.",
    },
    want: [],
    reject: [
      "defense-secretary",
      "operation-epic",
      "al-jazeera",
      "president-trump",
      "truth-social",
      "daily-wire",
    ],
  },
  {
    name: "president full name",
    parts: {
      headline: "President Donald Trump vows to declare the Strait of Hormuz US territory",
      summary: "Donald Trump said the strait would be treated as US territory.",
    },
    want: ["donald-trump"],
    reject: ["president-trump"],
  },
  {
    name: "markle + stewart",
    parts: {
      headline: "Meghan Markle disputes Martha Stewart dinner account after July UK family meeting",
      summary:
        "The NewsNation segment discusses Martha Stewart's People magazine comment about Meghan Markle.",
      topics: ["Meghan Markle", "Royal Family", "Harry and Meghan"],
    },
    want: ["meghan-markle", "martha-stewart"],
    reject: ["royal-family", "harry-and", "people-magazine"],
  },
  {
    name: "founders are not current news",
    parts: {
      headline: "Ben Shapiro addresses YAF Freedom at 250 rally at Mount Vernon",
      summary: "Shapiro outlined three foundations from George Washington and James Madison.",
    },
    want: ["ben-shapiro"],
    reject: ["george-washington", "james-madison", "mount-vernon"],
  },
];

let failed = 0;
for (const fx of fixtures) {
  const got = extractNotablePeopleFromText(fx.parts);
  const slugs = got.map((g) => g.slug);
  for (const w of fx.want) {
    if (!slugs.includes(w)) {
      console.error(`FAIL ${fx.name}: missing ${w} (got ${slugs.join(", ") || "∅"})`);
      failed++;
    }
  }
  for (const r of fx.reject) {
    if (slugs.includes(r)) {
      console.error(`FAIL ${fx.name}: should reject ${r}`);
      failed++;
    }
  }
}

const files = (await readdir(postsDir)).filter((f) => f.endsWith(".md")).sort();
const cutoff = Date.now() - 30 * 86_400_000;
const weekCutoff = Date.now() - 7 * 86_400_000;
const names = new Map();
const fakePosts = [];
for (const file of files) {
  const raw = await readFile(path.join(postsDir, file), "utf8");
  const { data } = matter(raw);
  const published = data.publishedAt ? Date.parse(String(data.publishedAt)) : 0;
  if (!published || published < cutoff) continue;
  const publishedAt = new Date(published);
  const people = mergePersonTags(
    data.politicians,
    extractNotablePeopleFromText({
      headline: data.headline,
      summary: data.summary,
      topics: data.topics,
    })
  );
  fakePosts.push({
    id: file.replace(/\.md$/, ""),
    data: {
      draft: false,
      headline: data.headline,
      summary: data.summary,
      topics: data.topics || [],
      politicians: data.politicians || [],
      publishedAt,
      sourceTitle: data.sourceTitle ?? null,
      letterGrade: data.letterGrade ?? null,
      factualityScore: data.factualityScore ?? null,
      leanScore: data.leanScore ?? null,
    },
  });
  if (published < weekCutoff) continue;
  for (const p of people) {
    const row = names.get(p.slug) || { name: p.name, slug: p.slug, n: 0, latest: 0 };
    row.n += 1;
    row.latest = Math.max(row.latest, published);
    names.set(p.slug, row);
  }
}

const ranked = [...names.values()].sort((a, b) => b.latest - a.latest || b.n - a.n);
console.log("\nLast 7 days extracted (newest first, 25):");
for (const row of ranked.slice(0, 25)) {
  const age = ((Date.now() - row.latest) / 86_400_000).toFixed(1);
  console.log(`  ${row.name}  ×${row.n}  ${age}d`);
}

const expectLive = [
  "antonio-banderas",
  "ben-shapiro",
  "tiffany-haddish",
  "whitney-houston",
  "meghan-markle",
  "bob-iger",
  "josh-kushner",
  "jeff-bezos",
  "luigi-mangione",
];
console.log("\nExpected notables:");
for (const slug of expectLive) {
  const hit = names.get(slug);
  console.log(`  ${hit ? "ok" : "MISSING"}  ${slug}${hit ? ` ×${hit.n}` : ""}`);
  if (!hit) failed++;
}

const aggs = lightPoliticianAggsFromPosts(fakePosts);
const strip = buildPoliticianSpotlightItems({
  politicians: aggs,
  now: new Date(),
  max: 10,
  locked: false,
});
console.log("\nHome strip preview:");
for (const item of strip) {
  console.log(`  ${item.title}  —  ${item.kicker}  →  ${item.href}  (${item.cta})`);
}

const luigi = strip.find((i) => /luigi|mangione/i.test(i.title) || /luigi-mangione/.test(i.href));
if (luigi && luigi.href.includes("/politicians/")) {
  console.error("FAIL Luigi must not have a politician report card");
  failed++;
}
const banderas = strip.find((i) => /banderas/i.test(i.title));
if (banderas && banderas.href.includes("/politicians/")) {
  console.error("FAIL Banderas must not have a politician report card");
  failed++;
}

if (failed) {
  console.error(`\n${failed} fixture failure(s)`);
  process.exit(1);
}
console.log(`\nFixtures ok. ${ranked.length} distinct people in last 7 days.`);
