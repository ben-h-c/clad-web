/**
 * Markets ticker feed. Fetches quotes for a set of indices/stocks from Yahoo
 * Finance and posts them to KV, where the home page reads them for the scrolling
 * ticker. Uses Yahoo's cookie+crumb session and a single batched quote request
 * (all symbols at once) to minimise rate-limit risk, refreshed at most every two
 * minutes. On any failure the last good quotes stay in KV (graceful staleness).
 */
import { setTicker } from "./api.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SYMBOLS = [
  { sym: "^GSPC", label: "S&P 500" },
  { sym: "^DJI", label: "DOW" },
  { sym: "^IXIC", label: "NASDAQ" },
  { sym: "AAPL", label: "AAPL" },
  { sym: "MSFT", label: "MSFT" },
  { sym: "NVDA", label: "NVDA" },
  { sym: "TSLA", label: "TSLA" },
  { sym: "AMZN", label: "AMZN" },
  { sym: "GOOGL", label: "GOOGL" },
  { sym: "META", label: "META" },
  { sym: "BTC-USD", label: "BTC" },
  { sym: "CL=F", label: "OIL" },
  { sym: "GC=F", label: "GOLD" },
];
const LABELS = Object.fromEntries(SYMBOLS.map((s) => [s.sym, s.label]));

const MIN_INTERVAL_MS = 120_000; // refresh at most every 2 minutes
let lastRun = 0;
let session = null; // { cookie, crumb, at }
const SESSION_TTL = 50 * 60 * 1000; // 50 min

async function getSession() {
  if (session && Date.now() - session.at < SESSION_TTL) return session;
  // 1) Hit a Yahoo host to obtain an A1 consent cookie.
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA } }).catch(() => null);
  const setCookies = r1?.headers?.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no yahoo cookie");
  // 2) Exchange it for a crumb.
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" },
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 64) throw new Error(`bad crumb (${r2.status})`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function fetchQuotes() {
  const s = await getSession();
  const symbols = SYMBOLS.map((x) => x.sym).join(",");
  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}` +
    `&crumb=${encodeURIComponent(s.crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: s.cookie, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) {
    session = null; // crumb expired — refresh next run
    throw new Error(`auth ${r.status}`);
  }
  if (!r.ok) throw new Error(`quote ${r.status}`);
  const d = await r.json();
  const rows = d?.quoteResponse?.result ?? [];
  const quotes = [];
  for (const row of rows) {
    const label = LABELS[row.symbol];
    const price = Number(row.regularMarketPrice);
    const changePct = Number(row.regularMarketChangePercent);
    if (label && Number.isFinite(price) && Number.isFinite(changePct)) {
      quotes.push({ label, price, changePct });
    }
  }
  // Preserve our configured order.
  quotes.sort((a, b) => SYMBOLS.findIndex((s) => s.label === a.label) - SYMBOLS.findIndex((s) => s.label === b.label));
  return quotes;
}

export async function updateTicker(log) {
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return;
  lastRun = now;

  let quotes;
  try {
    quotes = await fetchQuotes();
  } catch (err) {
    log?.(`ticker: fetch failed (${String(err?.message || err).slice(0, 80)}) — keeping last`);
    return;
  }
  if (!quotes.length) {
    log?.("ticker: no quotes — keeping last");
    return;
  }
  const out = await setTicker(quotes);
  if (!out.ok) log?.(`ticker: store failed ${out.status}`);
  else log?.(`ticker: updated ${quotes.length}/${SYMBOLS.length}`);
}
