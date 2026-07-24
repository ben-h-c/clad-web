/**
 * Per-post media presentation for home/app strip cards.
 *
 * YouTube stills vary wildly — talking heads, lower-thirds, split screens,
 * logo cards. A single CSS crop makes some tiles look zoomed on noise.
 * Presentation is decided at publish (approve / manual publish) by inspecting
 * the still, then stored on the post so each card frames itself.
 *
 * Fields (all optional; legacy posts fall back to overlay + center 28%):
 *   mediaStyle  — overlay | modular | text
 *   thumbFocusX / thumbFocusY — 0–100 object-position anchors
 *   mediaNote   — short pipeline rationale (not shown in UI)
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

export const DEFAULT_MEDIA: MediaPresentation = {
  mediaStyle: "overlay",
  thumbFocusX: 50,
  thumbFocusY: 28,
};

// Multimodal chat models (grok-4.5 / 4.3 accept image_url content parts).
const VISION_MODEL = "grok-4.5";

function clampPct(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function normalizeMediaStyle(v: unknown): MediaStyle | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return (MEDIA_STYLES as readonly string[]).includes(s) ? (s as MediaStyle) : undefined;
}

/** Merge partial frontmatter / API values onto safe defaults. */
export function coerceMediaPresentation(
  partial?: Partial<MediaPresentation> | null
): MediaPresentation {
  if (!partial) return { ...DEFAULT_MEDIA };
  return {
    mediaStyle: normalizeMediaStyle(partial.mediaStyle) ?? DEFAULT_MEDIA.mediaStyle,
    thumbFocusX: clampPct(partial.thumbFocusX, DEFAULT_MEDIA.thumbFocusX),
    thumbFocusY: clampPct(partial.thumbFocusY, DEFAULT_MEDIA.thumbFocusY),
    mediaNote:
      typeof partial.mediaNote === "string" && partial.mediaNote.trim()
        ? partial.mediaNote.trim().slice(0, 200)
        : undefined,
  };
}

/** CSS `object-position` from stored focus percentages. */
export function objectPositionCss(p: Pick<MediaPresentation, "thumbFocusX" | "thumbFocusY">): string {
  return `${clampPct(p.thumbFocusX, 50)}% ${clampPct(p.thumbFocusY, 28)}%`;
}

/**
 * Resolve presentation for a still. Uses vision when XAI key + image URL
 * are available; otherwise returns a conservative default.
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
    return decided;
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
You choose how ONE video still should appear as a mobile feed card.

Card layout context:
- Portrait-ish tile (~3:4 on phones), image fills the card, headline sits in the BOTTOM third over a dark scrim.
- object-fit: cover crops aggressively — the focus point is the only part that stays reliably visible.
- Bad crops zoom on tickers, lower-thirds, empty sky, network bugs, or the wrong half of a split screen.

Return ONLY JSON (no markdown) matching:
{
  "mediaStyle": "overlay" | "modular" | "text",
  "thumbFocusX": number,  // 0=left … 100=right; where the subject lives
  "thumbFocusY": number,  // 0=top … 100=bottom
  "mediaNote": string     // <= 120 chars, why
}

Style rules:
- "overlay" — strong photo subject (face, scene, event). Prefer this when the image will look good with bottom text.
- "modular" — still is usable as a small top thumb but BAD for full-bleed overlay: dense chyron/text, messy multi-panel, heavy graphics that fight overlaid type, or subject only works in a 16:9 letterbox.
- "text" — still is useless or confusing as art: black frame, pure logo card, pure text slide, extreme blur, or content that would mislead about the story.

Focus rules:
- Anchor on the primary human face or main action, not logos/tickers.
- For talking heads, prefer ~40–55 X and ~18–35 Y (face upper-center).
- Avoid putting focus on the bottom 35% (that area is covered by the text scrim on overlay cards).
- If split-screen, pick the half that matches the headline's main subject.`;

  const userText = args.headline
    ? `Headline for this report: ${args.headline}\nPick presentation + focus for the attached still.`
    : "Pick presentation + focus for the attached still.";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.15,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: args.imageUrl, detail: "high" },
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
    mediaStyle: parsed?.mediaStyle,
    thumbFocusX: parsed?.thumbFocusX,
    thumbFocusY: parsed?.thumbFocusY,
    mediaNote: typeof parsed?.mediaNote === "string" ? parsed.mediaNote : undefined,
  });
}

/** Read presentation fields from post frontmatter / content data. */
export function mediaFromPostData(d: {
  mediaStyle?: string | null;
  thumbFocusX?: number | null;
  thumbFocusY?: number | null;
  mediaNote?: string | null;
  thumbnail?: string | null;
}): MediaPresentation {
  // Explicit text style wins even without a thumb.
  const style = normalizeMediaStyle(d.mediaStyle);
  if (style === "text") {
    return coerceMediaPresentation({
      mediaStyle: "text",
      thumbFocusX: d.thumbFocusX ?? 50,
      thumbFocusY: d.thumbFocusY ?? 50,
      mediaNote: d.mediaNote ?? undefined,
    });
  }
  // Partial fields from newer posts; legacy → defaults.
  if (
    style != null ||
    typeof d.thumbFocusX === "number" ||
    typeof d.thumbFocusY === "number"
  ) {
    return coerceMediaPresentation({
      mediaStyle: style,
      thumbFocusX: d.thumbFocusX ?? undefined,
      thumbFocusY: d.thumbFocusY ?? undefined,
      mediaNote: d.mediaNote ?? undefined,
    });
  }
  return { ...DEFAULT_MEDIA };
}
