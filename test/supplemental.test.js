"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { normalizeSupplementalSources, MAX_SUPPLEMENTAL_SOURCES } = require("../src/supplemental");

test("returns [] for non-array / empty input", () => {
  assert.deepStrictEqual(normalizeSupplementalSources(undefined), []);
  assert.deepStrictEqual(normalizeSupplementalSources(null), []);
  assert.deepStrictEqual(normalizeSupplementalSources("nope"), []);
  assert.deepStrictEqual(normalizeSupplementalSources([]), []);
});

test("drops rows with no usable text", () => {
  const out = normalizeSupplementalSources([
    { title: "Empty", text: "   ", score: 0.9 },
    { title: "Good", text: "ok", score: 0.5 }
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, "Good");
});

test("sorts by score desc and caps to MAX_SUPPLEMENTAL_SOURCES", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ title: `N${i}`, text: `c ${i}`, score: i / 10 }));
  const out = normalizeSupplementalSources(rows);
  assert.strictEqual(out.length, MAX_SUPPLEMENTAL_SOURCES);
  assert.strictEqual(out[0].title, "N7");
  assert.ok(out[0].score >= out[1].score);
});

test("dedupes by sourceUrl (highest score wins); by title when no url", () => {
  const byUrl = normalizeSupplementalSources([
    { title: "Low", text: "b", score: 0.2, sourceUrl: "u" },
    { title: "High", text: "a", score: 0.9, sourceUrl: "u" }
  ]);
  assert.strictEqual(byUrl.length, 1);
  assert.strictEqual(byUrl[0].title, "High");
  const byTitle = normalizeSupplementalSources([
    { title: "VAT Guide", text: "a", score: 0.9 },
    { title: " vat guide ", text: "b", score: 0.8 }
  ]);
  assert.strictEqual(byTitle.length, 1);
});

test("tags rows advisory/open-notebook and truncates the excerpt", () => {
  const out = normalizeSupplementalSources([{ title: "Long", text: "x".repeat(600), score: 1, sourceUrl: "u1" }]);
  assert.strictEqual(out[0].origin, "open-notebook");
  assert.strictEqual(out[0].advisory, true);
  assert.ok(out[0].excerpt.length <= 300);
});
