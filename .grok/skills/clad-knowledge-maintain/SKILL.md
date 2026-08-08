---
name: clad-knowledge-maintain
description: >
  Keep CladFacts agent knowledge fresh: update AGENTS.md, docs/design-system.md,
  docs/decisions.md, clad-* skills, and Grok Memory when durable preferences or
  decisions are learned. Use when the user states a lasting preference, after
  architectural decisions, after deploy/tooling incidents, after design-system
  changes, before ending multi-step Clad work, or when asked to "remember",
  "update skills", "learn this", "document that", or /clad-knowledge-maintain.
---

# Clad knowledge maintenance

You are responsible for making future agents smarter about CladFacts. Chat is ephemeral; **files are the brain**.

## Procedure (every time knowledge is learned)

1. **Classify** the lesson:
   - Design/taste → `docs/design-system.md` + `.grok/skills/clad-design/SKILL.md`
   - Product/architecture decision → `docs/decisions.md` (new entry at top)
   - Code/deploy convention → `.grok/skills/clad-web/SKILL.md`
   - Test/ship gate → `.grok/skills/clad-test/SKILL.md`
   - Prioritization / lead process → `.grok/skills/clad-product/SKILL.md`
   - Cross-project Ben preference → `~/.grok/memory/MEMORY.md` (## Preferences)

2. **Write the minimum durable statement**
   - Imperative, specific, dated if a decision.
   - Merge duplicates; delete contradictions.
   - No secrets, tokens, passwords, or PII.

3. **Cross-link**
   - If tokens changed, design-system.md and clad-design must match `global.css`.
   - If a pipeline changed, point to the source file path.

4. **Memory**
   - If Grok Memory is enabled, also persist a one-line preference via memory tools or by editing `~/.grok/memory/MEMORY.md`.

5. **Confirm briefly** to the user what was updated (paths only).

## When to run even if the user did not ask

- End of a task that fixed a recurring footgun (wrangler auth path, uncommitted deploy wipe, speech dictation, etc.).
- After approving a design direction that should stick.
- After App Store / production incident lessons.
- Before saying “done” on multi-hour platform work.

## Anti-patterns

- Do not dump entire chat transcripts into skills.
- Do not create a new skill per tiny preference — fold into existing clad-* skills.
- Do not skip commits for knowledge that must survive machines — prefer committing docs/skills with the feature.

## Checklist

- [ ] Right file(s) updated
- [ ] No secrets
- [ ] Stale bullets removed
- [ ] User told what changed
