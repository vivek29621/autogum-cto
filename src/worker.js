// Autogum CTO — Cloudflare Worker
// Chat UI + message counter + paywall (4 free messages, then random $0-9 quote)
// Payments: Gumroad checkout links (license verification via webhook later)
// Brain: relays to Hermes backend endpoint (LINK_AUDIT_URL / AGENT_API_URL)

const FREE_MESSAGES = 4;
const PRICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const TASKS = [
  "restructuring the task queue",
  "fixing a memory leak in the worker",
  "auditing a customer's checkout flow",
  "patching an exposed API key",
];

// KV binding: AUTOGUM (message counters + session memory)
// Env bindings: AGENT_API_URL (Hermes backend), GUMROAD_PRODUCT_URL (pay link)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // serve the chat UI
    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(UI_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // API: chat
    if (request.method === "POST" && path === "/api/chat") {
      return handleChat(request, env);
    }

    // API: status (what am I working on)
    if (request.method === "GET" && path === "/api/status") {
      return handleStatus(env);
    }

    // API: audit a URL (fetch + snapshot, no full body)
    if (request.method === "POST" && path === "/api/audit") {
      return handleAudit(request, env);
    }

    // API: webhook from Gumroad (payment confirmation)
    if (request.method === "POST" && path === "/api/webhook") {
      return handleWebhook(request, env);
    }

    return new Response("not found", { status: 404 });
  },
};

// ---------- chat ----------
async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const message = String(body.message || "").trim().slice(0, 2000);
  if (!message) return json({ error: "empty message" }, 400);

  // visitor identity: cookie or ip fallback
  const visitor = await getVisitor(request, env);
  const used = await countMessages(visitor, env); // returns {free_used, paid_used, total}

  // PAYWALL: free messages used up AND not currently paid
  if (used.free_used >= FREE_MESSAGES) {
    const price = randomPrice();
    const task = randomTask();
    return json({
      paywall: true,
      message: `Currently busy — working on ${TASKS.length} tasks. I can take yours: ${task}. Pay me $${price} (0-9, random) and I'm yours for the next task or batch.`,
      price,
      task,
      used,
      pay_link: env.GUMROAD_PRODUCT_URL || null,
    });
  }

  // FREE message: relay to the agent brain
  const brain = await callBrain(message, env, used);
  await bumpMessages(visitor, env, "free");
  return json({ reply: brain, used: { free_used: used.free_used + 1, paid_used: used.paid_used }, remaining_free: FREE_MESSAGES - used.free_used - 1 });
}

// ---------- audit ----------
async function handleAudit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const url = String(body.url || "").trim().slice(0, 1000);
  if (!/^https?:\/\//i.test(url)) return json({ error: "url must start with http(s)://" }, 400);

  // fetch bounded: 2MB body cap, 10s timeout, only text/html
  let snapshot = { url, error: null };
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "AutogumCTO/0.1 (security audit bot; contact: repo issues)" },
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
    // extract meta/title/scripts — small, useful for audit
    const title = (text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
    snapshot.title = title.slice(0, 200);
    const meta = {};
    for (const m of text.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["']/gi)) {
      if (!meta[m[1]]) meta[m[1]] = m[2].slice(0, 150);
    }
    snapshot.meta = meta;
    const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 15);
    snapshot.scripts = scripts;
    const links = [...text.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 15);
    snapshot.links = links;
  } catch (e) {
    snapshot.error = String(e.message || e).slice(0, 200);
  }

  // if we have a brain key, analyze the snapshot with the LLM
  let analysis = null;
  if (env.CONCENTRATE_API_KEY) {
    analysis = await llmAnalyze(snapshot, env);
  }
  return json({ snapshot, analysis });
}

async function llmAnalyze(snapshot, env) {
  const sys = "You are Autogum CTO, an autonomous open-source AI agent doing defensive security auditing. Review the website snapshot. Report ONLY: (1) concrete issues found (missing security headers, outdated patterns, exposed info), (2) what's OK, (3) prioritized fixes. Be concise, no fluff, no exploit code. If nothing notable, say the site looks clean and name 1-2 things worth checking.";
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

// ---------- status ----------
async function handleStatus(env) {
  const tasks = TASKS.map((t, i) => `${i + 1}. ${t}`);
  return json({ busy: true, tasks });
}

// ---------- webhook (Gumroad) ----------
async function handleWebhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  // Gumroad webhook: sale.paid → grant the buyer paid messages
  // (verify signature in production: shared secret from Gumroad settings)
  const visitor = (body && body.email) || null;
  if (visitor) {
    await grantPaid(visitor, env, 10); // grant 10 messages per payment
  }
  return json({ ok: true });
}

// ---------- helpers ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function getVisitor(request, env) {
  // cookie "vid"
  const cookie = (request.headers.get("cookie") || "").match(/vid=([^;]+)/);
  if (cookie) return cookie[1];
  // fallback: ip
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  return "ip_" + ip;
}

async function countMessages(visitor, env) {
  try {
    const v = await env.AUTOGUM.get(visitor, "json");
    if (!v) return { free_used: 0, paid_used: 0, total: 0 };
    return { free_used: v.free || 0, paid_used: v.paid || 0, total: (v.free || 0) + (v.paid || 0) };
  } catch { return { free_used: 0, paid_used: 0, total: 0 }; }
}

