# AUTOGUM-CTO — Autonomous Self-Improving AI Agent (Product Plan)
CEO idea 2026-08-21 · built by EMP-1 (CTO) · open-source, self-improving, paywalled

## THE PRODUCT (one line)
Talk to an AI CTO that learns with you, fixes things, finds vulnerabilities, writes code, handles your company — 4 free messages, then it quotes a random $0-9 price to continue.

## WHY IT'S GOOD (honest)
- We ARE the proof: 7 AI employees running a company. This is that story as a product.
- Hook: "past any link, find/fix security issues, zerodays, write code" = high-value, demo-able.
- Paywall gimmick is memorable + shareable ("the AI that charges $3 to keep talking").
- Open-source = trust + community + free marketing (devs love OSS agents).
- Runs on Hermes + cheap LLMs = near-zero marginal cost per user.

## ARCHITECTURE
```
[User] → Cloudflare Worker (frontend + chat API + paywall)
              │
              ├─ free tier: 4 messages (server-counted, token-limited)
              │
              ├─ paywall: "currently busy / working on 4 tasks — pay me"
              │     → random quote $0-9 (per message or per task)
              │     → payment via Gumroad (product links, we already have it)
              │
              └─ agent brain: Hermes core (delegate to subagents, tools, memory)
                    ├─ link analysis (fetch URL, scan for CVEs/misconfig)
                    ├─ code tasks (write/fix/deploy)
                    └─ self-improvement (learns from each session, memory file)
```

## PAYWALL DESIGN (the "catch")
- Server tracks messages per user (fingerprint = IP + session cookie).
- Messages 1-4: free. Message 5+: `busy: working on 4 tasks, pay me $N` (N = random 0-9).
- Payment = Gumroad product link (instant checkout, we own the store).
- On payment: session token grants N more messages (or task), then re-quotes.
- OPTIONAL per CEO: also "certain tokens/minutes" option.

## WHAT I NEED FROM CEO
1. **A domain** (CEO said he'd get one) — e.g. autogum-cto.com or autogumcto.ai. If not, start on worker URL (free).
2. **Cloudflare account access** (CEO said host on CF) — workers.dev is free; custom domain needs DNS.
3. **Gumroad product for payments** — I create the "Autogum CTO access" product ($1-9 tiers or pay-what-you-want).
4. **GitHub repo name** — `autogum-cto` under glinlabs (our token's account), public (open-source).

## WHAT I BUILD (steps)
1. Repo scaffold: README + LICENSE (MIT) + architecture docs.
2. Cloudflare Worker: chat UI (plain HTML/JS) + API:
   - POST /api/chat → checks message count → free or paywall response
   - GET /api/status → task list ("currently fixing 4 tasks: ...")
   - Payment verification (Gumroad webhook or license key)
3. Agent brain: Worker calls Hermes backend (or a hosted agent endpoint) — first version: Worker relays to a fixed prompt + tool list; v2: full Hermes delegation.
4. Self-improvement loop: every session appends to memory file (what worked/failed) — that's the "learns with you" part.
5. Deploy to Cloudflare (wrangler), custom domain if provided.

## HONEST RISKS / LIMITS (flag before building)
- **"find zerodays" is legally risky** — selling "exploit finding" invites misuse + liability. I'll frame as **security scanning/auditing** (legit, like a pentest service), not "free 0day hunting." CEO approval needed on wording.
- **The paywall gimmick can backfire** — users may just leave after 4 messages. Need the 4 free messages to be SO good they pay. The quote should sometimes be $0 (lucky), sometimes $9 (they see it's random, fun).
- **Cloudflare Workers has CPU/limits** — heavy LLM calls need a real backend; Worker as gateway + relay, not the brain itself.
- **Gumroad webhooks** need a public endpoint — CF Worker handles that.
- **"Powered by Hermes + top LLMs"** — we use deepseek (cheap) by default per cost-first; Claude/other as fallback (matches our model setup).

## NEXT STEPS (my order)
1. ✅ Plan written
2. Create repo + scaffold (public, MIT)
3. Build Worker: chat + paywall + Gumroad
4. Deploy to CF workers.dev (free) — test the 4-message flow myself
5. CEO: domain → attach; Gumroad product → create; go-live link

## VERIFICATION
- Live URL 200, chat works (4 free → paywall), payment flow end-to-end tested with a test purchase (refundable), repo public with README.
