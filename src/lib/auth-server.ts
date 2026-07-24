import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { env } from "cloudflare:workers";
import { EMAIL, emailShell, escHtml } from "./emailTheme.ts";

const SITE = "https://cladfacts.com";

/** Redact email for Worker logs (privacy — B7). */
function emailLogTag(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return "(none)";
  const [local, domain] = e.split("@");
  const head = (local || "").slice(0, 2);
  return `${head}…@${domain || "?"}`;
}

// Transactional email via Resend (only used when RESEND_API_KEY is set).
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error("[auth-email] RESEND_API_KEY not set — cannot send:", subject, "to", emailLogTag(to));
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CladFacts <noreply@cladfacts.com>", to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Do not log raw recipient or response body (may echo the address).
    console.error(
      "[auth-email] Resend failed",
      res.status,
      "subject=",
      subject,
      "to=",
      emailLogTag(to),
      "bodyLen=",
      body.length
    );
    throw new Error(`Resend ${res.status}`);
  }
}

/** KV-backed secondary storage so Better Auth rate limits survive isolate restarts. */
function kvSecondaryStorage() {
  const kv = env.AGENTS;
  if (!kv) return undefined;
  const prefix = "ba:";
  return {
    get: async (key: string) => {
      try {
        return (await kv.get(prefix + key)) ?? null;
      } catch {
        return null;
      }
    },
    set: async (key: string, value: string, ttl?: number) => {
      try {
        const opts =
          typeof ttl === "number" && ttl > 0
            ? { expirationTtl: Math.max(60, Math.ceil(ttl)) }
            : undefined;
        await kv.put(prefix + key, value, opts);
      } catch {
        /* best-effort */
      }
    },
    delete: async (key: string) => {
      try {
        await kv.delete(prefix + key);
      } catch {
        /* best-effort */
      }
    },
  };
}

// TEMP: email this address whenever a new account is created. Remove the
// `databaseHooks` block below (and this constant) to turn the notifications off.
const NEW_USER_NOTIFY = env.ADMIN_NOTIFY_EMAIL || "benjaminharriscody@yahoo.com";

let cached: ReturnType<typeof betterAuth> | null = null;

// The CladFacts iOS app's bundle id — the audience of native Sign in with
// Apple id tokens. Public identifier; hard-coded so native Apple sign-in works
// deterministically without a separately-managed secret (env override allowed).
const APPLE_APP_BUNDLE_ID = "com.bencody.cladfacts";

/** Which social providers are offered. Google + Apple are always offered
 *  (the iOS app needs both; Apple is app-only — hidden on web via CSS since
 *  the web OAuth redirect flow would need a Services ID we don't configure). */
export function enabledSocialProviders(): string[] {
  const out: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) out.push("google");
  out.push("apple");
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
  // Native Sign in with Apple needs only the app bundle id as the id-token
  // audience — Better Auth verifies the token against Apple's public keys, no
  // Services ID or client secret (those are only for the web OAuth redirect
  // flow, which the app doesn't use). So always register apple for native.
  // If a Services ID + secret are ever set, they enable the web flow too.
  socialProviders.apple = {
    appBundleIdentifier: env.APPLE_APP_BUNDLE_ID || APPLE_APP_BUNDLE_ID,
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET }
      : {}),
  };
  if (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET)
    socialProviders.twitter = { clientId: env.TWITTER_CLIENT_ID, clientSecret: env.TWITTER_CLIENT_SECRET };

  const secondaryStorage = kvSecondaryStorage();

  cached = betterAuth({
    appName: "CladFacts",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || SITE,
    trustedOrigins: [SITE, "https://www.cladfacts.com"],
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
    // Durable rate-limit storage (Workers memory resets per isolate).
    ...(secondaryStorage ? { secondaryStorage } : {}),
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: secondaryStorage ? "secondary-storage" : "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/forget-password": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 8 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    session: {
      // Short cookie cache: fewer D1 session reads; revocation within ~60s.
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24, // refresh at most daily
    },
    user: {
      changeEmail: {
        enabled: true,
        // Send confirmation to current email when verified; new email gets verification link.
        sendChangeEmailConfirmation: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      // Verification requires Resend; until that's configured, allow sign-in so
      // accounts work, then flip this on once email is live.
      requireEmailVerification: hasEmail,
      // Standard email reset link (Better Auth builds token URL → callback page).
      resetPasswordTokenExpiresIn: 3600, // 1 hour
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const safeUrl = escHtml(url);
        const name = user.name ? escHtml(String(user.name).split(" ")[0] || "") : "";
        const greeting = name ? `Hi ${name},` : "Hi,";
        const html = emailShell({
          title: "Reset your password",
          subtitle: "CladFacts account",
          body:
            `<p style="margin:0 0 12px;font:400 15px/1.55 ${EMAIL.font};color:${EMAIL.body}">${greeting}</p>` +
            `<p style="margin:0 0 12px;font:400 15px/1.55 ${EMAIL.font};color:${EMAIL.body}">` +
            `We received a request to reset the password for <strong style="color:${EMAIL.ink}">${escHtml(user.email)}</strong>.` +
            `</p>` +
            `<p style="margin:0 0 12px;font:400 15px/1.55 ${EMAIL.font};color:${EMAIL.body}">` +
            `This link expires in <strong style="color:${EMAIL.ink}">one hour</strong>. If you didn’t ask for a reset, you can ignore this email — your password stays the same.` +
            `</p>` +
            `<p style="margin:16px 0 0;font:400 12px/1.45 ${EMAIL.font};color:${EMAIL.muted};word-break:break-all">` +
            `Or paste this link into your browser:<br><a href="${safeUrl}" style="color:${EMAIL.accent}">${safeUrl}</a>` +
            `</p>`,
          footerNote: "Transactional message from CladFacts — password reset only.",
          ctaHref: url,
          ctaLabel: "Choose a new password",
        });
        await sendEmail(user.email, "Reset your CladFacts password", html);
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
    // TEMP: notify the operator on every new signup (email + social). Remove
    // this whole `databaseHooks` block to stop. Failures never block signup.
    databaseHooks: {
      user: {
        create: {
          after: async (user: any) => {
            try {
              const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
              await sendEmail(
                NEW_USER_NOTIFY,
                `New CladFacts signup: ${user?.email ?? "(unknown)"}`,
                `<p><strong>New account created</strong></p>` +
                  `<ul>` +
                  `<li>Name: ${user?.name || "—"}</li>` +
                  `<li>Email: ${user?.email || "—"}</li>` +
                  `<li>Verified: ${user?.emailVerified ? "yes" : "no"}</li>` +
                  `<li>When: ${when}</li>` +
                  `</ul>` +
                  `<p><a href="${SITE}/admin/users/">View in admin</a></p>`
              );
            } catch {
              /* never block signup on a notification failure */
            }
          },
        },
      },
    },
  });
  return cached;
}
