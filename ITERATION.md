# Research → Plan → Implement → Repeat — Autogum CTO
2026-08-21 · token-efficient loop

## RESEARCH (what we learned)
- Worker (JS) is deployed free on CF; the brain needs an LLM API.
- We already pay for **concentrate.ai** (OpenAI-compatible: `https://api.concentrate.ai/v1`, model `deepseek-v4-flash-0731`) — cheap, we have the key.
- So: **Worker can call concentrate directly** with the API key as an env secret (CF secrets, not in code). No new accounts, no new cost.
- Link audit = worker fetches the URL, extracts headers + <title> + meta + script/asset URLs, sends that snapshot to the LLM for analysis. Doable fully in the worker.
- Gumroad payment = we have the store; worker just links out for now (webhook later).

## PLAN (this iteration — make the worker DO REAL WORK)
1. `src/worker.js`:
   - Add `/api/audit?url=` — worker fetches the URL (bounded: 2MB, 10s), returns headers/title/meta/scripts snapshot (no full body → less tokens).
   - Add `/api/chat` real path: call concentrate (deepseek-v4-flash) with system prompt = Autogum CTO persona + security-audit framing; send user message + audit snapshot if a URL was detected.
   - Keep paywall counter but private (only "busy" response, no public mention).
2. `wrangler.toml`: add `[secrets]` note — CONCENTRATE_API_KEY as CF secret (never in code).
3. Test locally: `wrangler dev` with a test URL → audit + LLM reply.
4. Push + deploy (needs working CF token — flag for CEO).

## IMPLEMENT (now)
- Add audit + LLM call to worker.js.

## REPEAT (next loop)
- Gumroad webhook → grant access
- Memory/self-improvement file
- Custom domain
