/**
 * Per-post media framing for home/app strip cards.
 *
 * Policy (post-2026-07-24 correction):
 *  - If a still exists → always full-bleed **overlay** (image + text scrim).
 *  - Individualization is the **focus point only** (where cover crops).
 *  - modular/text are reserved for true failures (no thumb / explicit editor override).
 *
 * Fields (optional; legacy → overlay + center upper):
 *   mediaStyle  — overlay | modular | text
 *   thumbFocusX / thumbFocusY — 0–100 object-position anchors (clamped to safe band)
 *   mediaNote   — pipeline rationale (not shown)
 */
import { thumbnailUrl } from "./youtube.ts";

export const MEDIA_STYLES = ["overlay", "modular", "text"] as const;
export type MediaStyle = (typeof MEDIA_STYLES)[number];

export interface MediaPresentation {
  mediaStyle: MediaStyle;
  /** Horizontal focus 0–100 (0 = left edge). */
  thumbFocusX: number;
  /** Vertical focus 0–100 (0 = top edge). */
  thumbFocusY: number;
  /** One-line editorial rationale from the analyzer (optional). */
  mediaNote?: string;
}

/** Safe default: full-bleed, slightly upper-center (talking heads / news frames). */
export const DEFAULT_MEDIA: MediaPresentation = {
  mediaStyle: "overlay",
  thumbFocusX: 50,
  thumbFocusY: 32,
};

// Multimodal chat models (grok-4.5 accepts image_url content parts).
const VISION_MODEL = "grok-4.5";

/** Horizontal band kept away from dead side-margins that feel like "random zoom". */
const FOCUS_X_MIN = 28;
const FOCUS_X_MAX = 72;
/** Vertical band: upper third of frame, above bottom text scrim. */
const FOCUS_Y_MIN = 18;
const FOCUS_Y_MAX = 42;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function clampPct(n: unknown, fallback: number): number {
  return clamp(n, 0, 100, fallback);
}

export function normalizeMediaStyle(v: unknown): MediaStyle | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return (MEDIA_STYLES as readonly string[]).includes(s) ? (s as MediaStyle) : undefined;
}

/**
 * Safe focus for cover crops — never stick to far edges (reads as random zoom).
 */
export function safeFocus(
  x: unknown,
  y: unknown
): { thumbFocusX: number; thumbFocusY: number } {
  return {
    thumbFocusX: clamp(x, FOCUS_X_MIN, FOCUS_X_MAX, DEFAULT_MEDIA.thumbFocusX),
    thumbFocusY: clamp(y, FOCUS_Y_MIN, FOCUS_Y_MAX, DEFAULT_MEDIA.thumbFocusY),
  };
}

/** Merge partial frontmatter / API values onto safe defaults. */
export function coerceMediaPresentation(
  partial?: Partial<MediaPresentation> | null,
  opts?: { allowNonOverlay?: boolean }
): MediaPresentation {
  if (!partial) return { ...DEFAULT_MEDIA };
  const focus = safeFocus(partial.thumbFocusX, partial.thumbFocusY);
  let style = normalizeMediaStyle(partial.mediaStyle) ?? DEFAULT_MEDIA.mediaStyle;
  // Prefer overlay unless editor explicitly allows modular/text, or no still path.
  if (!opts?.allowNonOverlay && (style === "modular" || style === "text")) {
    style = "overlay";
  }
  return {
    mediaStyle: style,
    thumbFocusX: focus.thumbFocusX,
    thumbFocusY: focus.thumbFocusY,
    mediaNote:
      typeof partial.mediaNote === "string" && partial.mediaNote.trim()
        ? partial.mediaNote.trim().slice(0, 200)
        : undefined,
  };
}

/** CSS `object-position` from stored focus percentages. */
export function objectPositionCss(p: Pick<MediaPresentation, "thumbFocusX" | "thumbFocusY">): string {
  const f = safeFocus(p.thumbFocusX, p.thumbFocusY);
  return `${f.thumbFocusX}% ${f.thumbFocusY}%`;
}

