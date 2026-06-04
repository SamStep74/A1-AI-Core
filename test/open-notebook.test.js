"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createOpenNotebook, isEnabled, normalizeResults } = require("../src/open-notebook");

const enabled = (extra = {}) => ({ openNotebook: { enabled: true, baseUrl: "https://nb.a1.am", apiKey: "on-key", ...extra } });

test("isEnabled requires enabled + baseUrl", () => {
  assert.strictEqual(isEnabled({ openNotebook: { enabled: true, baseUrl: "https://nb.a1.am" } }), true);
  assert.strictEqual(isEnabled({ openNotebook: { enabled: false, baseUrl: "https://nb.a1.am" } }), false);
  assert.strictEqual(isEnabled({ openNotebook: { enabled: true, baseUrl: "" } }), false);
  assert.strictEqual(isEnabled({}), false);
});

test("normalizeResults tolerates {results|sources|data|array} and drops empty text", () => {
  const rows = [{ title: "A", text: "x", score: 0.5, url: "u" }, { name: "B", content: "" }];
  assert.strictEqual(normalizeResults({ results: rows }).length, 1);
  assert.strictEqual(normalizeResults({ sources: rows }).length, 1);
  assert.strictEqual(normalizeResults({ data: rows }).length, 1);
  assert.strictEqual(normalizeResults(rows).length, 1);
  const r = normalizeResults({ results: [{ title: "A", content: "hello", relevance: 0.7, source_url: "s" }] })[0];
  assert.strictEqual(r.text, "hello");
  assert.strictEqual(r.score, 0.7);
  assert.strictEqual(r.sourceUrl, "s");
  assert.strictEqual(r.origin, "open-notebook");
});

test("createOpenNotebook validates safeFetch", () => {
  assert.throws(() => createOpenNotebook({}), /safeFetch/);
});

test("search returns [] when disabled or empty query (without calling fetch)", async () => {
  let called = false;
  const on = createOpenNotebook({ safeFetch: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  assert.deepStrictEqual(await on.search("q", { settings: { openNotebook: { enabled: false } } }), []);
  assert.deepStrictEqual(await on.search("   ", { settings: enabled() }), []);
  assert.strictEqual(called, false);
});

test("search posts to baseUrl+path, bearer-auths, normalizes; non-throwing on error", async () => {
  let seen = {};
  const on = createOpenNotebook({ safeFetch: async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ results: [{ title: "N", content: "hit", score: 0.9, url: "https://nb.a1.am/n/1" }] }) }; } });
  const out = await on.search("vat", { settings: enabled(), k: 4 });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, "N");
  assert.strictEqual(seen.url, "https://nb.a1.am/api/search");
  assert.strictEqual(seen.opts.headers.Authorization, "Bearer on-key");
  assert.deepStrictEqual(JSON.parse(seen.opts.body), { query: "vat", limit: 4 });

  const broken = createOpenNotebook({ safeFetch: async () => { throw new Error("net"); } });
  assert.deepStrictEqual(await broken.search("q", { settings: enabled() }), []);
  const notOk = createOpenNotebook({ safeFetch: async () => ({ ok: false, status: 500 }) });
  assert.deepStrictEqual(await notOk.search("q", { settings: enabled() }), []);
});
