# Setup and first live run

Grace in the Gap makes real Gloo and YouVersion calls on every card. This is the
checklist to go from zero to one verified live moment. Both APIs are free for
registered challenge participants.

## 1. Provision credentials

### Gloo AI Studio

1. Create a Gloo AI Studio organization and sign in.
2. Set the lowest practical weekly spend limit while testing.
3. Open **API Credentials** and create a Client ID + Client Secret.
4. Start in **Responses** mode — it uses the quickstart endpoint and needs no publisher.
5. Later, ingest only Grace-owned moment/reflection metadata and set a publisher to
   enable **Grounded** mode. Never ingest YouVersion Bible text into Gloo.

### YouVersion Platform

1. Register the application in the YouVersion Platform portal and copy the App Key.
2. Confirm which Bible/version IDs your app key is licensed for (the default is
   version `3034`, the public-domain Berean Standard Bible).
3. Confirm the rendering and copyright-attribution requirements for that version.
   Grace fetches the version's copyright from `GET /v1/bibles/{id}` and always
   displays it — it never shows a passage without attribution.

## 2. Configure secrets safely

Preferred (plugin): install/enable the plugin and enter the sensitive `userConfig`
values. Claude Code stores them in secure storage and exposes them only to the
plugin's own subprocesses.

CLI / local: copy `.env.example` to `.env` and fill in the three values. The CLI
auto-loads `.env`. Never commit `.env` or show it in a recording.

```powershell
copy .env.example .env   # then edit
```

Minimum required keys:

```text
GLOO_CLIENT_ID, GLOO_CLIENT_SECRET, YVP_APP_KEY
```

## 3. Run one Responses canary

```powershell
npm run build
node dist/cli.js status
node dist/cli.js moment debugging
node dist/cli.js spinner sync
```

Pass criteria:

- `status` reports both credentials `configured`.
- The card is labelled `GLOO + YOUVERSION` (not the offline fallback).
- Gloo returns strict JSON that maps to an exact catalog combination.
- YouVersion returns non-empty passage text, and the displayed copyright matches
  the version's attribution.
- No prompt, code, working directory, or file path appears in provider requests.
- Exactly one Gloo selection plus one YouVersion passage + one metadata lookup occur.

If Gloo output is invalid, Grace degrades to on-device selection (still live
Scripture). If YouVersion is unreachable, Grace shows a labelled public-domain
fallback verse. A degraded card is real, but it is not proof of the live path — use
a card labelled `GLOO + YOUVERSION` for that.

## 4. Enable grounded selection (optional)

After publishing a Grace-owned content library:

```powershell
$env:GLOO_ENDPOINT_MODE = "grounded"
$env:GLOO_RAG_PUBLISHER = "GraceInTheGap"
```

Repeat the canary and verify citations/routing metadata. The visible reflection
stays pre-authored even in grounded mode.

## 5. Claude Code visual pass

```powershell
claude update
claude --plugin-dir .
```

Verify:

- `spinner sync --apply` installs the live, attributed tip and creates a backup.
- The synced tip is visible while a genuinely long task runs.
- Claude begins working immediately; the async hook adds no pre-task latency.
- The full hook card appears on the next conversation turn.
- `/grace-in-the-gap:moment`, `:privacy`, and `:configure` work.
- Disabling the plugin produces no hook, MCP process, setting change, or network call.

## 6. Cost and launch gates

- Keep `GRACE_DEMO_ALWAYS=false` outside of recording.
- Keep a nonzero cooldown and daily cap.
- Review Gloo spend after the first 20 real cards.
- Obtain formal theology/editorial approval for every visible reflection and locale.
- Confirm your YouVersion version's attribution requirements are met on screen.
