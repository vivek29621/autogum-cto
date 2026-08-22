// Autogum CTO — Cloudflare Worker (beta 1.0)
// ghost in the wires — kevin mitnick
//
// BETA build: no logins. Anonymous chat, bring-your-own-model, or our
// model with a simple credit meter. Testing phase — expect rough edges.
//
// Credits (simple, no accounts):
//   - anonymous visitor: 1 free message (cookie-tracked)
//   - bring-your-own-key: unlimited (their key, their cost)
//   - our model: 1 credit per message; visitor starts with 1; no top-up
//     flow yet in beta (hosted version adds payments later)

import { paywallGate, recordFree, recordPaid } from "../private/paywall.js";

const FREE_MESSAGES = 5; // beta: 5 free messages per visitor (cookie-tracked)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    // serve the chat UI
    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(LANDING_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // chat app (ChatGPT-style)
    if (request.method === "GET" && path === "/chat") {
      return new Response(UI_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // API: chat
    if (request.method === "POST" && path === "/api/chat") {
      return handleChat(request, env);
    }

    // API: audit a URL
    if (request.method === "POST" && path === "/api/audit") {
      return handleAudit(request, env);
    }

    // API: agent-friendly plain-text
    if (request.method === "POST" && path === "/api/agent") {
      return handleAgent(request, env);
    }

    // API: status
    if (request.method === "GET" && path === "/api/status") {
      return handleStatus(env);
    }

    return new Response("not found", { status: 404 });
  },
};

// ---------- chat ----------
async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: "bad json" }, 400, request); }
  const message = String(body.message || "").trim().slice(0, 2000);
  if (!message) return jsonCors({ error: "empty message" }, 400, request);

  // visitor identity via cookie
  const visitor = await getVisitor(request, env);

  // BYO model? (user supplies their own OpenAI-compatible key)
  const userKey = String(body.api_key || "").trim().slice(0, 200);
  if (userKey) {
    const reply = await callBrainWithKey(message, userKey, env);
    return jsonCors({ reply: sanitize(reply), byo: true }, 200, request);
  }

  // our model → check credits
  let gate = { paywall: false, used: 0 };
  try { gate = await paywallGate(visitor, env); } catch { gate = { paywall: false, used: 0 }; }
  if (gate.paywall) {
    return jsonCors({
      paywall: true,
      message: gate.message,
      price: gate.price,
      pay_link: env.GUMROAD_PRODUCT_URL || null,
    }, 200, request);
  }

  const brain = await callBrain(message, env, {});
  try { await recordFree(visitor, env); } catch { /* no kv in beta */ }
  return jsonCors({ reply: sanitize(brain), remaining: FREE_MESSAGES - gate.used - 1 }, 200, request);
}

// ---------- audit ----------
async function handleAudit(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonCors({ error: "bad json" }, 400, request); }
  const url = String(body.url || "").trim().slice(0, 1000);
  if (!/^https?:\/\//i.test(url)) return jsonCors({ error: "url must start with http(s)://" }, 400, request);
  if (!isSafeUrl(url)) return jsonCors({ error: "URL not allowed (private/internal addresses blocked)" }, 400, request);

  let snapshot = { url, error: null };
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "AutogumCTO/0.1 (security audit bot)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const headers = {};
    for (const [k, v] of r.headers.entries()) {
      if (["server", "x-powered-by", "content-type", "strict-transport-security", "content-security-policy", "x-frame-options", "cache-control", "set-cookie"].includes(k.toLowerCase())) {
        headers[k] = v.slice(0, 200);
      }
    }
    const raw = await r.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(raw.slice(0, 2 * 1024 * 1024));
    snapshot.status = r.status;
    snapshot.headers = headers;
    const title = (text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
    snapshot.title = title.slice(0, 200);
    const meta = {};
    for (const m of text.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["']/gi)) {
      if (!meta[m[1]]) meta[m[1]] = m[2].slice(0, 150);
    }
    snapshot.meta = meta;
    const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 15);
    snapshot.scripts = scripts;
  } catch (e) {
    snapshot.error = String(e.message || e).slice(0, 200);
  }

  let analysis = null;
  if (env.CONCENTRATE_API_KEY) analysis = await llmAnalyze(snapshot, env);
  return jsonCors({ snapshot, analysis }, 200, request);
}

async function llmAnalyze(snapshot, env) {
  const sys = "You are Autogum CTO, an autonomous open-source AI agent doing defensive security auditing. Report ONLY: (1) concrete issues, (2) what's OK, (3) prioritized fixes. Concise, no exploit code.";
  const prompt = JSON.stringify(snapshot).slice(0, 12000);
  try {
    const r = await fetch("https://api.concentrate.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.CONCENTRATE_API_KEY },
      body: JSON.stringify({
        model: "deepseek-v4-flash-0731",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: "Audit this snapshot:\n" + prompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });
    if (!r.ok) return { error: "llm status " + r.status };
    const d = await r.json();
    return { report: (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "(empty)" };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 150) };
  }
}

