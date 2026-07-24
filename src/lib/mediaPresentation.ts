/**
 * Per-post still framing for strip cards.
 *
 * Layout policy (2026-07-24): cards use a fixed **16:9 photo band** + type
 * panel below — never portrait full-bleed cover of landscape YouTube stills
 * (that was the “random zoom”). Focus only nudges within the 16:9 band.
 *
 * Fields (optional):
 *   mediaStyle  — overlay/band (show photo) | text (no art)
 *   thumbFocusX / thumbFocusY — object-position in the 16:9 band
 *   mediaNote   — pipeline note (not shown)
 */
import { thumbnailUrl } from "./youtube.ts";

export const MEDIA_STYLES = ["overlay", "modular", "text"] as const;
export type MediaStyle = (typeof MEDIA_STYLES)[number];

export interface MediaPresentation {
  mediaStyle: MediaStyle;
  thumbFocusX: number;
  thumbFocusY: number;
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
  // modular is legacy — treat as overlay (16:9 band). text only when no art / override.
  if (style === "modular") style = "overlay";
  if (!opts?.allowNonOverlay && style === "text") style = "overlay";
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

export function objectPositionCss(p: Pick<MediaPresentation, "thumbFocusX" | "thumbFocusY">): string {
  const f = safeFocus(p.thumbFocusX, p.thumbFocusY);
  return `${f.thumbFocusX}% ${f.thumbFocusY}%`;
}

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
  // Default is already intentional for 16:9 band — vision is optional polish.
  if (!args.apiKey) return { ...DEFAULT_MEDIA, mediaNote: "default 16:9 framing" };

  try {
    const decided = await analyzeStillWithVision({
      apiKey: args.apiKey,
      imageUrl,
      headline: args.headline ?? "",
    });
    return { ...decided, mediaStyle: "overlay" };
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
  const system = `You frame a 16:9 news still inside a 16:9 photo band (no portrait zoom).
Pick a gentle object-position so the main subject is visible. Return ONLY JSON:
{"thumbFocusX":number,"thumbFocusY":number,"mediaNote":string}
Rules: prefer center; talking heads ~X 45-55 Y 35-45; avoid extreme edges; Y rarely below 25 or above 55.`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.1,
      max_tokens: 120,
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
                ? `Headline: ${args.headline}\nGentle 16:9 focus only.`
                : "Gentle 16:9 focus only.",
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

  return coerceMediaPresentation({
    mediaStyle: "overlay",
    thumbFocusX: parsed?.thumbFocusX,
    thumbFocusY: parsed?.thumbFocusY,
    mediaNote: typeof parsed?.mediaNote === "string" ? parsed.mediaNote : undefined,
  });
}

/** Read presentation from post data. Thumb → always show 16:9 band. */
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
  const focus = safeFocus(d.thumbFocusX, d.thumbFocusY);
  return {
    mediaStyle: "overlay",
    thumbFocusX: focus.thumbFocusX,
    thumbFocusY: focus.thumbFocusY,
    mediaNote: d.mediaNote ?? undefined,
  };
}
