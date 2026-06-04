"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { normalizeModels, resolveModelForRequest, FALLBACK_MODELS, MODEL_KEYS } = require("../src/model-policy");

test("normalizeModels maps an OpenRouter payload to the A1 shape and skips invalid rows", () => {
  const out = normalizeModels({ data: [
    { id: "a/b", name: "A B", context_length: 1000, pricing: { prompt: "1", completion: "2" } },
    { id: "c/d" },          // no name -> id; no pricing -> nulls
    { name: "no id" },      // dropped (no id)
    null                     // dropped
  ]});
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0], { id: "a/b", name: "A B", contextLength: 1000, pricing: { prompt: "1", completion: "2" } });
  assert.strictEqual(out[1].name, "c/d");
  assert.deepStrictEqual(out[1].pricing, { prompt: null, completion: null });
});

test("normalizeModels returns [] for non-array payloads", () => {
  assert.deepStrictEqual(normalizeModels(null), []);
  assert.deepStrictEqual(normalizeModels({}), []);
  assert.deepStrictEqual(normalizeModels({ data: "x" }), []);
});

test("resolveModelForRequest precedence: module > aspect > default > auto", () => {
  const policy = { default: "d/m", copilot: "c/m", finance: "f/m" };
  assert.strictEqual(resolveModelForRequest(policy, { module: "finance", aspect: "copilot" }), "f/m");
  assert.strictEqual(resolveModelForRequest(policy, { aspect: "copilot" }), "c/m");
  assert.strictEqual(resolveModelForRequest(policy, { module: "crm" }), "d/m", "unset module falls through to default");
  assert.strictEqual(resolveModelForRequest({}, { aspect: "copilot" }), "", "nothing set -> auto");
  assert.strictEqual(resolveModelForRequest(policy, { aspect: "unknown" }), "d/m", "unknown aspect ignored -> default");
});

test("FALLBACK_MODELS + MODEL_KEYS are stable shapes", () => {
  assert.ok(FALLBACK_MODELS.length >= 1 && FALLBACK_MODELS.every(m => m.id && m.name));
  assert.deepStrictEqual([...MODEL_KEYS], ["default", "copilot", "transform", "finance", "crm", "docs"]);
});
