// Autogum CTO — Agent Security Scanner unit tests
const test = require("node:test");
const assert = require("node:assert");
const { scan } = require("../scanner/scanner.js");

test("flags an exposed OpenAI API key", () => {
  const r = scan("api_key='sk-1234567890abcdefghijklmnop'", "agent.yaml");
  assert.strictEqual(r.safe, false);
  assert.ok(r.total >= 1);
  assert.ok(
    r.findings.some((f) => /key|token|secret/i.test(f.category)),
    "should flag a secrets-category finding"
  );
});

test("flags dangerous tool calls like rm -rf", () => {
  const r = scan("run the command: rm -rf /", "deploy.sh");
  assert.strictEqual(r.safe, false);
  assert.ok(r.findings.some((f) => f.category === "dangerous-tool"));
});

test("clean config is reported safe", () => {
  const r = scan("model: gpt-4o\nmax_tokens: 512\ntemperature: 0.2", "agent.yaml");
  assert.strictEqual(r.safe, true);
  assert.strictEqual(r.total, 0);
});

test("reports a summary with severity buckets", () => {
  const r = scan("sk-1234567890abcdefghijklmnop rm -rf / evalfrombase64", "mix.txt");
  assert.ok(r.summary.critical + r.summary.high + r.summary.medium + r.summary.low > 0);
  assert.strictEqual(r.total, r.findings.length);
});
