// Public App Store listing for the CladFacts iOS app. Used by the sitewide
// footer badge and the homepage "Now on iOS" promo. The bare /app/id<n> form
// is canonical and redirects to the localized listing.
export const APP_STORE_URL = "https://apps.apple.com/app/id6781372681";

// Gate for every reader-facing App Store surface (the smart-banner meta tag,
// the footer badge, and the homepage promo). The 2026-07-11 daily review
// could not find a public listing for id6781372681 (20+ App Store and web
// searches; unrelated "Clad"-named apps index fine), so linking readers there
// today lands them on a dead store page. Default OFF. The moment the listing
// is publicly visible, set PUBLIC_APP_STORE_LIVE=true in the build
// environment (Workers Builds → Variables, and locally in .env) — or flip
// this expression to `true`.
export const APP_STORE_LIVE = import.meta.env.PUBLIC_APP_STORE_LIVE === "true";
