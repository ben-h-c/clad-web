/**
 * Per-post still framing + quality gate for strip cards.
 *
 * Layout policy (2026-07-24): cards use a fixed **16:9 photo band** + type
 * panel below — never portrait full-bleed cover of landscape YouTube stills
 * (that was the “random zoom”). Focus only nudges within the 16:9 band.
 *
 * Still quality (2026-08-08, updated 2026-08-08 rev always-image): vision
 * scores whether the YouTube still is newsroom-suitable in a 16:9 card.
 * **Fail → owned `/generated/` illustration** (not text-only). Bad chyrons
 * never ship next to clean talking heads; cards always ship with an image.
 *
 * Fields (optional):
 *   mediaStyle   — overlay/band (show art) | text (rare residual: no art at all)
 *   thumbFocusX / thumbFocusY — object-position in the 16:9 band
 *   stillQuality — pass | weak | fail (pipeline; not shown to readers)
 *   mediaNote    — pipeline note (not shown)
 */
import { thumbnailUrl } from "./youtube.ts";

export const MEDIA_STYLES = ["overlay", "modular", "text"] as const;
export type MediaStyle = (typeof MEDIA_STYLES)[number];

export const STILL_QUALITIES = ["pass", "weak", "fail"] as const;
export type StillQuality = (typeof STILL_QUALITIES)[number];

export interface MediaPresentation {
  mediaStyle: MediaStyle;
  thumbFocusX: number;
  thumbFocusY: number;
  stillQuality?: StillQuality;
  mediaNote?: string;
}

/** Center-ish in a 16:9 frame; mild upper bias for faces without face-fill zoom. */
export const DEFAULT_MEDIA: MediaPresentation = {
  mediaStyle: "overlay",
  thumbFocusX: 50,
  thumbFocusY: 40,
};

const VISION_MODEL = "grok-4.5";

/** Mild clamp — 16:9 band already shows almost the full still. */
const FOCUS_X_MIN = 20;
const FOCUS_X_MAX = 80;
const FOCUS_Y_MIN = 20;
const FOCUS_Y_MAX = 55;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function normalizeMediaStyle(v: unknown): MediaStyle | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return (MEDIA_STYLES as readonly string[]).includes(s) ? (s as MediaStyle) : undefined;
}

export function normalizeStillQuality(v: unknown): StillQuality | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return (STILL_QUALITIES as readonly string[]).includes(s) ? (s as StillQuality) : undefined;
}

export function safeFocus(
  x: unknown,
  y: unknown
): { thumbFocusX: number; thumbFocusY: number } {
  return {
    thumbFocusX: clamp(x, FOCUS_X_MIN, FOCUS_X_MAX, DEFAULT_MEDIA.thumbFocusX),
    thumbFocusY: clamp(y, FOCUS_Y_MIN, FOCUS_Y_MAX, DEFAULT_MEDIA.thumbFocusY),
  };
}

export function coerceMediaPresentation(
  partial?: Partial<MediaPresentation> | null,
  opts?: { allowNonOverlay?: boolean }
): MediaPresentation {
  if (!partial) return { ...DEFAULT_MEDIA };
  const focus = safeFocus(partial.thumbFocusX, partial.thumbFocusY);
  let style = normalizeMediaStyle(partial.mediaStyle) ?? DEFAULT_MEDIA.mediaStyle;
  // modular is legacy — treat as overlay (16:9 band). text only as residual.
  if (style === "modular") style = "overlay";
  if (!opts?.allowNonOverlay && style === "text") style = "overlay";
  const quality = normalizeStillQuality(partial.stillQuality);
  return {
    mediaStyle: style,
    thumbFocusX: focus.thumbFocusX,
    thumbFocusY: focus.thumbFocusY,
    stillQuality: quality,
    mediaNote:
      typeof partial.mediaNote === "string" && partial.mediaNote.trim()
        ? partial.mediaNote.trim().slice(0, 200)
        : undefined,
  };
}

export function objectPositionCss(p: Pick<MediaPresentation, "thumbFocusX" | "thumbFocusY">): string {
  const f = safeFocus(p.thumbFocusX, p.thumbFocusY);
  return `${f.thumbFocusX}% ${f.thumbFocusY}%`;
}

/**
 * Fail does **not** hide art. It marks the broadcast still as unsuitable so
 * approve/publish can swap in owned `/generated/` illustration. Force-show
 * keeps the YouTube still even on fail.
 */
export function applyStillQualityGate(
  media: MediaPresentation,
  opts?: { forceStill?: boolean }
): MediaPresentation {
  if (media.stillQuality === "fail" && !opts?.forceStill) {
    return {
      ...media,
      // Always-image: presentation expects art; pipeline supplies illustration.
      mediaStyle: "overlay",
      mediaNote: media.mediaNote
        ? `fail — use illustration: ${media.mediaNote}`.slice(0, 200)
        : "Still quality fail — use owned illustration",
    };
  }
  return media;
}

/** True when approve/publish should commit owned art instead of the YT still. */
export function needsOwnedIllustration(
  media: MediaPresentation,
  opts?: { forceStill?: boolean; preferIllustration?: boolean }
): boolean {
  if (opts?.forceStill) return false;
  if (opts?.preferIllustration) return true;
  return media.stillQuality === "fail";
}

