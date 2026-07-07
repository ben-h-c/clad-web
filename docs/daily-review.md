# Clad Daily Review — audience charter

This document directs the scheduled **Clad Daily Review**. Read it in full
before auditing the site; every review must include the audience pass
described below, alongside the usual correctness/SEO/credibility sweep.

## The mission

Make Clad the go-to news source for **high-school and college aged readers
(roughly 16–24)** — people becoming adults, voting for the first time, and
paying attention to politics and the news for the first time. They didn't
grow up with a paper on the doorstep; they grew up with feeds. Clad's pitch
to them: *don't just see the news — see how much to trust it.*

The foundation does not move: **a newsroom for the news, grading accuracy
and bias, easy to use.** The broadsheet identity, the restrained tone, and
the editorial standards stay. Meeting young readers where they are must never
mean chasing them with clickbait, slang, or outrage mechanics — they can
smell that instantly, and it would corrode the credibility the grades depend
on.

## The audience pass (every review)

1. **Research first.** Do a short web-research sweep of current findings on
   how 16–24-year-olds consume news: platforms (TikTok, YouTube, Instagram,
   Reddit, Discord), formats (short-form video, creator-mediated news,
   screenshots of headlines), attitudes (institutional distrust, demand for
   transparency about process and bias, fatigue with doomscrolling), and
   habits (mobile-only, discovery via share rather than homepage visits).
   Anchor on reputable sources (Pew, Reuters Institute Digital News Report,
   Knight Foundation) over marketing blogs, and note what changed since the
   last review.

2. **Audit Clad against what you found.** Standing questions:
   - **Mobile first**: is every new surface fast and comfortable on a phone?
     Most of this audience will never see the desktop layout.
   - **Scannability**: the grade IS the hook. Can a first-time visitor grasp
     "this outlet got a C− and leans right" in under five seconds on every
     surface? Are explainers ("what does the grade mean?", "how do you
     measure lean?") one tap away for someone who's never read a fact-check?
   - **Shareability**: sharing is the growth loop. Links unfurl with the
     grade card; the ShareBar covers text/X/Facebook/Bluesky/Reddit/email/
     TikTok (caption-copy flow) plus a downloadable grade-card image for
     stories and videos. Keep asking: what's the friction between "this is
     wild" and it appearing in a group chat or a story?
   - **First-time-voter context**: young readers are new to civics. Where a
     report assumes knowledge (what the filibuster is, what an executive
     order does), is there a plain-language path to context without
     condescension?
   - **Tone check**: copy should be clear, direct, and respectful of a smart
     18-year-old. No jargon walls, no "fellow kids" voice, no talking down.
   - **Trust surfaces**: this audience distrusts black boxes. Is the
     methodology (how grading works, revision/flag flow, corrections) easy to
     find and honest? Reader flags and reactions are trust features — treat
     them as first-class.
   - **Distribution**: does the site support being *quoted elsewhere* —
     clean OG cards, embeds, screenshots that carry attribution? Discovery
     happens off-site; every shared artifact should sell the destination.

3. **Ship incrementally.** Each review lands at most a few focused,
   verifiable improvements (UI, copy, or feature) as a PR — not a redesign.
   Additive changes over rewrites. Anything that alters monetization (e.g. a
   student discount, metered grades) is a decision for the owner: propose it
   in the PR description, don't implement it unilaterally.

## Constraints (re-read every time)

- Premium gating is inviolable: grades/factuality/lean/rationales/sentiment
  never reach anonymous or free-tier HTML/JSON outside the marked daily
  sample. `node scripts/checkAnonLeak.mjs` must pass.
- `/api/posts.json` stays byte-compatible for the iOS app (additive only).
- The newspaper look is the brand, not a legacy to strip away. Youth-focused
  ≠ dumbed down: the 1920s-broadsheet-meets-report-card aesthetic is
  distinctive and screenshots well — lean into it.
- Verify every change with `npm run build` and the anon-leak check before
  pushing; note anything deferred and why in the PR body.

## Standing backlog seeds (validate against research before building)

- Grade-card image variants sized for vertical formats (TikTok/IG stories,
  9:16) in addition to the landscape OG card.
- A "new to the news?" explainer hub linking the how-it-works page, grading
  rubric, and lean methodology in plain language.
- Embeddable grade badges for citing a Clad grade in a blog/video description.
- Student-focused landing page ("bring Clad to your civics class") — copy
  only; pricing changes need the owner.
- Surface the social-sentiment metric in shared artifacts (it's native
  vocabulary for this audience: "the internet hated this story, but it
  graded an A−").
