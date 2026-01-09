ROLE: Senior spec-compression engineer for LLM agent contracts.

TASK: Thin down AGENTS.md so weaker/cheaper models actually obey it. Optimize for compliance probability, not readability.

TARGET FILE:
- AGENTS.md (this is the ONLY source of truth) (frontend)

NON-NEGOTIABLE GOAL:
- Produce a shorter AGENTS.md that preserves ALL enforcement-critical constraints.
- Any removal or merge must be proven semantically safe.

HARD RULES:
1) Treat frontend/AGENTS.md as a machine-consumed spec, not documentation.
2) Do NOT invent new rules.
3) Do NOT weaken constraints.
4) Do NOT paraphrase prohibitions unless strictly equivalent.
5) Redundancy is allowed only if it increases obedience.
6) Optimize for “will a weaker model follow this without drifting?”

PROCESS (mandatory):
A) Read frontend/AGENTS.md in full.
B) Classify every rule:
   - HARD-CONSTRAINT
   - IMPORTANT
   - CONTEXT
   - REDUNDANT
   - LOW-VALUE
C) Identify compliance killers (length, repetition, mixed priorities, soft language).
D) Rewrite into this exact structure:
   1. HARD CONSTRAINTS (≤15 bullets)
   2. FORBIDDEN / ALLOWED ACTIONS (binary, explicit)
   3. ARCHITECTURE INVARIANTS (paths, no-touch zones)
   4. WORKFLOW (minimal, stepwise)
   5. STYLE / PREFERENCES (only if needed)
E) Aggressively delete or compress CONTEXT and LOW-VALUE sections.
F) Target ≤40% of original length unless impossible.

OUTPUT (strict):
1) NEW frontend/AGENTS.md (ready to commit).
2) CHANGELOG:
   - Removed (why safe, what rule replaces it)
   - Merged (old → new, prove equivalence)
   - Clarified (ambiguity removed)
3) RISK LIST:
   - Any behavioral change risk + mitigation.

QUALITY BAR:
- Every rule must be short, binary, enforceable.
- No motivational text.
- No “consider / try / ideally”.
- Use MUST / MUST NOT / ONLY / NEVER.


