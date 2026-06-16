/**
 * Markets ticker feed. Fetches quotes for a set of indices/stocks/crypto/
 * commodities from CNBC's public quote API (no key, one batched request for all
 * symbols, returns change %) and posts them to KV, where the home page reads
 * them for the scrolling ticker. Throttled to at most every two minutes; on any
 * failure the last good quotes stay in KV (graceful staleness).
 */
import { setTicker } from "./api.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// CNBC symbol -> display label.
const SYMBOLS = [
  { sym: ".SPX", label: "S&P 500" },
  { sym: ".DJI", label: "DOW" },
  { sym: ".IXIC", label: "NASDAQ" },
  { sym: "AAPL", label: "AAPL" },
  { sym: "MSFT", label: "MSFT" },
  { sym: "NVDA", label: "NVDA" },
  { sym: "TSLA", label: "TSLA" },
  { sym: "AMZN", label: "AMZN" },
  { sym: "GOOGL", label: "GOOGL" },
  { sym: "META", label: "META" },
  { sym: "BTC.CM=", label: "BTC" },
  { sym: "@CL.1", label: "OIL" },
  { sym: "@GC.1", label: "GOLD" },
];
const LABELS = Object.fromEntries(SYMBOLS.map((s) => [s.sym, s.label]));
const ORDER = Object.fromEntries(SYMBOLS.map((s, i) => [s.label, i]));

const MIN_INTERVAL_MS = 120_000; // refresh at most every 2 minutes
let lastRun = 0;

async function fetchQuotes() {
  const symbols = SYMBOLS.map((s) => s.sym).join("|");
  const url =
    "https://quote.cnbc.com/quote-html-webservice/quote.htm?" +
    `symbols=${encodeURIComponent(symbols)}&requestMethod=quick&output=json`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`cnbc ${r.status}`);
  const d = await r.json();
  let rows = d?.QuickQuoteResult?.QuickQuote ?? [];
  if (!Array.isArray(rows)) rows = [rows];
  const quotes = [];
  for (const row of rows) {
    const label = LABELS[row?.symbol];
    const price = Number(row?.last);
    const changePct = Number(row?.change_pct);
    if (label && Number.isFinite(price) && Number.isFinite(changePct)) {
      quotes.push({ label, price, changePct });
    }
  }
  quotes.sort((a, b) => (ORDER[a.label] ?? 99) - (ORDER[b.label] ?? 99));
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
