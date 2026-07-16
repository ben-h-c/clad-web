/**
 * Politician Roster Sync — daily rebuild of who currently holds office.
 *
 * All branches come from live public sources (no hand-maintained member lists):
 *  - Congress: unitedstates/congress-legislators YAML
 *  - Governors: Wikipedia “List of current United States governors”
 *  - Executive: Wikipedia “Cabinet of the United States” (+ current President)
 *  - SCOTUS: Wikipedia “List of justices…” current (no end date) rows
 *
 * Posts seeds to POST /api/agent/politicians-roster (AGENTS KV).
 * /politicians/ prefers live KV, falls back to static snapshot.
 */
import { putPoliticianRoster } from "./api.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

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
  // Bound the request so a stalled GitHub/Wikipedia socket can't hang this agent
  // (and, via the sequential tick loop, every later agent) for undici's ~300s
  // default. 30s is generous for the multi-MB congress YAML; a timeout throws
  // and surfaces through the caller's existing try/catch as an ordinary failure.
  const res = await fetch(url, {
    headers: { "User-Agent": "CladFactsRosterSync/1.0 (+https://cladfacts.com)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function wikiHtml(page) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&prop=text&format=json&page=" +
    encodeURIComponent(page);
  const data = JSON.parse(await fetchText(url));
  if (!data?.parse?.text?.["*"]) throw new Error(`wiki parse failed: ${page}`);
  return data.parse.text["*"];
}

function cellText(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#91;.*?&#93;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPersonName(raw) {
  let n = String(raw || "")
    .replace(/\s*\(acting\)\s*/gi, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop leading role fragments if the cell mixed office+name
  n = n.replace(/^(U\.S\. senator|Former|TV host|Key Square|AFPI|Cantor|Liberty|Lawyer|Political consultant|Deputy|FHFA|Former U\.S\.)\b[^A-Z]*/i, "").trim();
  // Prefer "First Last" — if still long, take last 2–4 capitalized tokens
  if (n.length > 50) {
    const bits = n.split(" ").filter(Boolean);
    n = bits.slice(-3).join(" ");
  }
  // Strip trailing "from State"
  n = n.replace(/\s+from\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*$/, "").trim();
  return n;
}

function cleanOffice(raw) {
  return String(raw || "")
    .replace(/\(.*?\)/g, " ")
    .replace(/§\s*\d+\w*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*War\b/i, "")
    .trim();
}

function executiveAliases(name, office) {
  const aliases = [name];
  if (/^JD |^J\.D\./i.test(name)) aliases.push("J.D. Vance", "JD Vance", "Vice President Vance");
  if (/Robert F\. Kennedy/i.test(name)) aliases.push("RFK Jr", "RFK Junior", "Robert F. Kennedy Jr.");
  if (/President/i.test(office) && !/Vice/i.test(office)) aliases.push("President Trump", "President " + name.split(" ").slice(-1)[0]);
  if (/Vice President/i.test(office)) aliases.push("Vice President " + name.split(" ").slice(-1)[0]);
  if (/Secretary/i.test(office) || /Attorney General/i.test(office)) {
    aliases.push("Secretary " + name.split(" ").slice(-1)[0]);
  }
  return [...new Set(aliases)];
}

/**
 * Parse Cabinet of the United States — current Cabinet + cabinet-rank tables.
 */
function parseCabinetFromHtml(html) {
  const tables = [...html.matchAll(/<table class="wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const out = [];
  const seenOffice = new Set();

  for (const table of tables) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)];
    for (const r of rows) {
      const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1]));
      if (cells.length < 2) continue;
      // Skip pure header / committee-mapping tables (Office → Senate committee)
      if (/^Office/i.test(cells[0]) && /Name|Start|Designee|committee/i.test(cells[1] || "")) continue;
      if (/Senate confirmation|review committee|Committee$/i.test(cells[1] || "")) continue;

      // Patterns: [Office, Name, Start] or multi-column [Office, Name, Office, Name]
      const pairs = [];
      if (cells.length >= 2 && cells[0] && cells[1]) {
        pairs.push([cells[0], cells[1]]);
      }
      if (cells.length >= 4 && cells[2] && cells[3] && /Secretary|Director|Administrator|Attorney|Vice|Trade|Staff/i.test(cells[2])) {
        pairs.push([cells[2], cells[3]]);
      }

      for (const [officeRaw, nameRaw] of pairs) {
        const office = cleanOffice(officeRaw);
        let name = cleanPersonName(nameRaw);
        if (!office || !name) continue;
        if (/^Office|Name|Start|Date|Designee/i.test(office)) continue;
        if (/^Office|Name|Start|Date|Designee/i.test(name)) continue;
        if (name.length < 4 || name.length > 60) continue;
        // Person-shaped: "First Last" (allow Jr./III). Reject committee names.
        if (/Committee|Relations|Services|Judiciary|Intelligence|Finance|Affairs/i.test(name)) continue;
        if (!/^[A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,5}(?:,?\s*(?:Jr\.?|Sr\.?|III|IV))?$/u.test(name) && !/^(JD|J\.D\.)\s+/i.test(name)) {
          continue;
        }
        // Office should look like an executive role
        if (!/Secretary|Vice President|Attorney General|Director|Administrator|Chief of Staff|Trade Representative|Ambassador/i.test(office)) {
          continue;
        }

        const key = office.toLowerCase();
        if (seenOffice.has(key)) continue;
        seenOffice.add(key);

        const slug = slugify(name);
        out.push({
          name,
          slug,
          race: office,
          bucket: "Executive",
          aliases: executiveAliases(name, office),
        });
      }
    }
  }
  return out;
}

