---
name: configure
description: Configure Grace in the Gap consent, cooldown, daily limit, locale, or contextual selection after the user explicitly asks.
allowed-tools: mcp__plugin_grace-in-the-gap_configure_grace
disable-model-invocation: true
---

# Configure Grace

Parse `$ARGUMENTS` into only the fields supported by `configure_grace`. Show the proposed values and obtain user confirmation before calling the tool. Never enable telemetry unless the user explicitly requests it.