/**
 * Resolve presentation for a still. Uses vision when XAI key + image URL
 * are available; always returns overlay when a still exists.
 */
export async function resolveMediaPresentation(args: {
  apiKey?: string;
  imageUrl?: string | null;
  headline?: string;
  videoId?: string | null;
}): Promise<MediaPresentation> {
  const imageUrl =
    (args.imageUrl && args.imageUrl.trim()) ||
    (args.videoId ? thumbnailUrl(args.videoId) : "");
  if (!imageUrl) {
    return {
      mediaStyle: "text",
      thumbFocusX: 50,
      thumbFocusY: 50,
      mediaNote: "No still available",
    };
  }
  if (!args.apiKey) return { ...DEFAULT_MEDIA, mediaNote: "default (no vision key)" };

  try {
    const decided = await analyzeStillWithVision({
      apiKey: args.apiKey,
      imageUrl,
      headline: args.headline ?? "",
    });
    // Force overlay whenever we have art — modular was dropping images on the feed.
    return {
      ...decided,
      mediaStyle: "overlay",
    };
  } catch (e) {
    console.error("mediaPresentation vision failed:", (e as Error)?.message ?? e);
    return { ...DEFAULT_MEDIA, mediaNote: "default (vision failed)" };
  }
}

async function analyzeStillWithVision(args: {
  apiKey: string;
  imageUrl: string;
  headline: string;
}): Promise<MediaPresentation> {
  const system = `You are the photo editor for Clad, a news report-card site.
Every card is a FULL-BLEED image with headline text over the BOTTOM third (dark scrim).
Your ONLY job: pick where object-fit:cover should anchor so the main subject stays visible.

Return ONLY JSON (no markdown):
{
  "thumbFocusX": number,  // 0=left … 100=right
  "thumbFocusY": number,  // 0=top … 100=bottom
  "mediaNote": string     // <= 100 chars
}

Rules:
- Prefer faces / primary action in the upper-middle of the frame.
- Typical talking-head: X 40–60, Y 22–35.
- Split-screen: pick the half matching the headline subject (still X 30–70).
- NEVER put focus in the bottom 40% (covered by text).
- NEVER put focus at extreme edges (0–15 or 85–100) — that reads as random zoom.
- Do NOT invent mediaStyle. Image is always shown full-bleed.`;

  const userText = args.headline
    ? `Headline: ${args.headline}\nPick focus only for the attached still.`
    : "Pick focus only for the attached still.";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.1,
      max_tokens: 160,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: args.imageUrl, detail: "low" },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`vision ${res.status}: ${t.slice(0, 240)}`);
  }

  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("vision empty content");

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("vision non-JSON");
  }

  return coerceMediaPresentation({
    mediaStyle: "overlay",
    thumbFocusX: parsed?.thumbFocusX,
    thumbFocusY: parsed?.thumbFocusY,
    mediaNote: typeof parsed?.mediaNote === "string" ? parsed.mediaNote : undefined,
  });
}

/**
 * Read presentation from post frontmatter.
 * Thumb present → always treat as overlay for rendering (fixes bad modular backfill).
 */
export function mediaFromPostData(d: {
  mediaStyle?: string | null;
  thumbFocusX?: number | null;
  thumbFocusY?: number | null;
  mediaNote?: string | null;
  thumbnail?: string | null;
}): MediaPresentation {
  const hasThumb = !!(d.thumbnail && String(d.thumbnail).trim());
  if (!hasThumb) {
    return {
      mediaStyle: "text",
      thumbFocusX: 50,
      thumbFocusY: 50,
      mediaNote: d.mediaNote ?? undefined,
    };
  }

  // Always overlay when art exists — ignore stored modular/text from bad backfill.
  const focus = safeFocus(d.thumbFocusX, d.thumbFocusY);
  return {
    mediaStyle: "overlay",
    thumbFocusX: focus.thumbFocusX,
    thumbFocusY: focus.thumbFocusY,
    mediaNote: d.mediaNote ?? undefined,
  };
}
