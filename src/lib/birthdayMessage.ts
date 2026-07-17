/**
 * Grok-written private birthday notes for the signed-in user's calendar.
 * Cached on user prefs for the calendar year so we only call once per birthday.
 */
import { env } from "cloudflare:workers";
import { setPrefs, type UserPrefs } from "./user-data.ts";
import { isBirthdayToday, todayIsoNy } from "./calendarEvents.ts";

const FALLBACK =
  "Happy birthday from the CladFacts desk — only you can see this. May your sources be solid, your takes well-sourced, and your cake fully verified.";

/**
 * Return a fun birthday message for this user if today is their birthday.
 * Generates via Grok once per year and caches on prefs.
 */
export async function resolveBirthdayMessage(opts: {
  userId: string;
  name?: string | null;
  prefs: UserPrefs;
}): Promise<string | null> {
  const { userId, name, prefs } = opts;
  if (!prefs.birthday || !isBirthdayToday(prefs.birthday)) return null;

  const year = Number(todayIsoNy().slice(0, 4));
  if (
    prefs.birthdayMessage &&
    prefs.birthdayMessageYear === year &&
    prefs.birthdayMessage.trim()
  ) {
    return prefs.birthdayMessage.trim().slice(0, 600);
  }

  let message = FALLBACK;
  try {
    if (env.XAI_API_KEY) {
      message = await generateBirthdayMessage(env.XAI_API_KEY, {
        name: name || "friend",
        ageHint: ageToday(prefs.birthday),
      });
    }
  } catch (err) {
    console.error("birthday message generate failed", err);
    message = FALLBACK;
  }

  try {
    await setPrefs(userId, {
      ...prefs,
      birthdayMessage: message,
      birthdayMessageYear: year,
    });
  } catch (err) {
    console.error("birthday message cache failed", err);
  }

  return message;
}

function ageToday(birthday: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const [ys, ms, ds] = birthday.split("-").map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - ys!;
  const had =
    now.getUTCMonth() > ms! - 1 ||
    (now.getUTCMonth() === ms! - 1 && now.getUTCDate() >= ds!);
  if (!had) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

async function generateBirthdayMessage(
  apiKey: string,
  input: { name: string; ageHint: number | null }
): Promise<string> {
  const first = input.name.trim().split(/\s+/)[0] || "friend";
  const ageLine =
    input.ageHint != null
      ? `They're turning about ${input.ageHint} (don't lead with the number unless it's fun).`
      : "Don't invent an age.";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4",
      temperature: 0.95,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You write short, witty private birthday notes for CladFacts readers " +
            "(a fact-checking news desk). One or two short paragraphs max, under 90 words. " +
            "Tone: warm, clever, lightly irreverent — like a sharp friend at a newsroom. " +
            "OK to riff on facts, bias, headlines, cake, candles, scoops — keep it kind. " +
            "No markdown, no hashtags, no URLs, no emojis overload (0–2 max). " +
            "Address them by first name once. Do NOT mention that only they can see it. " +
            "Return ONLY the message text.",
        },
        {
          role: "user",
          content:
            `Write a happy birthday message for ${first}. ${ageLine} ` +
            "Make it entertaining and personal to a news/fact-check nerd.",
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text || text.length < 12) throw new Error("empty birthday message");
  // Strip accidental quotes/fences
  return text
    .replace(/^```[\s\S]*?```$/g, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 600);
}
