/**
 * Desk auto-publish: agent drafts go live without waiting for queue approval.
 *
 * Default on in production, off on staging (staging must not commit to main).
 * Override with AUTO_APPROVE_DRAFTS=true|false.
 */
export function autoApproveEnabled(env: {
  AUTO_APPROVE_DRAFTS?: string;
  ENVIRONMENT?: string;
}): boolean {
  const raw = String(env.AUTO_APPROVE_DRAFTS ?? "")
    .trim()
    .toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  return env.ENVIRONMENT === "production";
}
