// Public App Store listing for the CladFacts iOS app. Used by the sitewide
// footer badge and the homepage "Now on iOS" promo. The bare /app/id<n> form
// is canonical and redirects to the localized listing.
export const APP_STORE_URL = "https://apps.apple.com/app/id6781372681";

// Gate for every reader-facing App Store surface (the smart-banner meta tag,
// the footer badge, and the homepage promo). Listing id6781372681 is public
// as of 2026-07-14 (https://apps.apple.com/us/app/cladfacts/id6781372681).
// Default ON. Set PUBLIC_APP_STORE_LIVE=false in the build environment to
// kill-switch every reader-facing App Store surface without a code change.
export const APP_STORE_LIVE = import.meta.env.PUBLIC_APP_STORE_LIVE !== "false";
