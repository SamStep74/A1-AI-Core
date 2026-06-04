# Integrating `@a1/ai` into an A1 product

`@a1/ai` is the shared, framework-agnostic AI core for the A1 product family. It
performs **no LLM calls on its own** and imports **no product config** — every
capability that touches the network or the filesystem is **injected** by the host.
See [README.md](./README.md) for the full API.

This guide is the per-product consumption recipe used by the A1 suite.

## 1. Vendor it (current approach)

The family products are separate repos (no monorepo), and are local-first /
self-hostable, so `@a1/ai` is **vendored** rather than installed from a registry —
this avoids touching a shared `node_modules` and keeps deploys self-contained.

```bash
mkdir -p <repo>/<lib|src>/vendor/a1-ai/src
cp A1-AI-Core/index.js   <repo>/<lib|src>/vendor/a1-ai/index.js
cp A1-AI-Core/src/*.js   <repo>/<lib|src>/vendor/a1-ai/src/
```

Record the source commit in a `VENDOR.md` next to it, and re-vendor (copy + bump
the commit) when `@a1/ai` changes. **Do not edit the vendored copy in place.**

> Alternative for a future ESM/TypeScript product: publish `@a1/ai` and
> `npm install` it, or point the product's Vercel `ai` SDK at OpenRouter via
> `@openrouter/ai-sdk-provider`. The vendored CommonJS path is for the CommonJS
> products (Suite, HayHashvapah, CRM, Platform).

## 2. Wire it once (dependency injection)

```js
const { createAi } = require("./vendor/a1-ai");

const ai = createAi({
  // egress-gated fetch: enforce your deny-until-listed allowlist inside this fn
  safeFetch: (...args) => config.safeFetch(...args),     // or (...a) => fetch(...a)
  isEgressAllowed: (env) => config.isOpenRouterEgressAllowed(env), // or () => true
  openrouter: { modelsUrl, baseUrl, referer, title },
  resolveDataDir: () => config.resolveDataDir(),          // where ai-settings.json lives
  defaultModels: config.aiModels                          // env default per aspect
});
```

**Inject deferring wrappers** (`(...a) => config.safeFetch(...a)`), not
`config.safeFetch` captured at module load — otherwise runtime monkeypatching
(used by tests) and env-driven egress changes won't take effect.

## 3. Use it

| Need | Call |
|------|------|
| Live model menu (onboarding dropdown) | `await ai.listModels({ apiKey })` |
| Resolve which model a request uses | `ai.resolveModelForRequest(policy, { aspect, module })` |
| Local settings (key + per-aspect models + Open Notebook) | `ai.settings.{getSettings,updateSettings,redactedForClient,resolveModelPolicy}` |
| Text generation | `await ai.chat.callModel({ instructions, input, model, apiKey, maxTokens })` |
| Vision | `await ai.chat.callVision({ instructions, input, imageBase64, mimeType, model, apiKey })` |
| **Structured JSON** output | `await ai.chat.callStructured({ instructions, input, schema, schemaName, strict, model, apiKey, maxTokens })` |
| Opt-in Open Notebook retrieval | `await ai.openNotebook.search(query, { settings })` |
| Rank supplemental (advisory) sources | `ai.normalizeSupplementalSources(rows)` |

### Notes that bite

- **Secrets**: send `ai.settings.redactedForClient()` to browsers — never the raw key.
- **`callStructured` is model-dependent**: only models that support `response_format
  json_schema` honor the schema (e.g. `openai/gpt-4o*`). Keep a fallback for
  `AI_BAD_JSON`.
- **`maxTokens` defaults to 1200** — raise it for large structured outputs or they
  truncate into invalid JSON.
- **Open Notebook + structured calls are advisory** — never let them satisfy an
  authoritative/required citation.

## Reference integrations

- **Suite** — copilot uses OpenRouter + Open Notebook supplemental sources (egress-gated).
- **HayHashvapah** — `callModel`/`callVision` + admin live-model UI.
- **CRM** — `callStructured` for the AI CRM-designer blueprint.
- **A1-Platform** — advisory admin assistant (`callModel`, aggregate context only).
