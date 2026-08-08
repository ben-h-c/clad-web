# Continuous learning rule

On every multi-step CladFacts task:

1. Load `AGENTS.md` continuous learning section.
2. When the user teaches a lasting preference or a durable decision is made, **update knowledge in the same turn** via the `clad-knowledge-maintain` skill targets (`docs/*`, `.grok/skills/clad-*`, Grok Memory).
3. Do not end the task with “we should document that later.”
4. Prefer short bullets; keep design tokens in sync with `global.css`.
