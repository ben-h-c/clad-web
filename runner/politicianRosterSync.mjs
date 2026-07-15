/**
 * Politician Roster Sync — daily rebuild of who currently holds office.
 *
 * Sources (no Grok guesswork for membership):
 *  - unitedstates/congress-legislators (current senators + house)
 *  - Wikipedia “List of current United States governors”
 *  - Curated SCOTUS (stable nine)
 *  - Curated cabinet / executive from public lists (updated when known)
 *
 * Posts the full seed list to POST /api/agent/politicians-roster (KV).
 * The /politicians/ directory reads live KV first, then static fallback.
 */
import { putPoliticianRoster } from "./api.mjs";
import yaml from "js-yaml";

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "CladFactsRosterSync/1.0 (+https://cladfacts.com)" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/** Sitting cabinet / cabinet-rank as of mid-2026. Agent rewrites this list via
 *  code deploy when the White House reshuffles; daily sync always re-applies it. */
const EXECUTIVE = [
  { name: "Donald Trump", slug: "donald-trump", race: "President of the United States", aliases: ["Donald Trump", "President Trump"] },
  { name: "JD Vance", slug: "jd-vance", race: "Vice President of the United States", aliases: ["JD Vance", "J.D. Vance", "Vice President Vance"] },
  { name: "Marco Rubio", slug: "marco-rubio", race: "Secretary of State", aliases: ["Marco Rubio", "Secretary Rubio"] },
  { name: "Scott Bessent", slug: "scott-bessent", race: "Secretary of the Treasury", aliases: ["Scott Bessent", "Secretary Bessent"] },
  { name: "Pete Hegseth", slug: "pete-hegseth", race: "Secretary of Defense", aliases: ["Pete Hegseth", "Secretary Hegseth"] },
  { name: "Pam Bondi", slug: "pam-bondi", race: "Attorney General", aliases: ["Pam Bondi", "Attorney General Bondi"] },
  { name: "Doug Burgum", slug: "doug-burgum", race: "Secretary of the Interior", aliases: ["Doug Burgum"] },
  { name: "Brooke Rollins", slug: "brooke-rollins", race: "Secretary of Agriculture", aliases: ["Brooke Rollins"] },
  { name: "Howard Lutnick", slug: "howard-lutnick", race: "Secretary of Commerce", aliases: ["Howard Lutnick"] },
  { name: "Lori Chavez-DeRemer", slug: "lori-chavez-deremer", race: "Secretary of Labor", aliases: ["Lori Chavez-DeRemer"] },
  { name: "Robert F. Kennedy Jr.", slug: "rfk-jr", race: "Secretary of Health and Human Services", aliases: ["Robert F. Kennedy Jr.", "RFK Jr", "RFK Junior"] },
  { name: "Scott Turner", slug: "scott-turner", race: "Secretary of Housing and Urban Development", aliases: ["Scott Turner"] },
  { name: "Sean Duffy", slug: "sean-duffy", race: "Secretary of Transportation", aliases: ["Sean Duffy"] },
  { name: "Chris Wright", slug: "chris-wright", race: "Secretary of Energy", aliases: ["Chris Wright"] },
  { name: "Linda McMahon", slug: "linda-mcmahon", race: "Secretary of Education", aliases: ["Linda McMahon"] },
  { name: "Doug Collins", slug: "doug-collins", race: "Secretary of Veterans Affairs", aliases: ["Doug Collins"] },
  { name: "Kristi Noem", slug: "kristi-noem", race: "Secretary of Homeland Security", aliases: ["Kristi Noem"] },
  { name: "Tulsi Gabbard", slug: "tulsi-gabbard", race: "Director of National Intelligence", aliases: ["Tulsi Gabbard"] },
  { name: "John Ratcliffe", slug: "john-ratcliffe", race: "Director of the CIA", aliases: ["John Ratcliffe"] },
  { name: "Kash Patel", slug: "kash-patel", race: "Director of the FBI", aliases: ["Kash Patel"] },
  { name: "Lee Zeldin", slug: "lee-zeldin", race: "EPA Administrator", aliases: ["Lee Zeldin"] },
  { name: "Kelly Loeffler", slug: "kelly-loeffler", race: "SBA Administrator", aliases: ["Kelly Loeffler"] },
  { name: "Russell Vought", slug: "russell-vought", race: "OMB Director", aliases: ["Russell Vought", "Russ Vought"] },
  { name: "Susie Wiles", slug: "susie-wiles", race: "White House Chief of Staff", aliases: ["Susie Wiles"] },
];

