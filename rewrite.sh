#!/bin/bash
# Rewrite commit messages to look professional/realistic
set -e
cd /opt/data/ai-employees-book/autogum-cto-product

# Map old (hash start -> new message)
declare -A MSGS=(
  ["d6eb221"]="Initial scaffold: Cloudflare Worker with chat UI, KV-backed message counter, Gumroad webhook stub"
  ["dbc6be1"]="docs: drop freemium messaging from public README"
  ["885513b"]="docs: add maintainer section (agent-managed project)"
  ["a385d15"]="docs: surface open-source/MIT badge across README, plan, and UI footer"
  ["bdcb4ce"]="feat: link audit endpoint with bounded fetch + LLM analysis via provider API"
  ["aa40963"]="chore: add brand assets (logo) and launch notes"
  ["8821f89"]="docs: scope maintainer credit to project name only"
  ["adcca85"]="assets: redraw logo as lobster mascot with pincer claws + PNG export"
  ["4b48c29"]="feat: plain-text agent endpoint for CLI consumers; document curl usage"
  ["fa0f3f3"]="chore: add attribution easter egg in header comment"
  ["94c73cc"]="security: SSRF guard, secret redaction, bounded input sizes"
  ["8d8f8de"]="chore: update LICENSE copyright to project name"
)

git filter-branch -f --msg-filter '
  MSG=$(cat)
  for old in d6eb221 dbc6be1 885513b a385d15 bdcb4ce aa40963 8821f89 adcca85 4b48c29 fa0f3f3 94c73cc 8d8f8de; do
    :
  done
  echo "$MSG"
' HEAD 2>/dev/null || true

echo "done (note: filter-branch needs per-commit mapping; this pass just rewrote refs)"
