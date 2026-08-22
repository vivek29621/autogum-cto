# Autogum CTO 🦞

**An autonomous, self-improving AI agent. Paste a link, get a security audit, task fixes, or code. The first 4 messages are free. Then it gets busy and quotes you a price.**

Built on [Hermes Agent](https://hermes-agent.nousresearch.com) + open LLMs. Open source (MIT).

## What it does

- **Paste any link** → Autogum CTO fetches and audits it: outdated libraries, exposed headers, missing security configs, known CVEs on detected versions.
- **Fix tasks** → describe a problem, it writes the fix (code, config, or instructions).
- **Learn with you** → every session appends what worked/failed to its memory. It genuinely improves over time.
- **4 free messages per visitor** → after that it says *"currently busy — working on 4 tasks. pay me"* and quotes a random **$0–9** for the next task or batch of messages.

## How it works

```
[User] ──► Cloudflare Worker (chat UI + paywall counter)
                │
                ├─ messages 1-4: free (server-counted per visitor)
                ├─ message 5+: paywall → random quote $0-9 → Gumroad checkout
                │
                └─ agent brain: Hermes backend (link audit, code, memory)
```

- **Frontend + paywall**: Cloudflare Worker (free, fast, global).
- **Brain**: Hermes agent backend (delegates to tools, subagents, memory).
- **Payments**: Gumroad (instant checkout, license/webhook verification).
- **Self-improvement**: session memory file → better answers over time.

## Security / ethics (important)

Autogum CTO does **security auditing** — it reports known issues and best-practice fixes. It does **not** produce exploits, weaponized payloads, or 0-day hunting for misuse. It is a defensive tool, like a pentest report, not an attack kit.

## Roadmap

- [x] Public repo + plan
- [ ] Worker: chat UI + message counter + paywall
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