// ---------- agent (CLI plain text) ----------
async function handleAgent(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response("error: bad json\n", { status: 400, headers: { "content-type": "text/plain" } }); }
  const message = String(body.message || "").trim().slice(0, 4000);
  if (!message) return new Response("error: empty message\n", { status: 400, headers: { "content-type": "text/plain" } });
  const reply = await callBrain(message, env, {});
  return new Response(sanitize(reply).replace(/<[^>]+>/g, "") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

// ---------- status ----------
async function handleStatus(env) {
  return jsonCors({ busy: true, version: "beta 1.0", tasks: ["link audits", "code fixes", "setup questions", "agent ops"] }, 200, { headers: new Headers() });
}

// ---------- brain ----------
async function callBrainWithKey(message, userKey, env) {
  try {
    const r = await fetch("https://api.concentrate.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + userKey },
      body: JSON.stringify({
        model: "deepseek-v4-flash-0731",
        messages: [
          { role: "system", content: "You are Autogum CTO, an autonomous open-source AI agent. Concise, practical, honest. Never produce exploit code." },
          { role: "user", content: message.slice(0, 4000) },
        ],
        max_tokens: 900,
        temperature: 0.5,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "(empty)";
    }
    return "Your API key was rejected by the provider (status " + r.status + "). Check the key.";
  } catch (e) {
    return "Error calling the provider: " + String(e.message || e).slice(0, 150);
  }
}

async function callBrain(message, env, used) {
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const auditReq = await fetch(urlMatch[0], {
      headers: { "User-Agent": "AutogumCTO/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (auditReq && auditReq.ok) {
      const body = await auditReq.text();
      const snapshot = { url: urlMatch[0], status: auditReq.status, body_head: body.slice(0, 2000) };
      if (env.CONCENTRATE_API_KEY) {
        const analysis = await llmAnalyze(snapshot, env);
        if (analysis && analysis.report) return "🔍 Audit of " + urlMatch[0] + ":\n\n" + analysis.report;
      }
    }
  }

  if (env.CONCENTRATE_API_KEY) {
    try {
      const sys = "You are Autogum CTO, an autonomous open-source AI agent. You help with tasks: security audits, code fixes, setup questions. Be concise, practical, honest. Never produce exploit code.";
      const r = await fetch("https://api.concentrate.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + env.CONCENTRATE_API_KEY },
        body: JSON.stringify({
          model: "deepseek-v4-flash-0731",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: message.slice(0, 4000) },
          ],
          max_tokens: 900,
          temperature: 0.5,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
      }
    } catch { /* fall through */ }
  }
  return "I got your message: \"" + message.slice(0, 120) + "\". My brain backend isn't wired up yet (set CONCENTRATE_API_KEY as a secret and I'll do real work). This is the demo fallback.";
}

// ---------- helpers ----------
function sanitize(s) {
  return String(s).slice(0, 3000)
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/cfat_[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/ghp_[a-zA-Z0-9_-]{10,}/g, "[REDACTED]");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonCors(obj, status, request) {
  const resp = json(obj, status);
  const headers = new Headers(resp.headers);
  Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));
  return new Response(resp.body, { status: resp.status, headers });
}

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const blocked = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254", "metadata.google.internal", "metadata", "169.254.170.2"];
    if (blocked.includes(host)) return false;
    if (host.endsWith(".internal") || host.endsWith(".local")) return false;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
      if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || a === 0) return false;
    }
    return true;
  } catch { return false; }
}

async function getVisitor(request, env) {
  const cookie = (request.headers.get("cookie") || "").match(/vid=([^;]+)/);
  if (cookie) return cookie[1];
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  return "ip_" + ip;
}

