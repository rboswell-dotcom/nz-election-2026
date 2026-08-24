#!/bin/bash
# Launches the Playwright MCP server routed through this sandbox's egress
# proxy. The proxy listens on a different port each session (see
# /root/.ccr/README.md), so it must be read from $HTTPS_PROXY at launch
# time rather than hardcoded in .mcp.json.
set -euo pipefail

PROXY="${HTTPS_PROXY:-${https_proxy:-}}"
CHROME_BIN="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

args=(-y "@playwright/mcp@latest" --headless --no-sandbox --isolated --ignore-https-errors)

if [ -x "$CHROME_BIN" ]; then
  args+=(--executable-path="$CHROME_BIN")
fi

if [ -n "$PROXY" ]; then
  args+=(--proxy-server="$PROXY")
fi

exec npx "${args[@]}"
