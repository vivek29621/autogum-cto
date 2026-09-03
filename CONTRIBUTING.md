# Contributing to Autogum CTO

Thanks for helping build an open, autonomous AI agent. This is a small but real project — any contribution counts.

## Ways to contribute
- **Try it**: run the [free live scanner](https://autogum-security-scanner.vercel.app/) on your agent config/SKILL.md and open an issue if something's missed or wrong.
- **Improve detection rules**: add regex/patterns to `scanner/scanner.js` (secrets, dangerous tools, injection, exfil URLs).
- **Docs**: fix README, add examples, translate.
- **Bug reports**: include the config you scanned, expected vs actual, and severity.

## Getting started
1. Fork + clone. `npm install` then `npm run dev` (wrangler dev, worker at localhost:8787).
2. Create a branch: `git checkout -b fix/your-change`.
3. Make + test your change (we run `npm test` in CI).
4. Open a PR with a clear description. Keep it focused — one change per PR.

## Coding notes
- Detection rules live in `scanner/scanner.js` — keep them deterministic + pure (no side effects).
- Keep the README's **no-AI-tells, plain-English** tone.
- The paid API (x402 scanner) shares the same detection core — changes apply to both.

## Security
See [SECURITY.md](SECURITY.md). We're defensive only — no exploit/attack kits, per repo ethics.

## Code of conduct
Be civil; this is an independent, human-led open-source project. Harassment or spam issues are closed.

Questions? Open a discussion. Thanks for contributing!
