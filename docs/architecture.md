# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |
| Module checks | `specs/module-N/`, `scripts/check.mjs` | Each module's spec, instructions, rubric and acceptance tests; `npm run check` runs them |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```

## Module 2: Ask Copper

**Summary:** a floating chat panel that answers price and stock questions by
calling four tools, and shows each step (thinking, tool call, reply) as it
streams in. A tools-off chat shows what the same model does without them.

| Piece | Where | What it does |
|---|---|---|
| Page | `app/page.tsx` | Mounts the panel and passes `isAiConfigured()` down as a prop |
| Components | `components/copper/ask-copper.tsx`, `ask-copper-answer.tsx` | The launcher, the sheet, the two chats, and the stations and tool cards |
| Tools | `lib/copper/assistant/tools.ts` | `get_products`, `get_prices`, `calculate_cost`, `check_availability`; prices come from the catalog, stock from `readInventory()` |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper()` returns a live `Progress` at once and fills it from the model's stream |
| Instructions | `lib/copper/assistant/instructions.ts` | Copper's system prompt (tools on only) |
| Data | `lib/copper/data/inventory.json` | Stock list read fresh by `check_availability` |
| AI calls | `lib/ai/call.ts` (module 2, feature `ask-copper`) | Default Gemini model via `callStream`; one logged call per question |

**Data flow:** shopper question → panel → `askCopper()` Server Action →
`callStream` (model plus tools) → tool runs on the server → each stream part
becomes a `Progress` update → panel redraws.

**Decisions and trade-offs:** the action returns a plain-promise `Live` value
so updates stream without an API route. Tools on and off are separate chats so
the tools-off model can't copy an answer the tools worked out. With tools off
no instructions are sent: telling a model to use tools it doesn't have makes
it return nothing.

**Risks and open questions:** every question costs a model call, and the Server
Action is reachable by direct POST, so the request is validated and there is no
rate limit yet. With tools off the model can state invented prices as fact; the
panel labels those answers.