/** Current President of the United States (cabinet page omits POTUS). */
async function fetchCurrentPresident() {
  const html = await wikiHtml("President_of_the_United_States");
  // Infobox often: <td class="infobox-data">…Donald Trump…</td> near "Incumbent"
  const m =
    html.match(/Incumbent[\s\S]{0,400}?<a[^>]+title="([^"]+)"[^>]*>([^<]+)<\/a>/i) ||
    html.match(/class="infobox-data"[^>]*>[\s\S]*?<a[^>]+title="(Donald Trump|[^"]+)"[^>]*>([^<]+)<\/a>/i);
  let name = m ? cleanPersonName(m[2] || m[1]) : null;
  if (!name || name.length < 4) {
    // Fallback: first bold name after "Incumbent"
    const m2 = html.match(/Incumbent[\s\S]{0,200}?<b>([^<]{3,60})<\/b>/i);
    name = m2 ? cleanPersonName(m2[1]) : null;
  }
  if (!name) throw new Error("could not parse current President");
  return {
    name,
    slug: slugify(name),
    race: "President of the United States",
    bucket: "Executive",
    aliases: executiveAliases(name, "President"),
  };
}

/**
 * Extract a justice's display name from a Wikipedia cell like
 * "John Roberts (born 1955)" or "Ruth Bader Ginsburg (1933–2020)".
 */
