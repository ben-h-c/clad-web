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
  // `clientId` may be a string (web only) or an array whose index 0 drives the
  // web auth-code flow and whose remaining entries are additional accepted
  // id-token audiences — that's how Better Auth supports native iOS sign-in.
  const socialProviders: Record<string, Record<string, unknown>> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    // The CladFacts iOS app does native Google Sign-In; its id tokens are
    // audienced to the iOS OAuth client ID (NOT the web client ID), so the
    // server must accept it as an additional audience. The client ID is a
    // public identifier (it ships in the app bundle), so it's hard-coded here
    // — that keeps it deterministically in the deployed config rather than
    // depending on a separately-managed secret. Index 0 still drives the web
    // auth-code flow. Env override allowed for flexibility.
    const googleIosClientId =
      env.GOOGLE_IOS_CLIENT_ID ||
      "636876201929-188cd2rm456p4kslsg06ctadlaag2s7g.apps.googleusercontent.com";
    socialProviders.google = {
      clientId: [env.GOOGLE_CLIENT_ID, googleIosClientId],
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      // Native Sign in with Apple tokens are audienced to the app bundle id.
      ...(env.APPLE_APP_BUNDLE_ID ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_ID } : {}),
    };
  }
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
            // Land on a friendly confirmation page after the link is clicked.
            let link = url;
            try {
              const u = new URL(url);
              u.searchParams.set("callbackURL", "/verified/");
              link = u.toString();
            } catch {
              /* use url as-is */
            }
            await sendEmail(
              user.email,
              "Verify your CladFacts email",
              `<p>Welcome to CladFacts. Confirm your email to finish setting up your account:</p>` +
                `<p><a href="${link}">Verify my email</a></p>` +
                `<p>Or paste this link into your browser:<br>${link}</p>`
            );
          },
        }
      : undefined,
    socialProviders,
  });
  return cached;
}
