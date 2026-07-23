# Grace in the Gap

> A five-second Scripture micro-presence inside the wait states developers already experience.

Grace in the Gap is a Claude Code plugin inspired by the product insight behind Andrew McCalip's **Kickbacks**: AI latency is a real product surface. Grace uses that pause for an optional breath, a short pre-authored reflection, and an attributed passage of Scripture—then hands the developer back to the finished work.

The current selector understands more than a single task keyword. It combines:

- multi-label task context such as debugging + testing;
- workflow stage and outcome (starting, stuck, retrying, recovering, completed);
- local session effort, repetition, and previously shown content;
- civil time in the user's IANA timezone;
- a tradition-filtered church calendar, movable feasts, seasons, and curated feast passage anchors;
- preferred tone and local 1–5 feedback.

Gloo makes a required, schema-constrained tool choice among curated IDs. YouVersion resolves the chosen USFM passage in a Bible matching the user's locale and supplies required version/copyright metadata. Visible reflections are always project-owned catalog copy; model-authored devotional prose is never rendered.

## Quick start

Requirements: Node.js 20.12 or newer, a Gloo client ID/secret, and a YouVersion App Key.

```powershell
cd grace-in-the-gap
npm ci
copy .env.example .env
# Fill the three credential fields in the ignored .env file.
npm run check
npm run build
node dist/cli.js moment debugging
```

The card header states its exact provenance:

- `GLOO + YOUVERSION`: both live providers succeeded;
- `LOCAL SELECTOR + YOUVERSION`: Gloo degraded, Scripture remained live;
- `GLOO + PUBLIC DOMAIN`: live selection with bundled emergency Scripture;
- `LOCAL + PUBLIC DOMAIN`: both controlled fallbacks were used.

Run `node dist/cli.js status` to inspect non-secret configuration. Run `npm run canary:live` for a sanitized provider test that outputs IDs and attribution booleans but no credentials or verse text.

See [docs/SETUP.md](./docs/SETUP.md) for the full first-run checklist.

## Run inside Claude Code

```powershell
npm run build
claude --plugin-dir .
```

Enable the plugin and enter the sensitive Gloo and YouVersion values in its configuration. Then submit a task such as “Debug the failing integration tests across this repository.”

Grace uses two complementary Claude Code surfaces:

- Claude Code's official spinner override is static. `spinner sync` can install a provider-selected, attributed tip before a session.
- The official asynchronous `UserPromptSubmit` hook starts without delaying Claude. Its richer, context-selected card is queued for the next conversation turn; the project does not claim that this dynamic card replaces the active spinner mid-turn.

```powershell
node dist/cli.js spinner preview
node dist/cli.js spinner install --apply
node dist/cli.js spinner sync --apply
```

Installation merges unrelated settings and creates a timestamped backup of `~/.claude/settings.json`.

The plugin also exposes four MCP tools:

- `grace_moment`: request an attributed moment with an optional coarse task label;
- `grace_feedback`: rate a card by its short Feedback ID;
- `grace_status`: inspect providers and privacy controls;
- `configure_grace`: update explicit local preferences.

CLI feedback uses the same private store:

```powershell
node dist/cli.js feedback <feedback-id> 1
node dist/cli.js feedback <feedback-id> 5
```

Ratings store only approved profile/passage/snippet IDs, a trace ID, and the number. Low-rated choices are de-prioritized; high-rated profiles receive a modest boost. The selector can never leave the approved catalog.

## Selection pipeline

```text
prompt in process memory
        │
        ▼
local allow-listed context ──► calendar + session + feedback
        │
        ▼
eligible approved catalog ──► Gloo required tool call
        │                         │
        │                  malformed/low confidence
        │                         ▼
        └────────────────► deterministic local ranker
                                  │
                                  ▼
                  relational catalog validation
                                  │
                                  ▼
                locale-matched YouVersion passage
                                  │
                          unavailable/unattributed
                                  ▼
                 labelled public-domain fallback
```

Gloo receives structured context only. Its output must pass both a strict schema and a relational check: profile, snippet, passage, and tone must be one internally consistent eligible combination. Displayed “Why this moment” labels are re-derived from validated local facts rather than trusted from the model.

## Privacy and user control

- Raw prompts are never stored or transmitted.
- `local-labels` derives coarse task/workflow labels on device and discards the prompt. `private` ignores prompt content entirely.
- Session IDs are installation-salted HMACs. Local history contains approved IDs, not prompt or passage text.
- Gloo receives only allow-listed labels, calendar fields, and approved IDs.
- YouVersion receives only a Bible version ID, USFM reference, and locale.
- Telemetry is off by default. Its strict schema cannot hold prompts, code, Scripture text, email, or file paths.
- Automatic cards have an enable switch, minimum wait, cooldown, daily cap, and history limit.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for trust and failure boundaries.

## Editorial content

The current catalog contains 15 context profiles, 30 project-owned reflections in both English and French (60 localized entries), and 62 curated passage hints. Only a small attributed World English Bible set is bundled for emergencies; normal text comes from YouVersion.

Calendar matching covers major fixed and movable observances, Advent, Lent/Holy Week, and Easter. Tradition-specific commemorations are excluded unless the user selects the corresponding tradition. Passage anchors are conservative excerpts for contextual selection, not a claim to implement a complete official denominational lectionary.

The catalog is versioned, bilingual, and relationally validated so every visible reflection, passage, tone, and explanation remains internally consistent.

## Quality gates

```powershell
npm run check
npm run test:coverage
npm audit --omit=dev
npm run notebook:build
```

`check` runs strict TypeScript, unit/contract/integration tests, the offline contest evaluation, a clean bundled build, and built-artifact smoke tests. The evaluation covers:

- 108 task/time/duration contexts with full catalog/schema validation;
- eight editorial golden scenarios for retry, completion, feasts, seasons, late work, and tone;
- a 24-turn local-history simulation with an immediate-repeat threshold of zero.

The executed Kaggle notebook at [notebooks/grace_in_the_gap_demo.ipynb](./notebooks/grace_in_the_gap_demo.ipynb) is regenerated from the current catalog and evaluation. When private keys are present during execution, it saves a sanitized live-provider summary—not the keys or live verse text.

## Project map

```text
.claude-plugin/       Claude plugin manifest and sensitive user configuration
hooks/                Official asynchronous lifecycle hook declaration
skills/               Namespaced moment/privacy/configure skills
.mcp.json             Bundled stdio MCP server declaration
content/              Versioned bilingual catalog + emergency public-domain text
src/calendar/         Timezone-aware church calendar
src/providers/        Gloo, YouVersion, retry, and continuity adapters
src/selection/        Contextual deterministic ranker and explanations
src/service/          Relational validation and degradation pipeline
tests/                Unit, relevance, contract, API, hook, and MCP tests
scripts/              Build, smoke, live canary, and notebook generation
docs/                 Architecture and setup
dist/                 Self-contained marketplace runtime bundles
```

## Where Grace can go next

The same contextual engine can support additional calendar packs, languages, AI agents, and long-running creative tools. Optional YouVersion identity flows can extend a five-second moment into highlights and saved reading, while aggregate opt-in feedback can measure which contexts create the most meaningful pauses.
