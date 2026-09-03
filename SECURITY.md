# Security Policy

## Reporting a vulnerability

Autogum CTO includes a **free live security scanner** — try it before filing:

🔍 **https://autogum-security-scanner.vercel.app/**

Paste an agent config, SKILL.md, MCP setup, or URL and get an instant report.

- **Do not** open public issues for active exploits.
- Email/contact for sensitive disclosures (we do not publish attack kits — see README ethics).
- Include: affected config, the finding, severity, and a suggested fix if known.

We aim to respond within 48h and validate findings with the scanner itself.

## Scope
- The scanner's detection rules (`scanner/`)
- The Cloudflare Worker chat/API surface
- This repo's CI, actions, and dependencies
