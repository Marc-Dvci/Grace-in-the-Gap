# Grace in the Gap

> A five-second Scripture micro-presence inside the wait states developers already experience.

Grace in the Gap is a Claude Code plugin inspired by the product insight behind Andrew McCalip's **Kickbacks**: AI latency is a real, highly visible product surface. Kickbacks fills that pause with advertising. Grace uses it for an optional breath, a short pre-authored reflection, and a verse of Scripture — then hands you straight back to your finished work.

Every card is **live**: the [Gloo AI Studio API](https://studio.ai.gloo.com) chooses which approved moment fits the wait, and the [YouVersion Platform API](https://developers.youversion.com) resolves the Scripture text and its required copyright attribution. There is no simulated or offline-only mode; the plugin needs real credentials (both APIs are free for challenge participants).

## Setup (about 5 minutes)

**1. Get the two free API keys**

- **Gloo AI Studio** → sign in, open *API Credentials*, create a Client ID + Client Secret.
- **YouVersion Platform** → register an app, copy its App Key.

**2. Build and run one live moment**

```powershell
cd grace-in-the-gap
npm ci
npm run build

# put the three values in a local .env (auto-loaded by the CLI)
copy .env.example .env    # then edit .env

node dist/cli.js moment debugging
```

You should see a bordered card labelled `GLOO + YOUVERSION` with a live verse, its reference/version, the copyright line, and the privacy note. `node dist/cli.js status` shows which credentials are configured (never the secrets themselves).

> No `.env`? Every value is also read from environment variables — see [`.env.example`](./.env.example).

## Run it inside Claude Code

```powershell
npm run build
claude --plugin-dir .
```

Enable the plugin and enter your Gloo and YouVersion values in its configuration dialog (Claude Code keeps them in secure storage). Then submit a real task such as *"Debug the failing integration tests across this repository."*

- An asynchronous `UserPromptSubmit` hook runs **without delaying Claude** — work starts immediately. Claude Code delivers the hook's full card on the next conversation turn.
- The official spinner tip (below) is what shows *during* the active wait.
- Defaults keep it gentle: six cards per day, ten-minute cooldown, eight-second minimum wait.

Plugin skills:

- `/grace-in-the-gap:moment` — request a moment explicitly.
- `/grace-in-the-gap:privacy` — inspect provider, credential, and privacy status.
- `/grace-in-the-gap:configure` — change local preferences after confirmation.

### Spinner tips in the real wait surface

```powershell
node dist/cli.js spinner preview          # show the settings patch
node dist/cli.js spinner install --apply  # install static tips (+ settings backup)
node dist/cli.js spinner sync --apply      # select one live, attributed tip and install it
```

`spinner install` writes pre-authored reflection + reference tips into Claude Code's official `spinnerTipsOverride`. `spinner sync` runs one live Gloo + YouVersion selection and installs that single attributed tip. Both merge (never overwrite) unrelated settings and create a timestamped backup of `~/.claude/settings.json`. The full Bible text is rendered only in the queued card, where complete attribution fits.

### Local marketplace install

From the repository root:

```text
/plugin marketplace add .
/plugin install grace-in-the-gap@grace-in-the-gap-marketplace
/plugin enable grace-in-the-gap@grace-in-the-gap-marketplace
```

The checked-in `dist/` bundles are intentional: marketplace installs copy only the plugin directory and do not run `npm install`.

## How a card is built

```text
wait event ──▶ Gloo structured selector ──▶ catalog validation ──▶ YouVersion passage + attribution ──▶ card
(coarse labels only)   (approved IDs only)   (exact cross-check)     (live text + copyright)
```

Gloo is a **structured decision layer, not a devotional writer.** It receives only privacy-minimized labels (e.g. `debugging`, `8–15s`, `evening`) and must return approved profile / reflection / passage IDs as strict JSON. The service rejects anything that is not an exact catalog match. The visible reflection always comes from the pre-authored, review-gated catalog; the verse always comes from YouVersion. No model-generated spiritual prose ever reaches the user.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for trust boundaries and failure behavior, and [`docs/SETUP.md`](./docs/SETUP.md) for the credentialed first-run checklist.

## Privacy

- **Raw prompts are never stored or transmitted.** The hook derives a coarse task label on device (or nothing at all in `private` mode), then discards the prompt.
- Gloo receives only coarse labels; YouVersion receives only a Bible version ID, a USFM reference, and a locale.
- Telemetry is off by default and its schema cannot contain code, prompts, passage text, email, or file paths.
- A strict allow-list boundary rejects any raw `prompt` field at the API layer.

## Resilience

If Gloo returns an invalid or low-confidence choice, Grace falls back to a **deterministic on-device selection over the same approved catalog** — Scripture is still fetched live from YouVersion. If YouVersion itself is unreachable, Grace renders a **bundled public-domain (World English Bible) verse**, clearly labelled `OFFLINE FALLBACK · PUBLIC DOMAIN`. Both paths are real Scripture with real attribution; neither is fabricated.

## Quality gates

```powershell
npm run check
npm audit --omit=dev
```

`check` runs strict TypeScript, the unit/contract/integration suite, a 108-scenario selector evaluation, a clean bundled build, and built-artifact hook/MCP smoke tests against contract-faithful HTTP doubles (used only in tests, never in the product).

## Project map

```text
.claude-plugin/       Claude plugin manifest and secure userConfig
hooks/                Async Claude lifecycle hook declaration
skills/               Namespaced moment/privacy/configure skills
.mcp.json             Bundled stdio MCP server declaration
content/              Versioned editorial catalog + public-domain fallback verses
src/providers/        Gloo + YouVersion live adapters and offline fallback
src/service/          Validated selection and degradation pipeline
tests/                Unit, contract, API, hook, and MCP tests (+ contract doubles)
docs/                 Architecture, setup, and contest audit
notebooks/            Executed Kaggle technical-verification notebook
dist/                 Self-contained marketplace runtime bundles
```

## Current limits

- English-only demo catalog; localization is deliberately gated behind editorial review.
- The eight micro-reflections are conservative demo copy, not a substitute for formal theology/editorial sign-off — a release blocker for public launch.
- YouVersion highlights/OAuth are out of the MVP: they require an explicit browser consent flow and do not strengthen the core wait-state experience.