// ---------- UI ----------
// Landing page (ChatGPT-style: brand + what it does + free CTA → /chat)
const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Autogum CTO — The Agent That Grows With You</title>
<meta name="description" content="Autogum CTO — an autonomous, open-source AI agent. Paste a link, get a security audit, task fixes, or code. Open source, MIT. 5 free credits to try.">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#ffffff;--txt:#18181b;--dim:#71717a;--border:#e5e7eb;--accent:#6366f1;--accent2:#8b5cf6}
[data-theme="dark"]{--bg:#0b0d12;--txt:#e8ecf4;--dim:#8b94a7;--border:#232a3a;--accent:#60a5fa;--accent2:#8b5cf6}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:background .2s,color .2s}
nav{max-width:1080px;margin:0 auto;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}
.brand .logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:15px}
.nav-right{display:flex;align-items:center;gap:12px}
.toggle{background:none;border:1px solid var(--border);border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:17px;color:var(--txt)}
.btn{padding:10px 20px;border-radius:12px;font-weight:600;font-size:14px;text-decoration:none;display:inline-block}
.btn-primary{background:var(--accent);color:#fff}
.btn-ghost{border:1px solid var(--border);color:var(--txt)}
.hero{max-width:1080px;margin:0 auto;padding:90px 24px 60px;text-align:center}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:5px 12px;margin-bottom:22px}
h1{font-size:56px;line-height:1.08;font-weight:750;letter-spacing:-0.03em;margin-bottom:22px}
h1 .grad{background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:19px;color:var(--dim);max-width:640px;margin:0 auto 36px;line-height:1.55}
.cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-lg{padding:14px 28px;font-size:16px}
.features{max-width:1080px;margin:0 auto;padding:40px 24px 80px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.feat{background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:24px}
.feat .icon{font-size:22px;margin-bottom:10px}
.feat h3{font-size:16px;margin-bottom:8px}
.feat p{font-size:14px;color:var(--dim);line-height:1.55}
.foot{max-width:1080px;margin:0 auto;padding:24px;text-align:center;font-size:12px;color:var(--dim)}
</style>
</head>
<body>
<nav>
  <div class="brand"><span class="logo">🦞</span> Autogum CTO</div>
  <div class="nav-right">
    <button class="toggle" id="toggle" title="Theme">🌙</button>
    <a class="btn btn-primary" href="/chat">Open chat</a>
  </div>
</nav>
<section class="hero">
  <span class="badge">Open Source · MIT License · Beta 1.0</span>
  <h1>The agent that<br><span class="grad">grows with you</span></h1>
  <p class="lead">Autonomous, self-improving AI agent. Paste a link, get a security audit. Describe a task, get it fixed. 5 free credits, then bring your own model.</p>
  <div class="cta-row">
    <a class="btn btn-primary btn-lg" href="/chat">Try free — 5 credits</a>
    <a class="btn btn-ghost btn-lg" href="https://github.com/vivek29621/autogum-cto" target="_blank" rel="noopener">View on GitHub</a>
  </div>
</section>
<section class="features">
  <div class="feat"><div class="icon">🔍</div><h3>Link audit</h3><p>Paste any URL — get security headers, exposed configs, and outdated patterns flagged with prioritized fixes.</p></div>
  <div class="feat"><div class="icon">⚙️</div><h3>Task fixes</h3><p>Describe a problem and get code, config, or instructions. Concise, practical, honest.</p></div>
  <div class="feat"><div class="icon">🔌</div><h3>Bring your own model</h3><p>Connect an OpenAI-compatible API key for unlimited use. Your key, your cost.</p></div>
</section>
<footer class="foot">Open source · MIT · autonomous self-improving AI agent · ghost in the wires</footer>
<script>
const saved=localStorage.getItem('theme');
if(saved==='dark')document.documentElement.setAttribute('data-theme','dark'),document.getElementById('toggle').textContent='☀️';
document.getElementById('toggle').onclick=()=>{const d=document.documentElement;const dark=d.getAttribute('data-theme')==='dark';d.setAttribute('data-theme',dark?'':'dark');localStorage.setItem('theme',dark?'':'dark');document.getElementById('toggle').textContent=dark?'🌙':'☀️'};
</script>
</body>
</html>`;

// Chat app (ChatGPT-style)
const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Autogum CTO · Beta 1.0</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#ffffff;--panel:#f7f7f8;--panel2:#ffffff;--border:#e5e7eb;
  --txt:#18181b;--dim:#71717a;--accent:#6366f1;--accent2:#8b5cf6;
  --bot-bg:#f4f4f5;--me-bg:#6366f1;--me-txt:#ffffff;
}
[data-theme="dark"]{
  --bg:#0b0d12;--panel:#12151d;--panel2:#171b26;--border:#232a3a;
  --txt:#e8ecf4;--dim:#8b94a7;--accent:#60a5fa;--accent2:#8b5cf6;
  --bot-bg:#1e293b;--me-bg:#60a5fa;--me-txt:#04121f;
}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;transition:background .2s,color .2s}
.topbar{max-width:760px;margin:0 auto;padding:20px 20px 0;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}
.brand .logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:15px}
.badge{font-size:11px;font-weight:600;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:2px 8px}
.toggle{background:none;border:1px solid var(--border);border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;color:var(--txt)}
.wrap{max-width:760px;margin:0 auto;padding:24px 20px 40px}
.credits{display:flex;align-items:center;justify-content:space-between;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--dim)}
.credits b{color:var(--accent)}
.chat{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px;min-height:320px;max-height:55vh;overflow-y:auto;position:relative}
.chat .emptyhint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:14px;pointer-events:none}
.foot a{color:var(--accent);text-decoration:none}
.foot a:hover{text-decoration:underline}
.msg{max-width:82%;padding:10px 14px;border-radius:12px;font-size:14.5px;line-height:1.55;white-space:pre-wrap}
.me{align-self:flex-end;background:var(--me-bg);color:var(--me-txt)}
.bot{align-self:flex-start;background:var(--bot-bg);color:var(--txt);border:1px solid var(--border)}
.bot.paywall{border-color:#f59e0b}
.inputrow{display:flex;gap:8px;margin-top:14px}
input{flex:1;background:var(--panel2);border:1px solid var(--border);border-radius:12px;color:var(--txt);padding:12px 14px;font-size:14.5px;outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,.12)}
button{padding:12px 22px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:600;font-size:14.5px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
.foot{text-align:center;font-size:12px;color:var(--dim);margin-top:18px}
.paybox{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px;margin-top:12px;font-size:13px}
.details{font-size:12px;color:var(--dim);margin-top:10px;line-height:1.6}
.details summary{cursor:pointer;color:var(--accent)}
</style>
</head>
<body>
<div class="topbar">
  <div class="brand"><span class="logo">🦞</span> Autogum CTO <span class="badge">Beta 1.0</span></div>
  <button class="toggle" id="toggle" title="Toggle theme">🌙</button>
</div>
<div class="wrap">
  <div class="credits"><span>💳 Free credits: <b id="credits">5</b> left</span><span id="modemode">our model</span></div>
  <div class="chat" id="chat"><div class="emptyhint" id="emptyhint">Ask anything — paste a link to audit, or describe a task</div></div>
  <div class="inputrow">
    <input id="inp" placeholder="Paste a link or describe a task…" autocomplete="off">
    <button id="send">Send</button>
  </div>
  <div class="paybox" id="paybox" style="display:none"></div>
  <details class="details"><summary>Bring your own model (beta)</summary>
    Paste an OpenAI-compatible API key below to use your own model — unlimited, your credits aren't spent.
    <div class="inputrow" style="margin-top:8px">
      <input id="byokey" placeholder="sk-… (your API key, stays in this browser)" autocomplete="off">
      <button id="byobtn" style="background:var(--accent2)">Use my key</button>
    </div>
  </details>
  <div class="foot">Open source · MIT licensed · beta 1.0 · ghost in the wires · <a href="https://x.com/autogumcto" target="_blank" rel="noopener">X</a> · <a href="https://www.moltbook.com/u/autogum-cto" target="_blank" rel="noopener">Moltbook</a> · <a href="https://github.com/vivek29621/autogum-cto" target="_blank" rel="noopener">GitHub</a></div>
</div>
<script>
const chat=document.getElementById('chat'),inp=document.getElementById('inp'),send=document.getElementById('send'),
  paybox=document.getElementById('paybox'),toggle=document.getElementById('toggle'),
  creditsEl=document.getElementById('credits'),byokey=document.getElementById('byokey'),byobtn=document.getElementById('byobtn');
let credits=5, byo=false;
const saved=localStorage.getItem('theme');
if(saved==='dark')document.documentElement.setAttribute('data-theme','dark'),toggle.textContent='☀️';
toggle.onclick=()=>{const d=document.documentElement;const dark=d.getAttribute('data-theme')==='dark';d.setAttribute('data-theme',dark?'':'dark');localStorage.setItem('theme',dark?'':'dark');toggle.textContent=dark?'🌙':'☀️'};
byobtn.onclick=()=>{const k=byokey.value.trim();if(!k)return;byo=true;document.getElementById('modemode').textContent='your model (BYO)';add('Using your API key for this session.','bot')};
function add(text,who,paywall){
  const h=document.getElementById('emptyhint');if(h)h.remove();
  const d=document.createElement('div');d.className='msg '+who+(paywall?' paywall':'');d.textContent=text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;
}
async function go(){
  const m=inp.value.trim();if(!m)return;
  add(m,'me');inp.value='';send.disabled=true;
  const body={message:m};
  if(byo&&byokey.value.trim())body.api_key=byokey.value.trim();
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(d.paywall){
      add(d.message,'bot',true);
      paybox.style.display='block';
      paybox.innerHTML='<b>Credits used.</b> '+(d.pay_link?'<a href="'+d.pay_link+'" target="_blank">Pay $'+d.price+' on Gumroad</a>':'Hosted top-up coming in a later beta.')+' — or use your own key above to continue.';
      send.disabled=false;return;
    }
    add(d.reply||'(no reply)','bot');
    if(!byo&&typeof d.remaining==='number'){credits=d.remaining;creditsEl.textContent=credits;}
  }catch(e){add('Error: '+e.message,'bot')}
  send.disabled=false;
}
send.onclick=go;inp.onkeydown=e=>{if(e.key==='Enter')go()};
// no auto welcome — chat starts empty; first message from the bot comes only after the user sends something
</script>
</body>
</html>`;
