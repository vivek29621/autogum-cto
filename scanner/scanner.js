// Autogum CTO — Agent Security Scanner core (open-source)
// ghost in the wires — kevin mitnick
//
// Scans AI agent configs / skill files / MCP setups for risky patterns:
//   - exposed secrets (keys, tokens)
//   - dangerous tool calls (curl | rm | eval | base64 | exec)
//   - prompt-injection patterns in skill text
//   - suspicious external URLs / exfiltration endpoints
//   - overly-permissive permissions
// Returns findings: { severity, category, location, detail, fix }

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "OpenAI API key", "high", "Remove the key and rotate it. Load from env/secret store instead."],
  [/ghp_[A-Za-z0-9]{20,}/g, "GitHub PAT", "high", "Remove + revoke. Use fine-grained tokens or SSH."],
  [/AKIA[0-9A-Z]{16}/g, "AWS access key", "high", "Remove + rotate. Use IAM roles."],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, "Slack token", "high", "Remove + rotate."],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "Private key", "critical", "Remove immediately. This is a credential."],
  [/password\s*[:=]\s*["'][^"']{4,}["']/gi, "Hardcoded password", "high", "Remove. Use secrets manager / env."],
  [/cfat_[A-Za-z0-9_-]{20,}/g, "Cloudflare API token", "high", "Remove + rotate."],
];

const DANGEROUS_TOOLS = [
  [/rm\s+-rf/g, "Recursive delete", "high", "Destructive — blocks data loss / host damage."],
  [/\beval\s*\(/g, "eval()", "high", "Arbitrary code execution."],
  [/\bexec\s*\(/g, "exec()", "medium", "Shell execution — verify command allowlist."],
  [/child_process/g, "child_process", "medium", "Shell access — scope to least privilege."],
  [/\bbase64\s*-d/g, "base64 decode", "medium", "Common obfuscation for payloads."],
  [/curl\s+.*\|\s*(bash|sh)/g, "curl|bash pipe", "critical", "Remote code execution — classic supply-chain attack."],
  [/wget\s+.*-O\s*-\s*\|\s*(bash|sh)/g, "wget|bash pipe", "critical", "Remote code execution."],
  [/chmod\s+\+?x/g, "chmod +x", "low", "Makes files executable — verify intent."],
];

const INJECTION_PATTERNS = [
  [/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompt)/gi, "Prompt-injection (ignore previous)", "medium", "Skill text tries to override instructions — malicious."],
  [/system\s*:\s*you\s+are/gi, "System prompt override", "medium", "Skill tries to redefine agent persona."],
  [/exfil|exfiltrate|send\s+to\s+attacker/gi, "Exfiltration intent", "high", "Suspicious data-sending language."],
  [/\bdo\s+not\s+(tell|reveal|show)\b/gi, "Secrecy instruction", "medium", "Tries to hide activity from user."],
];

const URL_PATTERNS = [
  [/https?:\/\/(?!.*(?:github\.com|npmjs\.com|pypi\.org|docs\.|example\.com|localhost|127\.0\.0\.1|wikipedia|stackoverflow|mozilla|w3\.org|json-schema|schema\.org))[a-z0-9.-]+\.[a-z]{2,}/gi, "External URL", "low", "Verify the destination is trusted."],
  [/https?:\/\/(\d{1,3}\.){3}\d{1,3}/g, "Raw-IP URL", "medium", "IP-based endpoints often hide infrastructure."],
  [/webhook\.site|requestbin|pipedream|interact\.sh|oast\.(pro|online|site|fun|me)/gi, "Webhook/exfil collector", "high", "Known exfiltration-testing domains."],
];

const PERMISSIONS_PATTERNS = [
  [/permissions?\s*[:=]\s*["']?(read|write|admin|all|full|root)/gi, "Over-permissive permissions", "medium", "Least privilege: scope to what the agent needs."],
  [/"tools"\s*:\s*\[[^\]]*"*"\]/g, "Empty tools allowlist", "low", "Empty allowlist may mean unrestricted tool access."],
];

function scan(text, filename = "unknown") {
  const findings = [];
  const lines = text.split("\n");
  const add = (severity, category, detail, fix, line) => {
    findings.push({ severity, category, detail, fix, file: filename, line });
  };

  // secrets
  for (const [re, name, sev, fix] of SECRET_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const line = 1 + text.slice(0, m.index).split("\n").length - 1;
      add(sev, "secret", name, fix, line);
      // don't loop forever on zero-length
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // dangerous tools
  for (const [re, name, sev, fix] of DANGEROUS_TOOLS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const line = 1 + text.slice(0, m.index).split("\n").length - 1;
      add(sev, "dangerous-tool", name, fix, line);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // injection
  for (const [re, name, sev, fix] of INJECTION_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const line = 1 + text.slice(0, m.index).split("\n").length - 1;
      add(sev, "injection", name, fix, line);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // urls
  for (const [re, name, sev, fix] of URL_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const line = 1 + text.slice(0, m.index).split("\n").length - 1;
      add(sev, "url", name, fix, line);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // permissions
  for (const [re, name, sev, fix] of PERMISSIONS_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const line = 1 + text.slice(0, m.index).split("\n").length - 1;
      add(sev, "permissions", name, fix, line);
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  // dedupe (same category+detail+line)
  const seen = new Set();
  const uniq = findings.filter(f => {
    const k = f.category + "|" + f.detail + "|" + f.line;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // summary
  const bySev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of uniq) bySev[f.severity] = (bySev[f.severity] || 0) + 1;

  return {
    scanned: { file: filename, chars: text.length, lines: lines.length },
    summary: bySev,
    total: uniq.length,
    findings: uniq.slice(0, 100), // cap output
    safe: uniq.length === 0,
  };
}

module.exports = { scan };