async function bumpMessages(visitor, env, kind) {
  try {
    const v = (await env.AUTOGUM.get(visitor, "json")) || {};
    if (kind === "free") v.free = (v.free || 0) + 1;
    else v.paid = (v.paid || 0) + 1;
    v.updated = Date.now();
    await env.AUTOGUM.put(visitor, JSON.stringify(v));
  } catch { /* kv not available in dev without binding */ }
}

async function grantPaid(visitor, env, n) {
  try {
    const v = (await env.AUTOGUM.get(visitor, "json")) || {};
    v.paid = (v.paid || 0) + n;
    await env.AUTOGUM.put(visitor, JSON.stringify(v));
  } catch { }
}

async function callBrain(message, env, used) {
  // 1) detect a URL in the message → audit it first
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const audit = await fetch(new Request("https://autogum.invalid/api/audit", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: urlMatch[0] }),
    })).catch(() => null);
    // audit needs the brain key to analyze — if no key, fall through to brain
    if (audit && audit.ok) {
      const d = await audit.json();
      if (d.analysis && d.analysis.report) {
        return "🔍 Audit of " + urlMatch[0] + ":\n\n" + d.analysis.report;
      }
    }
  }

  // 2) real LLM brain (concentrate) if key set
  if (env.CONCENTRATE_API_KEY) {
    try {
      const sys = "You are Autogum CTO, an autonomous open-source AI agent. You help with tasks: security audits, code fixes, setup questions. Be concise, practical, honest. Never produce exploit code. If the user pasted a link, you will also receive an audit snapshot.";
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
        const content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
        return content.slice(0, 3000);
      }
    } catch { /* fall through */ }
  }

  // 3) fallback
  return "I got your message: \"" + message.slice(0, 120) + "\". My brain backend isn't wired up yet (set CONCENTRATE_API_KEY as a secret and I'll do real work). This is the demo fallback.";
}

function randomPrice() { return PRICES[Math.floor(Math.random() * PRICES.length)]; }
function randomTask() { return TASKS[Math.floor(Math.random() * TASKS.length)]; }

// ---------- UI ----------
const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Autogum CTO</title>
<style>
:root{--bg:#0b0d12;--panel:#12151d;--panel2:#171b26;--line:#232a3a;--txt:#e8ecf4;--dim:#8b94a7;--green:#34d399;--amber:#fbbf24;--blue:#60a5fa;--red:#f87171}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{width:min(560px,100%);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px}
h1{font-size:22px;display:flex;align-items:center;gap:10px}
h1 .dot{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#60a5fa,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:18px}
.sub{color:var(--dim);font-size:13px;margin:8px 0 18px}
.chat{background:var(--panel2);border:1px solid var(--line);border-radius:12px;height:320px;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:85%;padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.45;white-space:pre-wrap}
.me{align-self:flex-end;background:var(--blue);color:#04121f}
.bot{align-self:flex-start;background:#1e293b;color:var(--txt)}
.bot.paywall{border:1px solid var(--amber)}
.used{color:var(--dim);font-size:11px;margin-top:8px}
.inputrow{display:flex;gap:8px;margin-top:12px}
input{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--txt);padding:11px 12px;font-size:14px;outline:none}
input:focus{border-color:var(--blue)}
button{padding:11px 18px;border:none;border-radius:9px;background:var(--blue);color:#04121f;font-weight:700;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
.paybox{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:10px;padding:12px;margin-top:10px;font-size:13px}
.paybox a{color:var(--amber);font-weight:700}
</style>
</head>
<body>
<div class="card">
  <h1><span class="dot">🦞</span> Autogum CTO</h1>
  <div class="sub">Open source · MIT licensed. Autonomous self-improving AI agent. 4 free messages, then I get busy. Paste a link, ask a task, I'll audit or fix it.</div>
  <div class="chat" id="chat"></div>
  <div class="used" id="used">4 free messages left</div>
  <div class="inputrow">
    <input id="inp" placeholder="Paste a link or describe a task…" autocomplete="off">
    <button id="send">Send</button>
  </div>
  <div class="paybox" id="paybox" style="display:none"></div>
</div>
<script>
const chat=document.getElementById('chat'),inp=document.getElementById('inp'),send=document.getElementById('send'),used=document.getElementById('used'),paybox=document.getElementById('paybox');
let freeLeft=4;
function add(text,who,paywall){
  const d=document.createElement('div');d.className='msg '+who+(paywall?' paywall':'');d.textContent=text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;
}
async function go(){
  const m=inp.value.trim();if(!m)return;
  add(m,'me');inp.value='';send.disabled=true;
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:m})});
    const d=await r.json();
    if(d.paywall){
      add(d.message,'bot',true);
      paybox.style.display='block';
      paybox.innerHTML='<b>Busy.</b> '+(d.pay_link?'<a href="'+d.pay_link+'" target="_blank">Pay $'+d.price+' on Gumroad</a>':'Quote: $'+d.price+' (payment link coming)')+' — then I continue your task.';
      used.textContent='Paywall reached — pay to continue';
      send.disabled=false;return;
    }
    add(d.reply||'(no reply)','bot');
    if(typeof d.remaining_free==='number'){freeLeft=d.remaining_free;used.textContent=freeLeft>0?freeLeft+' free messages left':'Paywall next message';}
  }catch(e){add('Error: '+e.message,'bot')}
  send.disabled=false;
}
send.onclick=go;inp.onkeydown=e=>{if(e.key==='Enter')go()};
add("Hi, I'm Autogum CTO 🦞 — an autonomous, open-source AI agent. Paste a link and I'll audit it, or describe a task and I'll fix it. What do you have?","bot");
</script>
</body>
</html>`;
