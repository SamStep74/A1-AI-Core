# @a1/ai

Shared, **framework-agnostic** AI provider core for the **A1** product family
(Suite, HayHashvapah, CRM, Platform, …). One source of truth so every product
gets the same OpenRouter integration, model policy, local settings store, and
the opt-in Open Notebook connector — no per-repo drift.

This package performs **no LLM calls itself** and imports **no product config**.
Every capability that touches the outside world (HTTP/egress) or the filesystem
(the data dir) is **injected** by the host product.

## What it provides

| Area | Export | Notes |
|------|--------|-------|
| Model menu | `createModelCatalog({ safeFetch, isEgressAllowed, openrouter })` → `listModels()` | Live OpenRouter `/models`; degrades to `FALLBACK_MODELS` (never throws) when egress is blocked or the call fails. |
| Model policy | `resolveModelForRequest(policy, { aspect, module })` | Pure precedence: **module → aspect → default → "" (auto)**. |
| Local settings | `createSettingsStore({ resolveDataDir, modelKeys, defaultModels })` | `0600` JSON: OpenRouter key + per-aspect model policy + Open Notebook connector. `redactedForClient()` strips secrets to `*Set` booleans. |
| Open Notebook | `createOpenNotebook({ safeFetch })` → `isEnabled()` / `search()` | Opt-in, egress-gated, **non-throwing** (`[]` on any failure). Results normalized to the common RAG shape. |
| Supplemental | `normalizeSupplementalSources(rows)` | Advisory-only ranking/dedupe/cap. **Never** treat as authoritative citations. |

## Consuming it (per product)

```js
const { createAi } = require("@a1/ai");

const ai = createAi({
  safeFetch: config.safeFetch,                        // (url, options, env) => Promise<Response>, egress-gated
  isEgressAllowed: config.isOpenRouterEgressAllowed,  // (env) => boolean
  openrouter: config.openrouter,                      // { modelsUrl, referer, title }
  resolveDataDir: config.resolveDataDir,              // () => string (dir for ai-settings.json)
  defaultModels: config.aiModels                      // { default, copilot, transform, finance, crm, docs }
});

await ai.listModels({ apiKey });                      // onboarding model menu
ai.settings.updateSettings({ openrouterApiKey, models, openNotebook });
const policy = ai.settings.resolveModelPolicy();
const model  = ai.resolveModelForRequest(policy, { aspect: "copilot" });
const extra  = await ai.openNotebook.search(question, { settings: ai.settings.getSettings() });
const shown  = ai.normalizeSupplementalSources(extra);
```

Install via a local path or git (no public registry needed — sovereign/local-first):

```
npm install file:../A1-AI-Core      # sibling checkout
# or
npm install git+https://github.com/SamStep74/A1-AI-Core.git
```

## Security / sovereignty contract

- **Egress stays the host product's responsibility.** This package only calls the
  `safeFetch`/`isEgressAllowed` you inject — it cannot reach the network on its own.
  Keep your egress **deny-until-listed**; loopback (local RAG/embeddings) stays allowed.
- **Secrets never leave raw.** The OpenRouter key + Open Notebook key live only in the
  local `0600` settings file; send `redactedForClient()` to any browser.
- **Open Notebook is opt-in + non-authoritative.** Disabled unless configured; its hits
  are advisory and must never satisfy a required/authoritative citation in the host app.

## Test

```
npm test        # node --test, no dependencies
```

Pure Node, no runtime dependencies. Requires Node ≥ 22.5.
