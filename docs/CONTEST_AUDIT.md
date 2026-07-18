# Contest audit

## Executive verdict

The concept is contest-strong and has a credible working spine. Its clearest
differentiator is not "Scripture in an IDE"; it is Scripture occupying the same
native wait-state surface that Kickbacks demonstrated can become a high-attention
product category. The product is intentionally calmer, private, noncommercial, and
user-controlled.

Grace is **live-only**: every card is produced by a real Gloo selection and a real
YouVersion passage fetch. There is no simulated mode. The repository is ready for a
credentialed run and the Claude Code visual pass; the editorial/legal gates below
remain before any public launch claim.

## Evidence generated

| Gate | Current result |
|---|---|
| Strict TypeScript | Pass |
| Automated tests | 20/20 across 9 files |
| Selector evaluation | 108/108; 100% catalog-resolution compliance |
| Passage diversity | 8 unique passages; no daytime leakage from the late-evening profile |
| Contract doubles | Gloo OAuth + Responses and YouVersion passage + Bible-metadata over real local HTTP |
| API privacy boundary | Unknown/raw `prompt` field rejected |
| Claude hook subprocess | Pass; user-only message; raw prompt not echoed |
| MCP stdio integration | Pass; three tools advertised and callable |
| Built-artifact smoke | Pass for bundled hook and MCP server |
| Production dependency audit | 0 known vulnerabilities (`npm audit --omit=dev`) |

## Correctness note (live path)

The YouVersion passages endpoint returns only verse text and reference; it does
**not** return copyright. Required attribution is fetched separately from the Bible
resource (`GET /v1/bibles/{id}`) and composed into the card. Both YouVersion calls
run in parallel and the metadata is cached per version. The adapter refuses to
surface a passage without its copyright.

## Claim matrix

### Safe to claim now

- Every card is a live Gloo selection plus a live YouVersion passage.
- Raw prompts are not transmitted or stored by Grace.
- Gloo is constrained to structured ID selection; visible reflections are pre-authored.
- YouVersion attribution is mandatory at the adapter boundary.
- The plugin has interruption controls and telemetry is off by default.
- Resilience fallbacks (on-device selection; bundled public-domain verse) are real
  Scripture with real attribution and are labelled distinctly from live cards.

### Claim only after a credentialed recording

- Exact Gloo model/routing/citation behavior.
- Exact YouVersion version name, text, licensing, and availability for your app key.
- End-to-end latency inside Claude Code.

### Do not claim yet

- Theology approval, production readiness, multilingual support, user research,
  impact metrics, or YouVersion highlight integration.

## Rubric audit

### Impact & Vision — 40 points

Strengths: immediate human problem, newly validated wait-state surface, high-frequency
developer context, emotionally legible micro-interaction, and expansion path to other
agents. The strongest line: **"Kickbacks proved the wait state is inventory; Grace in
the Gap makes it sanctuary."** Use it lightly — the product should feel invitational.

Risks: the experience becomes intrusive or trivializes Scripture. Mitigations exist in
code: wait threshold, cooldown, cap, disable, private mode, five-second copy, no
fabricated personalization.

### Video Pitch — 30 points

Strengths: easy before/after story and a visually distinct terminal moment. Show the
human first, then proof. Do not lead with architecture.

Risks: a terminal-only demo can look small. Use close framing, a visible long task, a
clean card, and the continuation back into completed work. Keep API logs to a
five-second proof flash.

### Technical Depth — 30 points

Strengths: official async hook, official spinner settings, bundled MCP, OAuth token
cache, two Gloo endpoint modes, strict schema/catalog validation, mandatory attribution
gate, privacy-minimized event model, controlled degradation, and automated evaluation.

Risks: judges may see spinner tips as static decoration. Run `spinner sync --apply`
before the hero take, capture the provider trace, and distinguish the two surfaces: a
live API-selected attributed tip during the wait, then the richer contextual full card
on the next turn.

## High-priority blockers

1. **Credentialed run:** capture one live card against both APIs with the provider trace visible.
2. **Claude visual pass:** verify async `systemMessage` timing and styling on the exact recording version.
3. **Platform terms:** confirm structured selection with no model-authored user prose is acceptable.
4. **Editorial review:** qualified reviewer signs off on the eight reflections and verse-context choices.
5. **Public proof:** publish repository, Kaggle notebook, project link, cover, and ≤3-minute YouTube video.
6. **Localization claim:** ship one reviewed second locale or say "English MVP"; do not imply global readiness from API coverage alone.

## Technical risks and mitigations

| Risk | Severity | Existing mitigation | Remaining action |
|---|---|---|---|
| API contract drift | High | Strict parsing, contract doubles, fallback | Live canary and scheduled contract test |
| Async card arrives after task | Medium | Eligible only on estimated long waits | Measure real p50/p95 and tune threshold |
| Prompt privacy misunderstanding | High | Never stored/transmitted; private mode | Make local classification explicit in onboarding |
| Unattributed Scripture | High | Adapter fetches + requires copyright | Verify actual response shape/version |
| Hallucinated selection | High | Exact candidate cross-check | Inspect first 20 live traces |
| Repetition/annoyance | Medium | 8 profiles, cooldown, cap | Small user test and dismissal metric |
| Fallback mistaken for live | Medium | `live`/`degraded` provenance + distinct label | Keep the label visible in footage |
| Plugin supply chain | Medium | Official hooks/settings; bundled static runtime | Sign/tag releases and publish checksums |