function scotusNameFromCell(raw) {
  const cleaned = cleanPersonName(String(raw || "").replace(/\s*\([^)]*\)\s*/g, " ").trim());
  if (!cleaned || cleaned.length < 5 || cleaned.length > 50) return null;
  if (/^\d+$/.test(cleaned)) return null;
  if (/Justice|Born|State|Appointed|President|Name|Position|Succeeded|Confirmation/i.test(cleaned)) {
    return null;
  }
  // "First Last" or "First Middle Last" (allow Jr./III and initials)
  if (!/^[A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4}(?:,?\s*(?:Jr\.?|Sr\.?|III|IV))?$/u.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function scotusSeed(name, positionHint = "") {
  const chief =
    /Chief/i.test(positionHint) || /Roberts/i.test(name);
  return {
    name,
    slug: slugify(name),
    race: chief
      ? "U.S. Supreme Court · Chief Justice"
      : "U.S. Supreme Court · Associate Justice",
    bucket: "Supreme Court",
    aliases: [
      name,
      chief ? "Chief Justice Roberts" : `Justice ${name.split(" ").slice(-1)[0]}`,
    ].filter(Boolean),
  };
}

/**
 * Current SCOTUS justices.
 * Prefer the membership table on the Court page (always 9 sitting justices).
 * Fall back to the historical list filtered by "– present" term strings.
 * Wikipedia restructures markup often; keep multiple strategies.
 */
async function fetchCurrentScotus() {
  // Strategy 1: Supreme Court of the United States → current membership table
  try {
    const mainHtml = await wikiHtml("Supreme_Court_of_the_United_States");
    const tables = [...mainHtml.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/gi)].map(
      (m) => m[0]
    );
    for (const table of tables) {
      const header = cellText(table.slice(0, 800));
      // Membership table: justice + appointed by + start date (not retirees)
      if (!/Justice/i.test(header) || !/Appointed/i.test(header)) continue;
      if (/Retirement|End date/i.test(header) && !/Length of service/i.test(header)) continue;

      const out = [];
      const seen = new Set();
      for (const r of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
        const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
          cellText(c[1])
        );
        if (cells.length < 3) continue;
        // Name is usually in the second cell after an empty/portrait first cell:
        // "(Chief Justice) John Roberts ( 1955-01-27 ) January 27, 1955 …"
        const nameCell =
          cells.find((c) => /\b(Chief Justice|Associate)?\s*[A-Z][a-z]+ [A-Z]/.test(c) && c.length > 8) ||
          cells[1] ||
          cells[0];
        const stripped = String(nameCell || "")
          .replace(/\(Chief Justice\)\s*/i, "Chief ")
          .replace(/\(.*?\)/g, " ")
          .replace(/January|February|March|April|May|June|July|August|September|October|November|December/gi, " ")
          .replace(/\b\d{1,2},?\s*\d{4}\b/g, " ")
          .replace(/\bage\s*\d+\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Drop city/state trails: "Buffalo, New York" often follows after the name
        // Keep first 2–4 name tokens only.
        const tokens = stripped.split(" ").filter(Boolean);
        // "Chief John Roberts" or "John Roberts"
        let nameTokens = tokens;
        const chiefLead = /^Chief$/i.test(tokens[0]);
        if (chiefLead) nameTokens = tokens.slice(1);
        // Cut at first non-name token (e.g. location words that slipped through)
        const personBits = [];
        for (const t of nameTokens) {
          if (!/^[A-Z][\w.'’-]+$/u.test(t) && !/^(Jr\.?|Sr\.?|III|IV)$/i.test(t)) break;
          personBits.push(t);
          if (personBits.length >= 4) break;
        }
        const name = scotusNameFromCell(personBits.join(" "));
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(scotusSeed(name, chiefLead || /Roberts/i.test(name) ? "Chief" : ""));
      }
      if (out.length >= 8 && out.length <= 12) return out.slice(0, 9);
    }
  } catch {
    // fall through to list page
  }

  // Strategy 2: historical list — Term column ends with "– present"
  const html = await wikiHtml("List_of_justices_of_the_Supreme_Court_of_the_United_States");
  const table =
    html.match(/<table class="wikitable[^"]*sortable[^"]*"[^>]*>[\s\S]*?<\/table>/)?.[0] ||
    html.match(/<table class="wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("SCOTUS table not found");

  const out = [];
  const seen = new Set();
  for (const r of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      cellText(c[1])
    );
    if (cells.length < 6) continue;
    // Columns (2026 markup): No. | (portrait) | Name (birth–death) | State | Position | …
    // | Confirmation | Term | Duration | Appointer
    // Current seats: Term like "October 23, 1991 – present"
    const termCell = cells.find((c) => /\d{4}\s*[–—-]\s*present/i.test(c));
    if (!termCell) continue;

    // Name cell is usually "Clarence Thomas (born 1948)" — not the numeric No. col
    let name = null;
    let position = "";
    for (const c of cells) {
      if (/Chief Justice|Associate Justice/i.test(c) && c.length < 30) {
        position = c;
        continue;
      }
      const candidate = scotusNameFromCell(c.replace(/\s*\([^)]*\)\s*/g, " "));
      if (candidate) {
        name = candidate;
        break;
      }
    }
    // Prefer the dedicated name column when cells[2] is person-shaped
    const col2 = scotusNameFromCell(String(cells[2] || "").replace(/\s*\([^)]*\)\s*/g, " "));
    if (col2) name = col2;

    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(scotusSeed(name, position));
  }

  if (out.length < 8) throw new Error(`SCOTUS parse weak (${out.length})`);
  // Cap at 9 sitting seats (ignore historical noise)
  return out.slice(0, 9);
}

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
    const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1]));
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
    const aliases = name.includes("Pritzker") ? [name, "J.B. Pritzker", "JB Pritzker"] : [name];
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

  const govHtml = await wikiHtml("List_of_current_United_States_governors");
  const gov = addGovernors(bySlug, govHtml);

  // Executive — live from Wikipedia (cabinet + cabinet-rank + President)
  let execCount = 0;
  try {
    const potus = await fetchCurrentPresident();
    bySlug.set(potus.slug, potus);
    execCount++;

    const cabHtml = await wikiHtml("Cabinet_of_the_United_States");
    const cabinet = parseCabinetFromHtml(cabHtml);
    if (cabinet.length < 12) {
      return { ok: false, message: `cabinet parse too thin (${cabinet.length}); not publishing` };
    }
    for (const c of cabinet) {
      // Prefer cabinet race label if slug already exists as a senator/rep
      // (e.g. Rubio was a senator; now SoS — show executive office)
      bySlug.set(c.slug, {
        ...(bySlug.get(c.slug) || {}),
        ...c,
        aliases: [...new Set([...(bySlug.get(c.slug)?.aliases || []), ...c.aliases])],
        bucket: "Executive",
      });
      execCount++;
    }
  } catch (err) {
    return { ok: false, message: `executive fetch failed: ${String(err?.message || err).slice(0, 160)}` };
  }

  // SCOTUS — live from Wikipedia
  let scotusCount = 0;
  try {
    const justices = await fetchCurrentScotus();
    for (const j of justices) {
      bySlug.set(j.slug, j);
      scotusCount++;
    }
  } catch (err) {
    return { ok: false, message: `scotus fetch failed: ${String(err?.message || err).slice(0, 160)}` };
  }

  // Leadership title overlays for sitting members (when present)
  const leadership = {
    "mike-johnson": "House Speaker",
    "hakeem-jeffries": "House Minority Leader",
    "john-thune": "Senate Majority Leader",
    "chuck-schumer": "Senate Minority Leader",
  };
  for (const [slug, title] of Object.entries(leadership)) {
    const s = bySlug.get(slug);
    if (s && s.bucket !== "Executive") s.race = `${title} · ${s.race || ""}`.replace(/ · $/, "");
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
  if ((counts.Executive || 0) < 10) {
    return { ok: false, message: `executive too thin (${counts.Executive || 0}); not publishing` };
  }

  const res = await putPoliticianRoster({
    updatedAt: new Date().toISOString(),
    source: `congress-legislators (${sen}s/${house}h) + wiki governors (${gov}) + wiki cabinet (${execCount}) + wiki scotus (${scotusCount})`,
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
