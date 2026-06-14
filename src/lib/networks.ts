/**
 * News-outlet allow-list, by normalized channel name. The front-page section is
 * editorial: only established news outlets are eligible to be featured, even
 * though the scanner itself will draft from any channel with a transcript.
 *
 * Matched against a post's `sourceTitle` (the YouTube channel title captured at
 * publish time). Kept in sync with NETWORK_CHANNEL_IDS in
 * runner/youtubeScanner.mjs, but matched by name here because published posts
 * store the channel title, not its id.
 */
const NETWORK_KEYS = [
  "cnn",
  "foxnews",
  "foxbusiness",
  "msnbc",
  "msnow",
  "abcnews",
  "cbsnews",
  "nbcnews",
  "pbsnewshour",
  "newsnation",
  "cspan",
  "reuters",
  "associatedpress",
  "bloomberg",
  "cnbc",
  "thehill",
  "washingtonpost",
  "wallstreetjournal",
  "wsj",
  "usatoday",
  "politico",
  "npr",
  "forbes",
];

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True if a post's source channel is one of the allow-listed news outlets. */
export function isNewsOutlet(sourceTitle: string | null | undefined): boolean {
  const n = norm(sourceTitle);
  if (!n) return false;
  return NETWORK_KEYS.some((k) => n.includes(k));
}
