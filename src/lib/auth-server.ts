import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { env } from "cloudflare:workers";

const SITE = "https://cladfacts.com";

// Transactional email via Resend (only used when RESEND_API_KEY is set).
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CladFacts <noreply@cladfacts.com>", to, subject, html }),
  });
}

let cached: ReturnType<typeof betterAuth> | null = null;

/** Which social providers are configured (so the UI only shows live buttons). */
export function enabledSocialProviders(): string[] {
  const out: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) out.push("google");
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) out.push("apple");
  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET) out.push("twitter");
  return out;
}

export function getAuth() {
  if (cached) return cached;

  const hasEmail = !!env.RESEND_API_KEY;
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET)
    socialProviders.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET };
  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET)
    socialProviders.twitter = { clientId: env.TWITTER_CLIENT_ID, clientSecret: env.TWITTER_CLIENT_SECRET };

  cached = betterAuth({
    appName: "CladFacts",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || SITE,
    trustedOrigins: [SITE, "https://www.cladfacts.com"],
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
    emailAndPassword: {
      enabled: true,
      // Verification requires Resend; until that's configured, allow sign-in so
      // accounts work, then flip this on once email is live.
      requireEmailVerification: hasEmail,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          user.email,
          "Reset your CladFacts password",
          `<p>Click to reset your password:</p><p><a href="${url}">${url}</a></p>`
        );
      },
    },
    emailVerification: hasEmail
      ? {
          sendOnSignUp: true,
          sendVerificationEmail: async ({ user, url }) => {
            await sendEmail(
              user.email,
              "Verify your CladFacts email",
              `<p>Welcome to CladFacts. Confirm your email:</p><p><a href="${url}">${url}</a></p>`
            );
          },
        }
      : undefined,
    socialProviders,
  });
  return cached;
}
