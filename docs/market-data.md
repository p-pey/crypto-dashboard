# Market data sources

Where every figure in the app comes from, and what each source costs.

## Summary

| Source                              | Used for                                       | Key needed     | Cost             |
| ----------------------------------- | ---------------------------------------------- | -------------- | ---------------- |
| CoinGecko                           | top-100 fundamentals, OHLC, **global metrics** | no             | Free public tier |
| Binance                             | live prices (WebSocket), klines                | no             | Free             |
| alternative.me                      | **Fear & Greed index**                         | no             | Free             |
| Yahoo Finance                       | ETF prices                                     | no             | Free, unofficial |
| Deribit                             | options, mark IV, perps, funding               | no             | Free             |
| Hyperliquid                         | perps board, funding, OI (178 coins, 1 call)  | no             | Free             |
| Bitget                              | perps board, funding, OI (813 symbols, 1 call) | no            | Free             |
| Bybit / OKX / MEXC                  | perps board, funding, OI, liquidations         | no             | Free             |
| CoinMarketCap                       | categories, exchanges, derivatives             | **yes, paid**  | Pro tier         |
| LM Studio / Ollama                  | local AI                                       | no             | Free             |
| Gemini / Groq / OpenRouter          | cloud AI                                       | yes            | Free tier        |
| nerkh.io                            | rial and gold prices                           | no             | Free             |
| Nobitex / Wallex / Bitpin / Tabdeal | Iranian venues                                 | yes, per venue | Free             |

Everything the app needs today is free. CoinMarketCap is the only optional
addition and it is not required.

---

## Global metrics

The strip above the markets table: total market capitalisation, 24h volume,
BTC/ETH dominance and the Fear & Greed index.

**`GET api.coingecko.com/api/v3/global`** — free, no key. This is the single most
useful thing the app was previously missing. Without it there is no way to tell
whether a coin's move was its own news or the whole market moving, which is the
difference between reading a number and interpreting it.

**`GET api.alternative.me/fng/?limit=90&format=json`** — free, no key. 90 days of
history for the trend.

Both are cached in-process (2 minutes and 10 minutes respectively) and served
from the last good read on failure, with the reason attached. A stale total
market cap is still honest; a blank one is not.

---

## Derivatives — the free CoinGlass

CoinGlass shows perpetuals, funding rates, open interest, liquidations and options
with implied volatility. It charges for that. **The same data is free from the
venues' own public endpoints**, which is what CoinGlass itself aggregates — so
this reads Deribit directly and gets the exchange's own numbers rather than a
third party's estimate.

| Endpoint                                                             | Gives                                   |
| -------------------------------------------------------------------- | --------------------------------------- |
| `deribit.com/api/v2/public/get_book_summary_by_currency?kind=future` | Perp OI, mark, index price              |
| `.../get_funding_rate_history`                                       | 24 hourly funding points                |
| `.../get_book_summary_by_currency?kind=option`                       | Option OI, **mark IV**, volume, strikes |

Reading it correctly took two fixes worth recording:

- **`BTC-PERPETUAL` is a two-part instrument name.** `BTC-24SEP27-60000-C` is
  four parts. A length check that only accepted four silently emptied the
  perps list.
- **Option `open_interest` is in the base currency, not USD.** A strike showing
  `1121.4` is 1121 BTC — about $95M at spot — where $1121 would be an
  implausibly small position. Converting with the venue's own spot gives ~$31B
  total, which is the right order of magnitude for Deribit BTC options.
  `volume_usd` _is_ reported directly, so volume needs no conversion.

### Why not Binance Futures too

Binance Futures and Bybit both expose the same data free, and would add the
liquidation stream. They are **geo-restricted**, and from a restricted region they
fail with a `403` rather than returning wrong numbers — so every venue is
settled independently and a partial answer reports what did not come back. If
they are reachable from where you run this, they are worth adding; the service is
structured to take more venues.

---

## Cross-venue perpetuals and liquidations

`/derivatives` reads seven perpetual venues and merges them into one comparable
board. Everything sits behind one port — `src/services/derivatives/venue.port.ts`
— and adding a venue is a new adapter plus one line in `venues/VenueRegistry.ts`.

| Venue | Perp metrics | Liquidations | Requests | Notes |
| --- | --- | --- | --- | --- |
| Binance Futures | funding, OI, mark, **long/short + taker ratio** | **yes, complete tape** | 1 + 3/coin | `allForceOrders` is authoritative |
| Bybit | funding, OI **in USD**, volume | no — websocket only | 1 | whole linear board |
| OKX | funding, OI, index | **yes**, with bankruptcy price | 2 + 2/coin | contracts → coins needs `ctVal` |
| Bitget | funding, OI, mark, volume | no — REST 404 | 2 | whole board |
| Hyperliquid | funding, OI, mark, volume | no — nothing published | 1 | 178 coins in one POST |
| Deribit | funding, OI **already USD**, mark | no — risk engine closes silently | 1/coin | rejects `currency=any` |
| MEXC | funding, cycle, price | no — 403 at the edge | 2/coin | capped at 4 coins |

