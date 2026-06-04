"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createModelCatalog } = require("../src/model-catalog");

const openrouter = { modelsUrl: "https://openrouter.ai/api/v1/models", referer: "https://a1.am", title: "A1" };

test("createModelCatalog validates its injected deps", () => {
  assert.throws(() => createModelCatalog({}), /safeFetch/);
  assert.throws(() => createModelCatalog({ safeFetch: () => {} }), /isEgressAllowed/);
  assert.throws(() => createModelCatalog({ safeFetch: () => {}, isEgressAllowed: () => true }), /modelsUrl/);
});

test("listModels returns live models when egress is allowed (and calls the injected url)", async () => {
  let calledUrl = "";
  const safeFetch = async url => { calledUrl = url; return { ok: true, status: 200, json: async () => ({ data: [{ id: "a/b", name: "A" }] }) }; };
  const cat = createModelCatalog({ safeFetch, isEgressAllowed: () => true, openrouter });
  const out = await cat.listModels({ apiKey: "k" });
  assert.strictEqual(out.online, true);
  assert.strictEqual(out.source, "live");
  assert.strictEqual(out.models[0].id, "a/b");
  assert.strictEqual(calledUrl, openrouter.modelsUrl);
});

test("listModels falls back (never calls fetch) when egress is blocked", async () => {
  let called = false;
  const safeFetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const cat = createModelCatalog({ safeFetch, isEgressAllowed: () => false, openrouter });
  const out = await cat.listModels();
  assert.strictEqual(out.online, false);
  assert.strictEqual(out.source, "fallback");
  assert.strictEqual(out.reason, "egress-blocked");
  assert.ok(out.models.length >= 1);
  assert.strictEqual(called, false);
});

test("listModels falls back on http error and on an empty list", async () => {
  const http = createModelCatalog({ safeFetch: async () => ({ ok: false, status: 503, json: async () => ({}) }), isEgressAllowed: () => true, openrouter });
  assert.strictEqual((await http.listModels()).reason, "http-503");
  const empty = createModelCatalog({ safeFetch: async () => ({ ok: true, json: async () => ({ data: [] }) }), isEgressAllowed: () => true, openrouter });
  assert.strictEqual((await empty.listModels()).reason, "empty-list");
});

test("listModels degrades to fallback (never throws) when fetch throws", async () => {
  const cat = createModelCatalog({ safeFetch: async () => { const e = new Error("net"); e.code = "ENOTFOUND"; throw e; }, isEgressAllowed: () => true, openrouter });
  const out = await cat.listModels();
  assert.strictEqual(out.source, "fallback");
  assert.strictEqual(out.reason, "ENOTFOUND");
});