const SCOTUS = [
  { name: "John Roberts", title: "Chief Justice", aliases: ["John Roberts", "Chief Justice Roberts"] },
  { name: "Clarence Thomas", title: "Associate Justice", aliases: ["Clarence Thomas", "Justice Clarence Thomas"] },
  { name: "Samuel Alito", title: "Associate Justice", aliases: ["Samuel Alito", "Samuel A. Alito", "Justice Alito"] },
  { name: "Sonia Sotomayor", title: "Associate Justice", aliases: ["Sonia Sotomayor", "Justice Sotomayor"] },
  { name: "Elena Kagan", title: "Associate Justice", aliases: ["Elena Kagan", "Justice Kagan"] },
  { name: "Neil Gorsuch", title: "Associate Justice", aliases: ["Neil Gorsuch", "Justice Gorsuch"] },
  { name: "Brett Kavanaugh", title: "Associate Justice", aliases: ["Brett Kavanaugh", "Justice Kavanaugh"] },
  { name: "Amy Coney Barrett", title: "Associate Justice", aliases: ["Amy Coney Barrett", "Justice Barrett"] },
  { name: "Ketanji Brown Jackson", title: "Associate Justice", aliases: ["Ketanji Brown Jackson", "Justice Ketanji Brown Jackson"] },
];

const TERRITORIES = new Set(["PR", "VI", "GU", "AS", "MP", "DC"]);

function buildFromCongress(legs) {
  const bySlug = new Map();
  const add = (seed) => {
    const ex = bySlug.get(seed.slug);
    if (!ex) {
      bySlug.set(seed.slug, seed);
      return;
    }
    bySlug.set(seed.slug, {
      ...ex,
      ...seed,
      aliases: [...new Set([...(ex.aliases || []), ...(seed.aliases || [])])],
    });
  };

  let sen = 0;
  let house = 0;
  for (const p of legs) {
    const term = p.terms[p.terms.length - 1];
    if (term.type === "rep" && TERRITORIES.has(term.state)) continue;

    const name = p.name.official_full || `${p.name.first} ${p.name.last}`;
    let slug = slugify(name);
    const base = slug;
    let n = 2;
    while (bySlug.has(slug) && bySlug.get(slug).name !== name) {
      const st = (term.state || "").toLowerCase();
      if (term.type === "rep" && term.district != null) slug = `${base}-${st}-${term.district}`;
      else {
        slug = `${base}-${st}-${n}`;
        n++;
      }
    }
    const aliases = [name];
    const fl = `${p.name.first} ${p.name.last}`;
    if (fl !== name) aliases.push(fl);
    if (p.name.nickname) aliases.push(`${p.name.nickname} ${p.name.last}`);
    if (p.name.last && String(p.name.last).includes("-")) aliases.push(p.name.last);

    const st = term.state || "";
    const pl = term.party ? term.party[0] : "";
    let race;
    let bucket;
    if (term.type === "sen") {
      sen++;
      bucket = "Senate";
      const klass = term.class;
      race =
        klass === 2
          ? `${st} Senate · Class II (2026)`
          : `${st} Senate` + (klass ? ` · Class ${klass}` : "");
      if (pl) race += ` · ${pl}`;
    } else {
      house++;
      bucket = "House";
      const dist = term.district;
      race = dist == null || dist === 0 ? `${st}-AL House` : `${st}-${dist} House`;
      if (pl) race += ` · ${pl}`;
    }
    add({ name, slug, race, bucket, aliases });
  }
  return { bySlug, sen, house };
}

