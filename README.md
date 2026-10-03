# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

## Market data

Every figure is free and keyless except CoinMarketCap, which is optional.

A **market pulse** strip sits above the markets table: total capitalisation, 24h
volume, BTC/ETH dominance and the Fear & Greed index. Without it a coin's move
cannot be read — a 3% drop means one thing when the market is up and something
else when everything is down.

- **CoinGecko** `/global` — total cap, volume, dominance
- **alternative.me** — Fear & Greed, 90 days of history
- **Binance** — live prices over WebSocket, klines
- **Deribit** — perpetuals, funding, options OI and **implied volatility**.
- **Seven perpetual venues** — Binance, Bybit, OKX, Bitget, Hyperliquid, Deribit
  and MEXC, merged into one comparable board with funding, open interest, 24h
  volume and long/short ratios. Hyperliquid returns 178 coins in a single
  request; Bitget returns 813 contracts in two.
- **Liquidations** — Binance and OKX are the only two of the seven that publish
  a forced-close tape over REST, and it is keyless. The panel stacks longs sold
  out against shorts bought out per five-minute interval, because a cascade is a
  spike in a rate rather than a total anyone can read.
- **CoinMarketCap** — optional paid adapter for categories, exchanges and
  derivatives. Everything is null without a key and the app is complete anyway.

**Sources, costs and rate limits: [docs/market-data.md](docs/market-data.md).**

## Themes

Pearl (light), Obsidian (dark), Glass (frosted) and **Mixer** — Microsoft's
streaming platform, whose near-black violet-bloom look is the most expressive of
the four and the least legible for a dense table, so it cycles last.

**[docs/themes.md](docs/themes.md)** — what each theme is, how to add one, and why
`colors.ts` holds resolved colours rather than alpha.

## Design system

Everything visual is built from `src/components/ui`: `Panel`, `PanelSection`,
`PanelBox`, `Stat`, `StatGrid`, `Label`, `Meter`, `Pill`, `Dot`, plus a
`Tone` vocabulary.

Components take a **tone**, never a hex value — which is what makes theming work.
The app had four copies of the diverging meter and nine near-identical
label/value tiles scattered across seven feature files; they are now one of each.

**Rules, variants and how to add a primitive:
[docs/design-system.md](docs/design-system.md).**

## Derivatives

`/derivatives` is the desk, in the order a trader works it: **liquidations**
first because a cascade is over in minutes, the **cross-venue perps board**
second because it is positioning, **options and the term structure** last
because it is the slowest-moving and reads as context.

There is no such thing as "the" funding rate for a coin — seven venues quote
seven rates on two different settlement cycles. So every rate is restated to an
8-hour equivalent, weighted by open interest (a small venue quoting an extreme
rate moves almost no positions), and shown with the **dispersion** between venues
next to the average, because venues disagreeing is itself the signal.

Every venue sits behind one port (`services/derivatives/venue.port.ts`);
`VenueRegistry` is the only file that knows which adapter serves which venue.
Adding an eighth is a new adapter and one line.

**What it does not pretend to have:** four of the seven venues publish no
liquidations feed at all, and the panel says so by name. "Does not publish" is
reported differently from "did not answer", because collapsing the two would
blame a calm market for a timeout.

## Trading

The Iranian price board can place resting limit orders on Nobitex, Wallex, Bitpin
and Tabdeal, track holdings per venue, and watch for cross-venue spreads.

It starts in **paper mode**, where fills are simulated against each venue's real
order book. Set `TRADING_MODE=live` only after it has behaved correctly, and read
[docs/trading.md](docs/trading.md) first - in particular the section on what each
venue actually offers, because the leverage options differ sharply between them
and there is no leveraged Rial gold anywhere.

## Analysis page

The analysis page is scoped to a country. Pick **United States** or **Iran** and
everything below re-reads that country's economic news: the scorecard indices,
the hourly flow, the macro channels doing the work, and the price projection.
Switching country costs nothing upstream - the crawler already pulls the
Iranian wires, the Federal Reserve and the US wires, and the snapshot is
partitioned by outlet.

Every figure is derived from scored headlines, so each number traces back to a
headline. There is no model in that path.

### Local LLM (LM Studio or Ollama)

The country scorecard can be handed to a model for a second read - verdict,
confidence, direction odds and the channels it weights.

Nothing leaves the box by default. There is no cloud provider in the path unless
a key is set, so with no runtime listening the panel says so and the
deterministic forecast stands on its own.

