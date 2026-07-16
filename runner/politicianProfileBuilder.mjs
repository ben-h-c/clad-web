/**
 * Politician Profile Builder — daily rotation over the officeholder roster.
 *
 * Goals:
 *  1. Find fresh YouTube news about under-covered politicians and draft reports.
 *  2. Resolve missing Wikipedia portraits into KV so cards show faces.
 *
 * Prioritizes people with the fewest graded appearances, rotating a cursor so
 * over months the whole roster gets attention (not just household names).
 *
 * YouTube search costs 100 quota units each — keep maxPoliticiansPerRun modest.
 */
import { generateBroadcastReport } from "../src/lib/broadcast.ts";
import { validateCitations } from "../src/lib/citations.ts";
import { fetchTranscript } from "./transcript.mjs";
import { getKnown, submitDraft } from "./api.mjs";
import { checkVideosPublic } from "./youtubeVideoStatus.mjs";
import { getPoliticianProfile, putPoliticianProfile } from "./api.mjs";

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const UA = "CladFactsBot/1.0 (https://cladfacts.com; politician portraits)";

function lastName(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || name;
}

// Licensing gate (docs/legal/image-claims.md): the portrait pipeline carries
// Wikimedia COMMONS files only — Commons hosts free-licensed media, while the
// page/summary lead image can be a non-free enwiki-local fair-use file
// (upload.wikimedia.org/wikipedia/en/…) that we may not reuse. The Worker
// enforces the same rule at serve time and at the photo-map write endpoint.
function isCommonsMediaUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "upload.wikimedia.org" &&
      u.pathname.startsWith("/wikipedia/commons/")
    );
  } catch {
    return false;
  }
}

async function wikiPortrait(name) {
  const titles = [
    name.replace(/\s+/g, "_"),
    name.replace(/\s+[A-Z]\.\s+/g, " ").trim().replace(/\s+/g, "_"),
  ];
  for (const title of titles) {
    try {
      const r = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type === "disambiguation") continue;
      if (j.thumbnail?.source && isCommonsMediaUrl(j.thumbnail.source)) return j.thumbnail.source;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function searchVideos(apiKey, person, withinHours) {
  const publishedAfter = new Date(Date.now() - withinHours * 3600_000).toISOString();
  const ln = lastName(person.name);
  // Prefer exact name + political context so we don't grab cooking-show namesakes.
  const q = `"${person.name}" (Senate OR Congress OR House OR Governor OR President OR Secretary OR interview OR hearing OR speech OR debate)`;
  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    order: "date",
    maxResults: "5",
    publishedAfter,
    relevanceLanguage: "en",
    regionCode: "US",
    videoCategoryId: "25", // News & Politics
    q,
  });
  const res = await fetch(`${YT_SEARCH}?${params}`);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`YouTube search ${res.status}: ${t.slice(0, 120)}`);
  }
  const data = await res.json();
  const out = [];
  for (const it of data.items || []) {
    const id = it.id?.videoId;
    const s = it.snippet || {};
    if (!id) continue;
    const title = s.title || "";
    const channel = s.channelTitle || "";
    // Soft gate: title or channel should mention last name (or full name).
    const blob = `${title} ${channel}`.toLowerCase();
    if (!blob.includes(ln.toLowerCase()) && !blob.includes(person.name.toLowerCase())) continue;
    out.push({
      videoId: id,
      title,
      channel,
      publishedAt: s.publishedAt || "",
    });
  }
  return out;
}

