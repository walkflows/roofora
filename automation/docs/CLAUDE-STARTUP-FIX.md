# "Subprocess initialization did not complete within 60000ms"

Diagnosed 11 Oct 2026 from the VS Code extension log (`%APPDATA%\Code\logs\<date>\window*\exthost\Anthropic.claude-code\Claude VSCode.log`) and the per-server logs in `%LOCALAPPDATA%\claude-cli-nodejs\Cache\<project>\mcp-logs-*`.

## What the logs show
* **Not an authentication problem.** `OAuth tokens found in secure storage` on every start; the Anthropic API answered.
* **Not an outage.** Right now every host used at startup (api.anthropic.com, the MCP hosts, n8n.walkflow.tech, api.airtable.com) connects in 0.6–1.5 s.
* **Not Airtable or any database.** Nothing in the startup path touches them.
* **A startup that ran out of time.** The failing start logged `startupWorkGate open (host_initialized) after 56194ms` — 56 s of the 60 s allowed. Inside that: *loading commands and agents 27.8 s*, *resolving MCP configuration 16.7 s*, and the three Vercel session hooks about 15 s each.
* **What made it slow:**
  1. The machine was overloaded: at 11:50–11:56 Chrome, VS Code and the Claude desktop app all launched together; CPU was ~86% with only ~2.3 GB RAM free and ~14 Claude processes. Avast was scanning files and HTTPS traffic (its certificate is injected through `NODE_EXTRA_CA_CERTS`).
  2. VS Code starts **two** Claude processes per window, and two windows opened at once → config-lock contention (`Lock file is already being held`).
  3. Four plugin MCP servers failed on **every** start and were retried: `github` (no `GITHUB_PERSONAL_ACCESS_TOKEN` set), `supabase` (not used by ROOFORA), `posthog` and `context7` (probe timeouts / `InvalidHTTPResponse`).

## Fix applied (ROOFORA project only)
`ROOFERA/.claude/settings.local.json` turns those four plugins off for this project (git-ignored; your user-level settings and other projects are unchanged). Nothing was deleted, no secret was read or printed, and no security software or protection was changed.

Measured with a headless start in this project afterwards: commands and agents **27.8 s → 0.8 s**, MCP config **16.7 s → 1.7 s**, and none of the four failing servers were contacted.

## If it happens again — manual steps
1. Close all VS Code windows and the Claude desktop app. Wait a minute.
2. Open **one** VS Code window on `ROOFERA` and wait until it is idle before opening another.
3. In the Claude panel run `/mcp` to see which servers fail; run `/plugin` and disable any you do not use (GitHub: either set the token or disable it).
4. Avast: **do not turn it off.** Instead add exclusions for the VS Code, `claude.exe` and `node.exe` processes (or their HTTPS-scanning exclusions) — Avast › Menu › Settings › General › Exceptions.
5. If a start still fails, open the log path above and look for `startupWorkGate` and the slowest `[STARTUP]` lines; send me those lines (they contain no secrets).
6. Re-enable a disabled plugin for this project by deleting its line from `.claude/settings.local.json`.