Both **LM Studio** (`:1234`) and **Ollama** (`:11434`) speak the same
OpenAI-compatible dialect and are configured the same way:

```bash
LOCAL_LLM_BASE_URL="http://127.0.0.1:1234"   # or 11434 for Ollama
LOCAL_LLM_MODEL="qwen3-8b-instruct"
```

The reply is validated and clamped into range before it reaches the chart, so a
small model that quotes its numbers, returns a fenced block or lists too many
factors still produces a usable panel. A reply that cannot be parsed is shown
raw rather than discarded.

**Full setup, model suggestions and troubleshooting: [docs/local-llm.md](docs/local-llm.md).**

## Free cloud AI

Gemini, Groq and OpenRouter are already wired in. Set any one key in `.env`,
restart, and the analysis page and coin-status narrative will use it:

```bash
GEMINI_API_KEY="..."   # https://aistudio.google.com/apikey  — most generous free tier
GROQ_API_KEY="..."     # https://console.groq.com/keys       — fastest
OPENROUTER_API_KEY=""  # https://openrouter.ai/keys
```

A local runtime is preferred while one is loaded; the first key set takes over
when it is not. `AI_PROVIDER` pins a specific one, and the panel has a Runtime
dropdown for comparing two keys.

**Full setup, provider comparison and troubleshooting: [docs/cloud-ai.md](docs/cloud-ai.md).**

## AI service architecture

The AI layer is a standalone module under `src/services/ai` and follows the same
port-and-adapter shape the trading layer already uses. It imports nothing from
any feature, so the AI layer can be extended, swapped or deleted without a
domain knowing.

```
ai.port.ts                       the seam: AiProvider, AiError, shared types
BaseAiProvider                   abstract core: deadline, abort, status cache,
                                 validate + clamp, prose or JSON
  OpenAiCompatibleProvider       the OpenAI dialect (base URL, key, default model)
    LocalAiProvider              LM Studio
    OpenAiCompatibleVendor…      Groq, OpenRouter
  GeminiProvider                 extends the base directly, because it is not
                                 OpenAI-shaped
BaseAiSection                    abstract: one feature area's prompts + schema
  TextAiSection                  the prose variant, no schema
AiRegistry                       the one place that knows which runtime answers
```

Four layers, each with one job:

| Layer                      | Answers                           | Extended by                                  |
| -------------------------- | --------------------------------- | -------------------------------------------- |
| `AiProvider` (port)        | what any runtime can do           | every provider                               |
| `BaseAiProvider`           | what all runtimes do the same way | `OpenAiCompatibleProvider`, `GeminiProvider` |
| `OpenAiCompatibleProvider` | what the OpenAI dialect does      | LM Studio, Groq, OpenRouter                  |
| `BaseAiSection`            | what an AI-backed feature needs   | `AnalyzeAiService`, `StatusAiService`        |

**Sections are the extension point.** Adding a panel that needs a model is one
file that answers four questions and nothing else: what is it called, what does
the model read, what shape must the answer take, and what has to be forced into
shape afterwards. Everything else - which runtime answers, how long it gets, what
happens when it is switched off - is inherited.

```ts
export default class MyAiService extends BaseAiSection<MyContext, MyOutput> {
  readonly sectionId = "analyze" satisfies AiSectionId;
  protected readonly systemPrompt = "...";
  protected readonly schema = z.object({ ... });
  protected buildUserPrompt(context: MyContext): string { ... }
  protected normalise(output: MyOutput): MyOutput { ... }
}
```

Three conventions every section inherits and must keep:

- **A section never throws.** An unreachable or unhelpful model comes back as
  `data: null` with an `error`, because every caller has a deterministic answer
  to show instead and an exception would take that down too.
- **The output is validated before it leaves.** `normalise` is the last place a
  value can be forced into a shape no schema can express.
- **Per-section policy, not global.** Deadline, sampling and token budget are
  declared per section because they genuinely differ: the statuses narrative runs
  on a cron and needs 20 seconds, the macro read waits three minutes for a local
  model.

### Runtime preference

`AiRegistry.active()` picks the first _configured_ provider, and the order puts
the local runtime first. That is a product decision, not a preference: the point
of the page is that a read never has to leave the machine. Cloud keys still work
and are picked up automatically when no local model is loaded.

Every provider's reachability is available through `llm.status`, so the panel can
show that a local model is running _and_ that a cloud key is available, rather
than quietly switching to the cloud after a transient local hiccup.