export async function resolveMediaPresentation(args: {
  apiKey?: string;
  imageUrl?: string | null;
  headline?: string;
  videoId?: string | null;
  /** When true, keep YouTube still even if vision scores fail. */
  forceStill?: boolean;
}): Promise<MediaPresentation> {
  const imageUrl =
    (args.imageUrl && args.imageUrl.trim()) ||
    (args.videoId ? thumbnailUrl(args.videoId) : "");
  if (!imageUrl) {
    return {
      mediaStyle: "overlay",
      thumbFocusX: 50,
      thumbFocusY: 50,
      stillQuality: "fail",
      mediaNote: "No still available — use owned illustration",
    };
  }
  // Default is already intentional for 16:9 band — vision is optional polish.
  if (!args.apiKey) {
    return { ...DEFAULT_MEDIA, mediaNote: "default 16:9 framing" };
  }

  try {
    const decided = await analyzeStillWithVision({
      apiKey: args.apiKey,
      imageUrl,
      headline: args.headline ?? "",
    });
    // Always overlay at this layer; fail → illustration is applied at publish.
    const withStyle: MediaPresentation = {
      ...decided,
      mediaStyle: "overlay",
    };
    return applyStillQualityGate(withStyle, { forceStill: args.forceStill });
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
  const system = `You frame a 16:9 news still for a small report-card photo band and score whether the still is newsroom-quality.

Return ONLY JSON:
{"thumbFocusX":number,"thumbFocusY":number,"stillQuality":"pass"|"weak"|"fail","mediaNote":string}

Focus rules: prefer center; talking heads ~X 45-55 Y 35-45; avoid extreme edges; Y rarely below 25 or above 55.

stillQuality rules (strict — bad art undercuts credibility next to clean cards):
- pass: clean subject (talking head, clear scene), minimal or no chyron, suitable crop in a 16:9 card band.
- weak: some lower-third text or busy edges but the main subject is still readable and professional enough to show.
- fail: heavy network chyrons / large on-image text blocks; split or composite thumbnails; letterboxed or low-signal stills; logo soup; graphics that read as stretched or cut mid-panel; unusable crop for a card strip.

mediaNote: short reason (under 120 chars), e.g. "clean talking head" or "busy split graphic + heavy chyron".`;

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
            { type: "image_url", image_url: { url: args.imageUrl, detail: "low" } },
            {
              type: "text",
              text: args.headline
                ? `Headline: ${args.headline}\nScore still quality and gentle 16:9 focus.`
                : "Score still quality and gentle 16:9 focus.",
            },
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

  return coerceMediaPresentation(
    {
      mediaStyle: "overlay",
      thumbFocusX: parsed?.thumbFocusX,
      thumbFocusY: parsed?.thumbFocusY,
      stillQuality: parsed?.stillQuality,
      mediaNote: typeof parsed?.mediaNote === "string" ? parsed.mediaNote : undefined,
    },
    { allowNonOverlay: false }
  );
}

/**
 * Read presentation from post data.
 * Forward path is always-image (overlay + YT still or `/generated/`).
 * Explicit `mediaStyle: text` remains residual for archive posts not yet
 * backfilled with owned art — do not re-show a failed YT still as photo.
 */
export function mediaFromPostData(d: {
  mediaStyle?: string | null;
  thumbFocusX?: number | null;
  thumbFocusY?: number | null;
  stillQuality?: string | null;
  mediaNote?: string | null;
  thumbnail?: string | null;
}): MediaPresentation {
  const hasThumb = !!(d.thumbnail && String(d.thumbnail).trim());
  const style = normalizeMediaStyle(d.mediaStyle);
  const quality = normalizeStillQuality(d.stillQuality);
  // Owned art always displays even if an old post was marked text.
  const owned =
    hasThumb &&
    (String(d.thumbnail).startsWith("/generated/") ||
      /\/generated\/[\w.-]+\.(?:png|jpe?g|webp)$/i.test(String(d.thumbnail)));
  if (owned) {
    const focus = safeFocus(d.thumbFocusX, d.thumbFocusY);
    return {
      mediaStyle: "overlay",
      thumbFocusX: focus.thumbFocusX,
      thumbFocusY: focus.thumbFocusY,
      stillQuality: quality,
      mediaNote: d.mediaNote ?? undefined,
    };
  }
  // Explicit text or no usable still → no art (archive residual).
  if (!hasThumb || style === "text") {
    return {
      mediaStyle: "text",
      thumbFocusX: 50,
      thumbFocusY: 50,
      stillQuality: quality ?? (!hasThumb ? "fail" : undefined),
      mediaNote: d.mediaNote ?? undefined,
    };
  }
  const focus = safeFocus(d.thumbFocusX, d.thumbFocusY);
  return {
    mediaStyle: "overlay",
    thumbFocusX: focus.thumbFocusX,
    thumbFocusY: focus.thumbFocusY,
    stillQuality: quality,
    mediaNote: d.mediaNote ?? undefined,
  };
}