### Normalising the comparison

There is no such thing as "the" funding rate for a coin. Seven venues quote
seven rates on **two different settlement cycles**, so the aggregate:

- restates every rate to an **8-hour equivalent** before comparing — Hyperliquid
  settles hourly, and unnormalised it reads as a quarter of the market;
- weights by **open interest**, because a small venue quoting an extreme rate
  moves almost no positions and an unweighted mean lets it speak for the market;
- reports **dispersion** (highest minus lowest venue) next to the average, since
  venues disagreeing is itself the signal.

A venue whose settlement cycle is unknown is dropped rather than assumed to be
8h. An assumed cycle is a wrong number wearing a real one.

### Unit traps, recorded

- **Open interest arrives in four different units.** Hyperliquid and Bitget report
  base-coin amount, Deribit reports USD on the *same endpoint* where the option
  rows report base currency, OKX reports contracts plus an explicit `oiUsd`.
- **Bybit's funding interval field is `fundingIntervalHour`** — singular, no `s`.
  Reading it as `fundingInterval` returns `undefined`, which silently drops Bybit
  from every weighted funding average on the board.
- **OKX liquidation sizes are contracts**, and `ctVal` differs per instrument
  (0.01 BTC, usually 1 for alts). Treating `sz` as coins overstates every alt's
  liquidation by orders of magnitude.
- **A Binance force-order `side` is the aggressor, not the liquidated side.** A
  SELL means a *long* was closed. Reading it straight inverts the long/short
  split, which is the one figure a reader trusts immediately.
- **OKX liquidation `posSide: net`** means the venue netted the position off
  first; there is no side to report and guessing one corrupts the split.

### Why the liquidations panel names its sources

Only two of seven venues publish a forced-close tape at all. Deribit,
Hyperliquid, Bitget and MEXC publish nothing — so the panel lists those four as
**unsupported** (an industry fact) and separately names the ones that **failed**
(a network fact). Collapsing those two states would blame the market for a
timeout.

`VenueReport` is a component rather than a line of text for exactly this reason.
And the totals are explicitly *the liquidations these venues saw*: a cascade in
Deribit's silently-closed book is real money that will not appear in the figure,
so the number is named, not implied to be the whole market.

Deriving the figure from the trade tape would be possible and would be a lie: a
large market sell and a forced close print identically, and the difference
between them is the entire content of the panel.

> **Note on reachability.** Binance, Bybit and OKX are geo-restricted. From a
> restricted region they fail with a `403` or time out, and the panel shows that
> honestly rather than showing a partial board as a complete one. Deployed
> somewhere unrestricted, the liquidation panel populates with no code change.

## CoinMarketCap (optional, paid)

CMC is a **paid Pro tier**. What a key adds over the free sources:

- **Market categories** — Layer 1, DeFi, Meme, each with its own cap and 24h
  change. The nearest thing to a rotation dashboard, and the one thing free
  sources genuinely do not have.
- **Exchange rankings** — by reported 24h volume.
- **Derivatives** — open interest and funding rates. Nobody publishes these free.

To enable:

```bash
COINMARKETCAP_API_KEY="..."
```

Then restart. The adapter at
`src/server/api/overview/CoinMarketCapService.ts` activates and the panels
appear.

**Without a key every field is null and the app is complete anyway.** That is the
design constraint: CMC is additive, never load-bearing. A paid dependency that
breaks the free path is worse than no dependency.

> The adapter is written against CMC's documented v1 REST shape but **has not
> been tested against the live service**, because no key was available when it was
> written. It reports `configured: false` and is skipped entirely until a key
> exists, so an endpoint guess cannot break the app. Verify before relying on it.

The key travels in the `X-CMC_PRO_API_KEY` header, not the query string, so it
stays out of access logs.

---

## Rate limits

CoinGecko's free tier allows a few calls a minute. The app refreshes the top 100
every two minutes and the global figures on the same cycle, which is well inside
that. Going faster will get you throttled, and the service falls back to the last
good read rather than showing nothing.

If you need more, CoinGecko's paid tier or a self-hosted cache would be the
route. Neither is set up.

---

## Adding a source

1. A service under `src/server/api/<area>/`, as a tsyringe singleton — follow
   `MarketStatsService`.
2. In-process cache with a TTL, an inflight de-duplicator, and a last-good-read
   fallback. All three, not just the cache: a crawler that returns null on
   failure makes a panel blink every refresh.
3. Optional means `configured: false`, never a throw. Anything free must degrade
   to something the app already has.
4. Never put an API key in client code. The service runs server-side and the key
   is read from `env`.
5. **A venue that publishes no such feed is not the same as a venue that
   returned nothing.** Say which one it is. A panel that cannot tell the reader
   which is true is worse than no panel.

## What this deliberately does not do

No scraping, anywhere. Where a figure genuinely sits behind a paid wall it is
absent rather than approximated.
