# Setup and first live run

Grace needs Gloo and YouVersion credentials for its normal path. Controlled local/public-domain fallbacks preserve the experience during outages, but a fallback card is not proof of live integration.

## 1. Provision credentials

### Gloo

1. Create a Gloo organization and a client ID/secret.
2. Keep a low testing spend limit.
3. Start with V2 `tools` mode. It uses required function calling and needs no content publisher.
4. Use `grounded` only after publishing a Grace-owned metadata library. Never ingest YouVersion Bible text into Gloo.

### YouVersion

1. Register the application and copy its App Key.
2. Accept the relevant Bible licenses for the app.
3. Confirm each selected version's display and attribution requirements.

The configured default is Bible ID `3034` (BSB). At runtime Grace checks its language. If it does not match the requested locale, the adapter queries the app's licensed Bible collection and selects an attributed matching version.

## 2. Configure secrets

Plugin installation should use sensitive plugin configuration. For local CLI work, copy the ignored example:

```powershell
copy .env.example .env
```

Set only:

```text
GLOO_CLIENT_ID
GLOO_CLIENT_SECRET
YVP_APP_KEY
```

The CLI auto-loads `.env`. Never commit it, paste credentials into documentation/notebooks, or show it in a recording.

## 3. Run the quality and provider canaries

```powershell
npm ci
npm run check
npm run canary:live
npm run build
node dist/cli.js status
node dist/cli.js moment debugging
node dist/cli.js spinner sync
```

Pass criteria:

- all tests, evaluation thresholds, bundle generation, and smoke tests pass;
- the sanitized canary reports `gloo-tools`, `youversion-rest`, `copyrightPresent: true`, and `rawPromptTransmitted: false`;
- the card is labelled `GLOO + YOUVERSION`;
- passage text, human reference, version, and copyright are non-empty;
- provider requests contain no raw prompt, code, working directory, transcript, or session hash;
- spinner sync prints a dry-run patch unless `--apply` is explicitly supplied.

Gloo tool-capable completions may take tens of seconds on a cold route. The live canary calls the provider directly so a timeout cannot be hidden by the app's graceful fallback.

## 4. Preferences

Environment variables mirror the plugin settings:

```text
GRACE_LOCALE=en-US
GRACE_BIBLE_VERSION_ID=3034
GRACE_TIME_ZONE=Europe/Paris
GRACE_TRADITION=ecumenical
GRACE_PREFERRED_TONE=balanced
GRACE_SHOW_SELECTION_REASON=true
GRACE_HISTORY_LIMIT=12
GRACE_CONTEXT_MODE=local-labels
GRACE_MIN_WAIT_SECONDS=8
GRACE_COOLDOWN_MINUTES=10
GRACE_MAX_CARDS_PER_DAY=6
GRACE_TELEMETRY_ENABLED=false
```

Tradition values are `ecumenical`, `catholic`, `mainline`, or `evangelical`. Tone values are `balanced`, `calm`, `steady`, `encouraging`, or `reflective`.

Use a valid IANA timezone. It controls local dates, day caps, time windows, church seasons, and observances.

## 5. Local feedback

Every rendered card includes a short Feedback ID:

```powershell
node dist/cli.js feedback <feedback-id> 1
node dist/cli.js feedback <feedback-id> 5
```

The MCP tool is `grace_feedback`. Ratings never contain free text and are never sent to YouVersion. Grace stores only the trace and approved IDs locally, then derives preferred/avoided ID lists for future ranking.

## 6. Grounded Gloo mode (optional)

After publishing a Grace-owned content library:

```powershell
$env:GLOO_ENDPOINT_MODE = "grounded"
$env:GLOO_RAG_PUBLISHER = "GraceInTheGap"
npm run canary:live
```

The visible reflection remains catalog-owned. Grounding does not authorize model-authored devotional prose.

## 7. Claude Code visual pass

```powershell
claude update
claude --plugin-dir .
```

Verify:

- `spinner sync --apply` merges settings and creates a backup;
- the synced static tip appears during a genuinely long task;
- Claude starts immediately; the asynchronous hook adds no pre-task latency;
- the context-selected full card appears on the next conversation turn;
- the four MCP tools and four namespaced skills work;
- a low rating changes a future approved choice without storing text;
- disabling the plugin causes no hook, MCP process, settings change, or network call.

Do not describe the asynchronous full card as a dynamic mid-turn spinner. The official spinner override and queued hook card are distinct product surfaces.

## 8. Notebook evidence

```powershell
npm run notebook:build
```

This regenerates the executed notebook from the current catalog and evaluation. With credentials in private environment variables, the final cell performs a live provider canary and saves only a sanitized summary. Confirm `contains_credentials: false` in notebook metadata before upload.

## 9. Production checklist

- Keep `GRACE_DEMO_ALWAYS=false` outside controlled demonstrations.
- Keep a nonzero cooldown and daily cap.
- Review Gloo cost/latency after initial real usage.
- Maintain the curated editorial sign-off for every mapping and locale.
- Confirm YouVersion licenses and on-screen attribution.
- Measure interruption acceptance and repeat/dismissal behavior with real users.
- Rotate any credential ever exposed outside approved secret storage.