export async function runPoliticianProfileBuilder(agent) {
  const ytKey = process.env.YOUTUBE_API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  if (!ytKey) return { ok: false, message: "YOUTUBE_API_KEY not set" };
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY not set" };

  const c = agent.config || {};
  const maxPeople = Math.min(Number(c.maxPoliticiansPerRun) || 20, 30);
  const maxDraftsTotal = Math.min(Number(c.maxPublishesPerRun) || 16, 24);
  const maxDraftsEach = Math.min(Number(c.maxDraftsPerPolitician) || 1, 3);
  const maxPhotos = Math.min(Number(c.maxPhotoLookupsPerRun) || 60, 100);
  const withinHours = Number(c.publishedWithinHours) || 168;

  const profile = await getPoliticianProfile();
  if (!profile.ok) {
    return { ok: false, message: `profile fetch failed: ${profile.status}` };
  }
  const people = profile.body?.people || [];
  if (people.length < 50) {
    return { ok: false, message: `roster too small (${people.length}); run roster sync first` };
  }

  // Priority: zero-coverage officeholders first (need gradeable material),
  // then missing photos, then fewest appearances, then A–Z.
  const bucketWeight = (b) => {
    const x = String(b || "");
    if (x === "Executive") return 0;
    if (x === "Supreme Court") return 1;
    if (x === "Senate") return 2;
    if (x === "Governor") return 3;
    if (x === "House") return 4;
    return 5;
  };
  const ranked = [...people].sort((a, b) => {
    const az = (a.appearances || 0) === 0 ? 0 : 1;
    const bz = (b.appearances || 0) === 0 ? 0 : 1;
    if (az !== bz) return az - bz;
    if (bucketWeight(a.bucket) !== bucketWeight(b.bucket))
      return bucketWeight(a.bucket) - bucketWeight(b.bucket);
    if (a.appearances !== b.appearances) return a.appearances - b.appearances;
    if (a.hasPhoto !== b.hasPhoto) return a.hasPhoto ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const cursor = Number(profile.body?.scout?.cursor) || 0;
  const start = cursor % ranked.length;
  const batch = [];
  for (let i = 0; i < maxPeople && i < ranked.length; i++) {
    batch.push(ranked[(start + i) % ranked.length]);
  }

  // --- Photos ---
  const newPhotos = {};
  let photosFound = 0;
  let photoLookups = 0;
  for (const p of batch) {
    if (photoLookups >= maxPhotos) break;
    if (p.hasPhoto) continue;
    photoLookups++;
    const url = await wikiPortrait(p.name);
    if (url) {
      newPhotos[p.slug] = url;
      photosFound++;
    }
  }
  // Also backfill a few zero-photo people outside the coverage batch (house seats)
  if (photoLookups < maxPhotos) {
    const needPhoto = ranked.filter((p) => !p.hasPhoto && !newPhotos[p.slug]);
    for (const p of needPhoto) {
      if (photoLookups >= maxPhotos) break;
      photoLookups++;
      const url = await wikiPortrait(p.name);
      if (url) {
        newPhotos[p.slug] = url;
        photosFound++;
      }
    }
  }

  // --- Coverage search + draft ---
  let submitted = 0;
  let searched = 0;
  let skipped = 0;
  let noTranscript = 0;
  let searchErrors = 0;

  for (const person of batch) {
    if (submitted >= maxDraftsTotal) break;
    let videos = [];
    try {
      searched++;
      videos = await searchVideos(ytKey, person, withinHours);
    } catch (err) {
      searchErrors++;
      // Quota / API errors: stop burning searches this run
      if (String(err?.message || "").includes("403") || String(err?.message || "").includes("quota")) {
        break;
      }
      continue;
    }
    if (videos.length === 0) continue;

    const known = await getKnown(
      agent.id,
      videos.map((v) => ({ videoId: v.videoId, channel: v.channel, title: v.title }))
    );
    const knownSet = new Set(known.ok ? known.body.known || [] : []);
    const fresh = videos.filter((v) => !knownSet.has(v.videoId));
    if (fresh.length === 0) {
      skipped += videos.length;
      continue;
    }

    const statusById = await checkVideosPublic(fresh.map((v) => v.videoId));
    let draftedForPerson = 0;

    for (const v of fresh) {
      if (submitted >= maxDraftsTotal || draftedForPerson >= maxDraftsEach) break;
      const live = statusById.get(v.videoId);
      if (live && live.ok === false) {
        skipped++;
        continue;
      }
      const transcript = await fetchTranscript(v.videoId);
      if (!transcript) {
        noTranscript++;
        skipped++;
        continue;
      }
      const sourceUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
      let report;
      try {
        report = await generateBroadcastReport(xaiKey, {
          transcript,
          sourceUrl,
          videoTitle: v.title,
          channel: v.channel,
        });
      } catch {
        skipped++;
        continue;
      }
      report.citations = await validateCitations(report.citations);
      // postBuild/tagPoliticiansFromText will attach roster matches from the
      // headline/summary; search already required the person's name in the title.
      const out = await submitDraft({
        agentId: agent.id,
        sourceUrl,
        report,
        source: {
          channel: v.channel,
          videoTitle: v.title,
          transcriptUsed: true,
          publishedAt: v.publishedAt,
        },
      });
      if (out.ok) {
        submitted++;
        draftedForPerson++;
      } else {
        skipped++;
      }
    }
  }

  const nextCursor = (start + batch.length) % ranked.length;
  await putPoliticianProfile({
    photos: Object.keys(newPhotos).length ? newPhotos : undefined,
    scout: { cursor: nextCursor },
  });

  return {
    ok: true,
    message:
      `Scouted ${batch.length} officeholders (cursor ${start}→${nextCursor}): ` +
      `${submitted} drafts, ${searched} searches, ${photosFound} new photos ` +
      `(${photoLookups} lookups), ${skipped} skipped` +
      (noTranscript ? `, ${noTranscript} no transcript` : "") +
      (searchErrors ? `, ${searchErrors} search errors` : ""),
    submitted,
    skipped,
  };
}
