"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSettingsStore } = require("../src/settings-store");

function freshStore(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1ai-store-"));
  return createSettingsStore({ resolveDataDir: () => dir, defaultModels: { copilot: "env/copilot" }, ...extra });
}

test("createSettingsStore requires resolveDataDir", () => {
  assert.throws(() => createSettingsStore({}), /resolveDataDir/);
});

test("defaults: empty key, all model keys present, open notebook off", () => {
  const s = freshStore().getSettings();
  assert.strictEqual(s.openrouterApiKey, "");
  assert.deepStrictEqual(Object.keys(s.models).sort(), ["copilot", "crm", "default", "docs", "finance", "transform"]);
  assert.strictEqual(s.openNotebook.enabled, false);
});

test("update merges + trims + strips trailing slash; persists across reads", () => {
  const store = freshStore();
  store.updateSettings({ openrouterApiKey: "  sk-or-x  ", models: { copilot: " a/b " }, openNotebook: { enabled: true, baseUrl: "https://nb.a1.am/", apiKey: " on " } });
  const s = store.getSettings();
  assert.strictEqual(s.openrouterApiKey, "sk-or-x");
  assert.strictEqual(s.models.copilot, "a/b");
  assert.strictEqual(s.openNotebook.baseUrl, "https://nb.a1.am");
  assert.strictEqual(s.openNotebook.apiKey, "on");
});

test("redactedForClient hides secrets as *Set booleans, keeps non-secret config", () => {
  const store = freshStore();
  store.updateSettings({ openrouterApiKey: "sk-or-secret", openNotebook: { enabled: true, baseUrl: "https://nb.a1.am", apiKey: "on-secret" } });
  const r = store.redactedForClient();
  assert.strictEqual(r.openrouterApiKeySet, true);
  assert.strictEqual(r.openrouterApiKey, undefined);
  assert.strictEqual(r.openNotebook.apiKey, undefined);
  assert.strictEqual(r.openNotebook.apiKeySet, true);
  assert.strictEqual(r.openNotebook.baseUrl, "https://nb.a1.am");
});

test("resolveModelPolicy: stored selection wins, else injected default, else auto", () => {
  const store = freshStore();
  let p = store.resolveModelPolicy();
  assert.strictEqual(p.copilot, "env/copilot", "falls back to injected default");
  assert.strictEqual(p.finance, "", "no default -> auto");
  store.updateSettings({ models: { copilot: "stored/win" } });
  assert.strictEqual(store.resolveModelPolicy().copilot, "stored/win", "stored overrides default");
});

test("the settings file is written with 0600 perms", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1ai-perm-"));
  createSettingsStore({ resolveDataDir: () => dir }).updateSettings({ openrouterApiKey: "x" });
  const mode = fs.statSync(path.join(dir, "ai-settings.json")).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test("custom modelKeys are honored", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1ai-keys-"));
  const s = createSettingsStore({ resolveDataDir: () => dir, modelKeys: ["default", "vision"] }).getSettings();
  assert.deepStrictEqual(Object.keys(s.models).sort(), ["default", "vision"]);
});
