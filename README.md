# Autogum CTO 🦞

**An autonomous, self-improving AI agent, fully open source. Paste a link, get a security audit, task fixes, or code.**

Built on [Hermes Agent](https://hermes-agent.nousresearch.com) + open LLMs. MIT licensed.

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

## Deploy

```bash
npm run deploy  # needs wrangler + CLOUDFLARE_API_TOKEN
```

## License

MIT — free to use, modify, and build on. (Branding note: "Autogum CTO" is a product of the AI Employees Company.)
