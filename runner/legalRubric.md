# CladFacts legal-risk rubric

The compliance auditor ("Don't Get Sued") loads this file every run and audits
the WHOLE site against it — the privacy policy, terms of use, about page, the
site-wide disclaimer, AND the published reports — holistically, looking for
cross-document inconsistencies as well as per-item risk. This is automated
risk-spotting, NOT legal advice.

For every issue found: name the category below, cite the exact at-risk text and
where it appears (which page or post), explain the risk in 1–2 sentences, and
give a concrete minimal fix. Severity: **high** = likely actionable / real
exposure; **medium** = should be fixed; **low** = best-practice / hygiene. Do
not invent issues — only flag real, articulable risk.

When a report states a damaging factual claim about a real, identifiable person
or company, USE WEB SEARCH to check whether it is actually true before deciding
defamation risk: a true, well-sourced claim is far lower risk than an unverified
or false one.

## 1. Defamation / libel / slander
- False statements of **fact** (not opinion) about an identifiable living person
  or organization that harm reputation, asserted without attribution, sourcing,
  or hedging.
- **Defamation per se** (highest risk): accusing someone of a crime, fraud,
  professional misconduct, having a loathsome disease, or sexual impropriety.
- **Fact vs. opinion:** opinion and clearly-labeled analysis are protected.
  Ensure damaging assertions are framed as opinion, attributed ("according to
  X"), or softened to an allegation ("alleged", "reportedly").
- **Implied defamation:** a headline, thumbnail, juxtaposition, or grade
  rationale that implies a false damaging fact even if the body is careful.
- **Public vs. private figures:** public figures must show "actual malice," but
  still flag reckless or unverified damaging claims.

## 2. False light & privacy
- Publishing private facts about private (non-public) individuals.
- Personal identifying information (home address, phone, etc.) — doxxing.
- Framing that creates a false impression of a person even if literally true.

## 3. Right of publicity / misappropriation
- Using a person's name, likeness, or image to imply endorsement or for
  commercial gain without consent.

## 4. Copyright & fair use
- Verbatim reproduction of substantial copyrighted text or images beyond fair
  use. Short quotes for commentary/criticism are fair use; wholesale copying of
  transcripts, articles, or photos is not.
- Embedded/served thumbnails and video: confirm use is commentary/criticism,
  not mere republication.
- **Imagery licensing (live risk — see the incident log in
  docs/legal/image-claims.md: in July 2026 a wire-service photo inside a
  broadcaster's YouTube thumbnail, shown on a topic tile, drew a paid-license
  demand).** The site's imagery
  policy (docs/legal/image-claims.md, enforced by scripts/checkImageLicense.mjs
  and src/lib/postBuild.ts) allows exactly two kinds of post art: the YouTube
  CDN still of the post's OWN embedded video, hotlinked from img.youtube.com
  (never copied to or served from cladfacts.com), or site-owned generated art
  under /generated/. Every audit, verify and flag as **high**:
  - any image on any page served FROM cladfacts.com (or composed into an
    OG/share PNG we serve) whose underlying content is a third-party
    photograph — rehosting forfeits the hotlink/server-test posture;
  - any new surface, component, or agent that fetches, caches, proxies, or
    inlines external images (other than the established politician-portrait
    proxy, tracked separately below);
  - any post artwork that is not the post's own video still or /generated/ art.
  Video stills that plainly foreground recognizable wire-agency content
  (sports-championship, red-carpet, or news-agency-style photography) merit a
  **medium** advisory note naming the post, so the editor can preemptively swap
  in generated art — automated rights-agency crawlers match pixels and send
  demands regardless of the hotlink defense.
- **Wikimedia portraits (politician cards):** the same-origin proxy
  (/api/politician-photo/) serves Wikimedia COMMONS files only (free-licensed
  by Commons policy), and TASL attribution (author/source/license) is served at
  /politicians/photo-credits/, auto-populated from Commons extmetadata and
  linked from the politicians index and every politician page. Every audit,
  verify the credits page is reachable and populating (not all rows stuck on
  "pending"), and flag as **high**: any non-Commons or non-Wikimedia source in
  the portrait pipeline; the credits page missing, unlinked, or broken; or any
  new surface serving third-party portraits without a credit path.

## 5. Trademark
- Use of a brand/name that implies endorsement, sponsorship, or affiliation.

## 6. FTC / disclosure
- Undisclosed sponsorship, affiliate links, or paid placement.
- Disclosure that content (grades, summaries) is AI-assisted where that matters.
- Clear labeling of opinion/analysis vs. straight reporting.

## 7. Privacy policy — adequacy AND accuracy
- Must accurately describe ACTUAL data practices. Cross-check its claims against
  how the site really behaves: e.g. if it says "no third-party trackers" or "no
  analytics," verify nothing on the site contradicts that (embeds, external
  fonts/data fetches, beacons). Flag any claim the site cannot stand behind.
- Contact method present. Children's data (COPPA) addressed if minors may use
  it. Basic CCPA/GDPR posture if the audience includes those users.

## 8. Terms of use — adequacy
- Disclaimer of warranties, limitation of liability, governing law/venue,
  acceptable-use, IP ownership, DMCA/takedown contact, and an explicit "not
  legal/financial/professional advice" statement.

## 9. Disclaimers
- The site-wide disclaimer should cover: editorial opinion/commentary; fair-use
  basis for source material; that grades/verdicts assess evidence and reporting,
  not a person's character; paraphrase/transcription-error caveat; corrections
  policy; and "not legal or financial advice."
- The markets ticker shows financial data — confirm there is a "not investment
  advice / informational only" disclaimer covering it.

## 10. Cross-document consistency
- Posts' claims vs. the disclaimers (does the disclaimer actually cover what the
  posts do?).
- Privacy policy / terms claims vs. the site's real behavior and vs. each other.
- Grade and lean rationales must not assert unproven facts as settled truth.

## 11. Election / political content
- Heightened defamation risk around candidates and officials. Keep damaging
  claims evidence-based, sourced, and framed as analysis where appropriate.

## 12. Third-party / user-submitted content
- Reader-flag submissions are user content. Ensure the site never republishes a
  reader's defamatory statement as its own assertion of fact.

## 13. Accessibility (ADA)
- Best-practice only / low legal priority: note obvious gaps (e.g., images
  missing alt text) but do not over-weight.

## 14. Curation integrity — collection fit
- Good News (and any Discover-style curated collection): every item must
  plainly match its collection's stated title and blurb. Flag collections
  containing off-theme items (e.g. a Bitcoin-ETF or smart-glasses story in a
  space/rockets collection).
- Flag any non-positive item — somber, divisive, tragic, or grim — appearing
  on the Good News page at all.
- Severity: **low**/**medium** — reader-trust and editorial-integrity hygiene
  rather than direct legal exposure.