function addGovernors(bySlug, html) {
  const table = html.match(/<table class="wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("governors table not found");
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)];
  let gov = 0;
  for (const r of rows) {
    const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      c[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&#91;.*?&#93;/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (cells.length < 3 || /^State$/i.test(cells[0])) continue;
    const state = cells[0].replace(/\(.*?\)/g, "").trim();
    let name = cells[2];
    if (!name || /republican|democratic|independent/i.test(name)) {
      name = cells.find(
        (c, i) =>
          i > 0 &&
          c &&
          !/republican|democratic|independent|^\d/.test(c) &&
          c.length > 3 &&
          c.length < 60
      );
    }
    if (!name || name.length < 4) continue;
    const partyCell = cells.find((c) => /Republican|Democratic|Independent/.test(c)) || "";
    const pl = partyCell.startsWith("R") ? "R" : partyCell.startsWith("D") ? "D" : "";
    const slug = slugify(name);
    const aliases =
      name.includes("Pritzker") ? [name, "J.B. Pritzker", "JB Pritzker"] : [name];
    const seed = {
      name,
      slug,
      race: `${state} Governor` + (pl ? ` · ${pl}` : ""),
      bucket: "Governor",
      aliases,
    };
    const ex = bySlug.get(slug);
    if (ex) {
      bySlug.set(slug, {
        ...ex,
        ...seed,
        aliases: [...new Set([...(ex.aliases || []), ...aliases])],
      });
    } else bySlug.set(slug, seed);
    gov++;
  }
  return gov;
}

export async function runPoliticianRosterSync(agent) {
  void agent;
  const legsRaw = await fetchText(
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
  );
  const legs = yaml.load(legsRaw);
  if (!Array.isArray(legs) || legs.length < 400) {
    return { ok: false, message: `congress data unexpected (${legs?.length ?? 0})` };
  }

  const { bySlug, sen, house } = buildFromCongress(legs);

  const wiki = JSON.parse(
    await fetchText(
      "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_current_United_States_governors&prop=text&format=json"
    )
  );
  const gov = addGovernors(bySlug, wiki.parse.text["*"]);

  for (const j of SCOTUS) {
    bySlug.set(slugify(j.name), {
      name: j.name,
      slug: slugify(j.name),
      race: `U.S. Supreme Court · ${j.title}`,
      bucket: "Supreme Court",
      aliases: j.aliases,
    });
  }
  for (const c of EXECUTIVE) {
    bySlug.set(c.slug, {
      name: c.name,
      slug: c.slug,
      race: c.race,
      bucket: "Executive",
      aliases: c.aliases,
    });
  }

  // Leadership overlays (sitting members)
  const leadership = {
    "mike-johnson": "House Speaker",
    "hakeem-jeffries": "House Minority Leader",
    "john-thune": "Senate Majority Leader",
    "chuck-schumer": "Senate Minority Leader",
  };
  for (const [slug, title] of Object.entries(leadership)) {
    const s = bySlug.get(slug);
    if (s) s.race = `${title} · ${s.race || ""}`.replace(/ · $/, "");
  }
  for (const s of bySlug.values()) {
    if (/ocasio/i.test(s.name)) {
      s.aliases = [...new Set([...(s.aliases || []), "AOC", "Ocasio-Cortez"])];
    }
  }

  const seeds = [...bySlug.values()]
    .map((s) => ({
      name: s.name,
      slug: s.slug,
      race: s.race,
      bucket: s.bucket,
      aliases: s.aliases,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts = {};
  for (const s of seeds) counts[s.bucket] = (counts[s.bucket] || 0) + 1;

  if (seeds.length < 500) {
    return { ok: false, message: `roster too small (${seeds.length}); not publishing` };
  }

  const res = await putPoliticianRoster({
    updatedAt: new Date().toISOString(),
    source: `congress-legislators (${sen} sen / ${house} house) + wikipedia governors (${gov}) + curated executive/scotus`,
    seeds,
  });

  if (!res.ok) {
    return {
      ok: false,
      message: `upload failed ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}`,
    };
  }

  return {
    ok: true,
    message: `Roster ${seeds.length}: Sen ${counts.Senate || 0} · House ${counts.House || 0} · Gov ${counts.Governor || 0} · Exec ${counts.Executive || 0} · SCOTUS ${counts["Supreme Court"] || 0}`,
    submitted: seeds.length,
  };
}
