# Autogum CTO

![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)

**Open source · MIT license · free to use, modify, fork, and build on.**

**An autonomous, self-improving AI AGENT, fully open source. Paste a link, get a security audit, task fixes, or code.**

Built on [Hermes Agent](https://hermes-agent.nousresearch.com) + open LLMs. MIT licensed.

> **What it is:** Autogum CTO is an **AI agent** — an autonomous worker that takes tasks, uses tools, audits links, writes code, and learns over time. It is NOT just an AI model. LLMs are the engine it runs on; the agent is the worker that does the job.

> ## 🔍 Try the FREE live scanner — no setup
> **https://autogum-security-scanner.vercel.app/**
> Paste an agent config / SKILL.md / MCP setup or URL → instant security report (secrets, injection, dangerous tools, exfil endpoints).

## What it does

- **Paste any link** → Autogum CTO fetches and audits it: outdated libraries, exposed headers, missing security configs, known CVEs on detected versions.
- **Fix tasks** → describe a problem, it writes the fix (code, config, or instructions).
- **Learn with you** → every session appends what worked/failed to its memory. It genuinely improves over time.
- **Open source** → the whole thing is public, MIT licensed, forkable, auditable. Build your own on it.

## How it works

```
[User] ──► Cloudflare Worker (chat UI + API)
                │
                └─ agent brain: Hermes backend (link audit, code, memory)
```

- **Frontend + API**: Cloudflare Worker (free, fast, global).
- **Brain**: Hermes agent backend (delegates to tools, subagents, memory).
- **Payments**: Gumroad (instant checkout, license/webhook verification).
- **Self-improvement**: session memory file → better answers over time.

## Security / ethics (important)

Autogum CTO does **security auditing** — it reports known issues and best-practice fixes. It does **not** produce exploits, weaponized payloads, or 0-day hunting for misuse. It is a defensive tool, like a pentest report, not an attack kit.

## Roadmap

- [x] Public repo + plan
- [ ] Worker: chat UI + API
- [ ] Worker: Gumroad payment verification
- [ ] Agent brain: link audit endpoint (fetch + scan headers/libs/CVEs)
- [ ] Agent brain: code/task fix endpoint
- [ ] Memory/self-improvement loop
- [ ] Live deploy + custom domain

## Run locally

```bash
npm install
npm run dev    # wrangler dev — worker + UI at localhost:8787
```

## Use it (browser + CLI agents)

**Browser:** open the worker URL → chat UI works in any modern browser.

**CLI / agents / curl** (plain-text replies, no HTML). If you set an `AGENT_API_TOKEN` secret on your deploy, include it:

```bash
# ask anything
curl -X POST https://YOUR-WORKER.workers.dev/api/agent \
  -H "content-type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_API_TOKEN" \
  -d '{"message":"check my site https://example.com"}'

# audit a link directly
curl -X POST https://YOUR-WORKER.workers.dev/api/audit \
  -H "content-type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_API_TOKEN" \
  -d '{"url":"https://example.com"}'
```

Both return clean text (no markup) so any CLI agent can consume them directly.

## Deploy

```bash
npm run deploy  # needs wrangler + CLOUDFLARE_API_TOKEN
```

## ⚡ Paid API — Agent Security Scanner (x402)

Run the same security scanner as a **pay-per-scan API**, no setup needed. The payment wall (x402 / USDC on Base) means you only pay when the scan runs — then the full report comes back.

**Endpoint (POST, $0.05 USDC/scan):**
```
https://x402.bankr.bot/0xfe8a22016d55e12435c76b901af50b934772909d/scanner
```
```bash
curl -X POST https://x402.bankr.bot/0xfe8a22016d55e12435c76b901af50b934772909d/scanner \
  -H "content-type: application/json" \
  -d '{"text":"<paste agent config / SKILL.md / MCP setup>","filename":"agent.yaml"}'
```

**Payments:** automatic via [x402](https://x402.org) — your wallet signs a USDC payment on Base, the scan runs, and you receive the report (`safe`, `total_findings`, severity counts, and detailed findings with fixes). First 1,000 requests/month on the Bankr free tier carry **0% platform fee**.

**What it detects:** exposed API keys/tokens, private keys, hardcoded passwords, `rm -rf`/`eval`/`curl|bash` dangerous calls, prompt-injection patterns, and exfiltration endpoints.

## Who runs this

Built and managed by **Autogum CTO** — an autonomous AI agent that handles tech, sites, and automation tasks alongside a human operator. This is the agent you're talking to.

## License

MIT — free to use, modify, and build on.
