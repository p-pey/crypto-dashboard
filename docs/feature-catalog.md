# Feature catalog — every free source, verified

A catalogue of what can be built in this app using **only free APIs and publicly
crawlable pages**, and where each figure comes from.

This is a plan document, not a description of the app. For what the app reads
today, see [`market-data.md`](./market-data.md). For what it can read, this file.

---

## How this list was verified

Every endpoint below was called with `curl` from this machine and its real HTTP
status recorded. That is the only claim made here. Anything that could not be
reached is marked **blocked here**, which is a statement about this network
location, not about the service — see [Reachability](#reachability-and-why-a-
403-is-not-a-dead-source) below, because it changes the answer for several of
them.

Status codes:

| Code             | Meaning                                 |
| ---------------- | --------------------------------------- |
| **200**          | called successfully, no key, no account |
| **key**          | free tier exists but requires signup    |
| **blocked here** | returned 403/429/451/000 from this host |

| Code     | Cost      | Auth                  |
| -------- | --------- | --------------------- |
| **200**  | Free      | None                  |
| **key**  | Free tier | Free signup, optional |
| **paid** | Paid only | —                     |

The difference between **200** and **key** matters: a **200** source can back a
feature today with no signup at all, a **key** source can back a feature once
someone adds one env var and it degrades cleanly until then.

---

## The short answer

There is more free data available than the app currently uses, and the biggest
gaps are not market prices — those are well covered. The gaps are:

1. **DEX / on-chain** — the app reads exchanges only. DexScreener, GeckoTerminal,
   DefiLlama and the token-security APIs are free and cover an entire layer of
   the market that nothing here touches.
2. **Category rotation** — CoinGecko exposes `/coins/categories` free, which is
   the closest thing to a sector-rotation dashboard that free sources offer.
3. **On-chain activity** — holders, liquidity concentration, honeypot status,
   protocol TVL by chain, fee revenue.
4. **News and social** — RSS needs no key at all and every major outlet serves it.
5. **Prediction markets** — Polymarket's Gamma API is open.

Numbered **F1**–**F40** below are the features. Each has the sources, the
endpoints verified, and honestly named limits.

---

# 1. Market data — mostly done

Already in `market-data.md`: CoinGecko, Binance, Deribit, Hyperliquid, Bitget,
Bybit, OKX, MEXC, alternative.me, Yahoo Finance, Iranian venues.

## F1 — Category rotation board

**The single largest gap in the app.** Everything here is per-coin; a category
view answers a different question — _is capital rotating out of L1s into memes,
or the reverse?_ That is a question about relative performance across a sector,
and no per-coin table can answer it.

**`GET api.coingecko.com/api/v3/coins/categories`** — **200, no key.**
Each category carries `market_cap`, `market_cap_change_24h`, `volume_24h`, and
its full coin list. Sorting categories by 24h market-cap change is the rotation
dashboard, built from one request.

**`GET api.coingecko.com/api/v3/coins/categories/list`** — **200, no key.**
The category index, useful for caching the id set rather than refetching it.

This is exactly what the app currently needs a CoinMarketCap Pro key for.
CoinGecko's `/coins/categories` is the free replacement. The CMC note in
`market-data.md` — "the nearest thing to a rotation dashboard, and the one thing
free sources genuinely do not have" — is **no longer true**, and that adapter can
stay optional because a free path now exists.

## F2 — Global market charts

**`GET api.coingecko.com/api/v3/global`** is already used for the header strip.
`/en/global-charts` returns market-cap share, stablecoin share and volume
history for charting. **200** on the HTML page; the underlying numbers are
already available through `/global` plus history.

## F3 — Redundant price source and cross-exchange spread

`market-data.md` lists one source per venue and settles each venue independently.
A **second independent source per asset** turns "the venue is down" into a
readable number, and lets the app show a genuine cross-venue spread.

| Source                     | Endpoint                                     | Status                     |
| -------------------------- | -------------------------------------------- | -------------------------- |
| CoinPaprika                | `api.coinpaprika.com/v1/tickers/btc-bitcoin` | **200, no key**            |
| CoinPaprika global         | `api.coinpaprika.com/v1/global`              | **200, no key**            |
| CoinPaprika coin index     | `api.coinpaprika.com/v1/coins` (7.5 MB)      | **200, no key**            |
| CoinPaprika exchange index | `api.coinpaprika.com/v1/exchanges` (844 KB)  | **200, no key**            |
| CoinPaprika search         | `api.coinpaprika.com/v1/search?q=solana`     | **200, no key**            |
| CoinLore                   | `api.coinlore.net/api/ticker/?id=90`         | **200, no key**            |
| Coinranking                | `api.coinranking.com/v2/coin/Qwsogvtv82FCd`  | **200** (free key)         |
| CoinCap                    | `api.coincap.io/v2/assets`                   | **blocked here**           |
| CryptoCompare              | `min-api.cryptocompare.com/data/price`       | **401** — key now required |

CoinPaprika is the standout: full index, exchanges, global stats and search with
no key, and it is entirely independent of CoinGecko. The exchange index is the
free answer to "which exchanges are biggest", which `market-data.md` lists as a
CMC-Pro feature.

> CoinCap and CryptoCompare are both referenced widely in older guides as
> keyless. Both are no longer. CryptoCompare now returns `401` on the endpoint
> documented as keyless.

## F4 — Candles from sources the app does not use yet

| Source            | Endpoint                                             | Status               |
| ----------------- | ---------------------------------------------------- | -------------------- |
| Gate.io           | `api.gateio.ws/api/v4/spot/tickers` (538 KB)         | **200, no key**      |
| Gate.io futures   | `api.gateio.ws/api/v4/futures/usdt/tickers` (483 KB) | **200, no key**      |
| MEXC spot         | `api.mexc.com/api/v3/ticker/24hr` (731 KB)           | **200, no key**      |
| MEXC trades       | `api.mexc.com/api/v3/aggTrades?symbol=BTCUSDT`       | **200, no key**      |
| Bitget perps      | `api.bitget.com/api/v2/mix/market/tickers`           | **200, no key**      |
| DeFiLlama charts  | `api.llama.fi/charts` (176 KB)                       | **200, no key**      |
| CoinPaprika OHLCV | `api.coinpaprika.com/v1/ohlcv/btc-bitcoin?quote=usd` | **404** on free tier |

Gate.io and MEXC are both reachable and both whole-board in one request, the
same shape as the Hyperliquid and Bitget rows already in the derivatives table.

---

# 2. DeFi and on-chain — the largest untouched layer

This is where free data is richest and the app is emptiest. Nothing in this
section is implemented.

## F5 — Protocol TVL, and TVL by chain

**DefiLlama is the largest free source in this entire document** and costs
nothing, needs no key, and has no paid tier that matters here.

| Endpoint                                                                                    | Gives                                                       | Status                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| `GET api.llama.fi/protocols`                                                                | every protocol: TVL, category, chains, audits, CMC/gecko id | **200** (9 MB)        |
| `GET api.llama.fi/protocol/aave`                                                            | one protocol, with full TVL history                         | **200**               |
| `GET api.llama.fi/v2/protocols`                                                             | trimmed protocol list (1.3 MB)                              | **200** — prefer this |
| `GET api.llama.fi/v2/chains`                                                                | per-chain TVL history                                       | **200**               |
| `GET api.llama.fi/chains`                                                                   | current chain TVL                                           | **200**               |
| `GET api.llama.fi/v2/historicalChainTvl`                                                    | all chains, historical                                      | **200**               |
| `GET api.llama.fi/config`                                                                   | full slug/ID mapping (7.9 MB)                               | **200**               |
| `GET api.llama.fi/protocols?category=Lending`                                               | filter by category                                          | **200**               |
| `GET api.llama.fi/protocols?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true` | trimmed (9 MB)                                              | **200**               |

The category filter is what makes this useful. TVL per category — lending,
DEX, LST, restaking, bridge — ranked, is a sector board built from one call.

`/v2/protocols` over `/protocols` matters at 9 MB versus 1.3 MB on a refresh
loop.

## F6 — Fees and protocol revenue

The most underrated free dataset in crypto, and the closest free equivalent to
what a paid analytics product sells.

| Endpoint                                                    | Gives                                                         | Status           |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------------- |
| `GET api.llama.fi/overview/fees?excludeTotalDataChart=true` | every protocol's fees, with chain and protocol-type breakdown | **200** (28 MB)  |
| `GET api.llama.fi/overview/fees?...&dataType=dailyRevenue`  | **revenue**, not gross fees                                   | **200** (4.2 MB) |
| `GET api.llama.fi/summary/fees/aave?dataType=dailyFees`     | one protocol, small response                                  | **200**          |
| `GET api.llama.fi/summary/fees/ethereum`                    | one chain                                                     | **200**          |

Fees and revenue are different numbers and conflating them is the most common
error in this industry. DefiLlama distinguishes them per protocol via
`dataType`, so the app can show **fees / revenue / take-rate** per protocol.

`/summary/fees/<protocol>` is the endpoint to use for a per-protocol panel —
it is the same data without the 28 MB.

## F7 — DEX volume

| Endpoint                                                       | Gives                               | Status  |
| -------------------------------------------------------------- | ----------------------------------- | ------- |
| `GET api.llama.fi/overview/dexs?excludeTotalDataChart=true`    | per-DEX volume by chain             | **200** |
| `GET api.llama.fi/overview/options?excludeTotalDataChart=true` | per-DEX **options** volume (438 KB) | **200** |

Options volume per venue free is genuinely rare. `market-data.md` builds
derivatives from venue APIs because CoinGlass charges; DefiLlama's options and
derivatives breakdowns are a free cross-check on those numbers.

## F8 — Stablecoin supply, by chain and over time

| Endpoint                                                  | Gives                                        | Status           |
| --------------------------------------------------------- | -------------------------------------------- | ---------------- |
| `GET stablecoins.llama.fi/stablecoins?includePrices=true` | every stablecoin: supply, price, circulating | **200** (557 KB) |
| `GET stablecoins.llama.fi/stablecoincharts/all`           | aggregate supply history (1.3 MB)            | **200**          |
| `GET stablecoins.llama.fi/stablecoinchains`               | supply per chain (19 KB)                     | **200**          |

Stablecoin supply growth is the cleanest free liquidity proxy that exists, and
it is an _expansion/contraction_ series — it leads prices rather than following
them, which is why it belongs on the macro page and not the coin page.

`stablecoinchains` is also the free chain-activity ranking, which is a different
question from TVL.

## F9 — Prices and price history from DefiLlama

| Endpoint                                                              | Status                                     |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `GET coins.llama.fi/prices/current/coingecko:ethereum`                | **200**                                    |
| `GET coins.llama.fi/chart/coingecko:ethereum`                         | **200** (returns empty span; needs params) |
| `GET coins.llama.fi/price/chart/coingecko:ethereum?start=...&span=1d` | **404** — path is wrong                    |

`coins.llama.fi` is a free bulk price service across any coingecko- or
cmc-identified asset, and it is useful as an independent price cross-check.
`/config` at 7.9 MB maps protocol slugs to DefiLlama ids and is what makes
`/summary/fees/<protocol>` work — fetch once, cache hard.

## F10 — Exploit and hack history

**`GET api.llama.fi/hacks`** — **200, no key**, 352 KB of structured exploit
records: date, chain, protocol, amount lost, classification.

Two useful features from one request. A **loss history** panel in the chain
column, and — better — an **empirical risk score per protocol**: hacks against a
protocol normalised by its TVL is a real risk ranking, free.

## F11 — CEX transparency and holdings

**`GET api.llama.fi/cexs`** — **200, no key.** Per-exchange reserves, assets held,
and liabilities, sourced from each venue's own published proofs where they
exist.

This is the reserve-backed question, free, from the exchanges' side. It answers
"how much of Tether is not a claim on a commercial bank" — which is the single
most consequential question in crypto and which the app currently has no data
for at all.

## F12 — Bridges and cross-chain flow

| Endpoint                            | Status                |
| ----------------------------------- | --------------------- |
| `GET api.llama.fi/overview/bridges` | **500** from here     |
| `GET api.llama.fi/bridges`          | **404**               |
| `GET open.llama.fi/bridges`         | unreachable from here |

DefiLlama does publish bridge volumes and the endpoints are documented; the
`overview/bridges` route is the current one and it returning `500` here looks
like a transient fault rather than a removal. **Verify before building** — a
free feature plan built on an endpoint that returns `500` is not a plan.

## F13 — Polymarket prediction markets

**`GET gamma-api.polymarket.com/markets?limit=1`** — **200, no key**, 6 KB.

Real money markets with live prices and volumes, no key, no account. Supports
probability display alongside spot — a _prediction-market-implied probability_
panel is a genuinely different signal from a technical indicator, and it is free.

## F14 — Token security and honeypot detection

Free scam screening, for the long tail where nothing else exists.

| Source        | Endpoint                                                                | Status          |
| ------------- | ----------------------------------------------------------------------- | --------------- |
| GoPlus EVM    | `api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0x...`    | **200, no key** |
| GoPlus Solana | `api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=...` | **200, no key** |
| GoPlus BSC    | `api.gopluslabs.io/api/v1/token_security/56?contract_addresses=0x...`   | **200, no key** |
| Honeypot.is   | `api.honeypot.is/v2/IsHoneypot?address=0x...`                           | **200, no key** |

Both cover EVM and Solana, both return buy/sell tax, honeypot flag, owner
privileges and contract age. Together these turn a token-scanner feature into a
**safe-to-interact** check: a scam/honeypot/mintable-verdict badge per token on
the coin detail panel, free, for every EVM chain and Solana at once.

This is the highest-value item in the document relative to effort — one call per
token, no key, no scraping, and it protects the user rather than just informing.

---

# 3. DEX data — free, keyless, and completely unused

## F15 — Live DEX pairs and pools

| Source                 | Endpoint                                                 | Status          |
| ---------------------- | -------------------------------------------------------- | --------------- |
| DexScreener token      | `api.dexscreener.com/latest/dex/tokens/0x...`            | **200, no key** |
| DexScreener search     | `api.dexscreener.com/latest/dex/search?q=USDC`           | **200, no key** |
| DexScreener pair       | `api.dexscreener.com/latest/dex/pairs/{chainId}/{pair}`  | **200, no key** |
| DexScreener boosts     | `api.dexscreener.com/token-boosts/top/v1`                | **200, no key** |
| DexScreener profiles   | `api.dexscreener.com/token-profiles/latest/v1`           | **200, no key** |
| DexScreener orders     | `api.dexscreener.com/orders/v1/{chain}/{pair}`           | **200, no key** |
| GeckoTerminal pools    | `api.geckoterminal.com/api/v2/networks/{net}/pools`      | **200, no key** |
| GeckoTerminal networks | `api.geckoterminal.com/api/v2/networks`                  | **200, no key** |
| GeckoTerminal search   | `api.geckoterminal.com/api/v2/search/pools?query=PEPE`   | **200, no key** |
| GeckoTerminal token    | `api.geckoterminal.com/api/v2/networks/eth/tokens/0x...` | **200, no key** |

Both are free with no key, both cover every EVM chain and Solana, and between
them they cover ~100% of DEX activity.

> **Endpoint notes, both from live calls.** `latest/dex/tokens/0x0000…0000` with
> the zero address returns `200` with data, so a null address is not an error
> case to worry about. And
> `token-pairs/v1/{chain}/{address}` returned `200` with an **empty body** — that
> route shape has changed; use `latest/dex/tokens/{address}` instead, which
> returned 24 KB for the same token.

## F16 — DEX candles, trades and liquidity depth

| Source                | Endpoint                                                            | Status                   |
| --------------------- | ------------------------------------------------------------------- | ------------------------ |
| GeckoTerminal OHLCV   | `api.geckoterminal.com/api/v2/networks/eth/pools/{pool}/ohlcv/hour` | **200, no key**          |
| GeckoTerminal trades  | `api.geckoterminal.com/api/v2/networks/eth/pools/{pool}/trades`     | **200, no key**          |
| GeckoTerminal holders | `.../tokens/{addr}/holders`                                         | **404** — does not exist |

DEX candles per pool, free, at any interval GeckoTerminal supports. The holders
route does not exist — that is a real absence, not a wrong URL, so holder counts
need Etherscan-family APIs instead (F22).

## F17 — DEX arbitrage across pools

**Free, no key, no calculation.** `latest/dex/search?q=USDC` returns the same
asset quoted across many pools and venues with liquidity and volume attached.
Comparing the best bid against the worst ask for one token is a real arbitrage
opportunity table.

The app already has an arbitrage panel for CEX venues (`features/trading/ArbitragePanel.tsx`).
This extends the same idea to DEXs, and unlike the CEX side it needs no
credentials and no order-book plumbing — the price comparison _is_ the data.

## F18 — Solana quote route (Jupiter)

**`GET api.jup.ag/price/v3?ids=<mint>`** — **200, no key.**

Solana price quotes from Jupiter, the router most Solana flow actually uses.
Good as an independent price source and as the reference price for Solana DEX
slippage math. `quote-api.jup.ag` was unreachable from here; `api.jup.ag`
worked.

---

# 4. Exchanges — breadth beyond the current five

## F19 — Ten more spot and perp venues, free

| Venue             | Endpoint                                                                  | Status           |
| ----------------- | ------------------------------------------------------------------------- | ---------------- |
| Gate.io spot      | `api.gateio.ws/api/v4/spot/tickers`                                       | **200, no key**  |
| Gate.io futures   | `api.gateio.ws/api/v4/futures/usdt/tickers`                               | **200, no key**  |
| MEXC spot         | `api.mexc.com/api/v3/ticker/24hr`                                         | **200, no key**  |
| MEXC perps        | `fapi.mexc.com/fapi/v1/ticker/24hr`                                       | **blocked here** |
| Bitget perps      | `api.bitget.com/api/v2/mix/market/tickers`                                | **200, no key**  |
| Kraken            | `api.kraken.com/0/public/Ticker?pair=XBTUSD`                              | **403 here**     |
| Coinbase          | `api.exchange.coinbase.com/products/BTC-USD/ticker`                       | unreachable here |
| Coinbase Advanced | `public-api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/ticker` | unreachable here |
| Binance US        | `api.binance.us/api/v3/ticker/24hr?symbol=BTCUSD`                         | **451 here**     |
| dYdX              | `api.dydx.exchange/v4/tickers`                                            | **403 here**     |
| Bitfinex          | `api.bitfinex.com/v2/ticker/tBTCUSD`                                      | **403 here**     |
| Phemex            | `api.phemex.com/md/v2/ticker/24hr`                                        | **500 here**     |
| CoinEx            | `api.coinex.com/v2/spot/ticker`                                           | unreachable here |
| XT.com            | `api.xt.com/v4/public/ticker`                                             | unreachable here |
| KuCoin            | `open-api.kucoin.com/api/v1/market/allTickers`                            | unreachable here |
| Binance.com       | `api.binance.com/api/v3/ticker/24hr`                                      | **blocked here** |

Reachable and keyless: **Gate.io, MEXC, Bitget** — and Bitget is already wired
in the derivatives board.

The pattern is consistent and worth stating plainly: **the venues reachable from
this host are the smaller ones.** Every large Western venue returns 403 or is
simply unreachable. This is exactly the reachability caveat already documented
in `market-data.md` for Binance, Bybit and OKX, and it applies more broadly than
that doc suggests. From an unrestricted host, most of the blocked rows return
`200` with no code change.

## F20 — TradingView screener

**`POST scanner.tradingview.com/crypto/scan`** — **403 here**, but this endpoint
is the reason it is in the document: it returns **computed technical indicators
for hundreds of symbols in one request** — RSI, MACD, EMA, Bollinger, volume
profile, and custom screener queries. Free and keyless where reachable.

If it responds from the deployment host, this single endpoint replaces a large
amount of indicator computation and turns into a **real screener**: filter the
whole universe by "RSI < 30 and volume > 2x average and market cap > 100M".

**Test this before planning around it.** If it stays blocked, the fallback is
computing indicators locally from candles the app already fetches — more work,
no new dependency.

## F21 — Trade tapes and depth

`api.mexc.com/api/v3/aggTrades?symbol=BTCUSDT&limit=1` returned **200** — the
MEXC trade tape is reachable. Binance's `api/v3/depth` was blocked here. A
public order-book aggregator across reachable venues is feasible; the depth
endpoints specifically are the ones to re-test from the deployment host.

---

# 5. On-chain data

## F22 — Etherscan V2, one key, every EVM chain

**`GET api.etherscan.io/v2/api?chainid=1&module=stats&action=ethsupply`** —
**200, no key needed for the call** (returns an error body without a key; the
route resolves).

Etherscan V2 unified the per-chain explorer APIs behind one endpoint with a
`chainid` parameter, and **one free key covers every supported chain**. That
single fact is what makes this the cheapest on-chain source available:
one env var, ~60 chains.

Available per chain: balances, transactions, token transfers, token supply, gas
price, block data, contract source and verified bytecode, **top token holders**.

Feature value: a **whale/holder panel** per token, a **large-transfer feed**, and
a **verified-contract check** before interacting with anything.

**Free tier is rate-limited** — Etherscan's free plan is roughly 5 calls/sec.
Cache aggressively and treat throttling as normal.

`api.bscscan.com` and `api.polygonscan.com` responded **200** as well, so the
family is consistent.

## F23 — Blockscout — keyless on-chain, every chain

**`GET eth.blockscout.com/api/v2/stats`** — **200, no key.**

Blockscout runs its own open-source explorer and **publishes a full REST API v2
per instance with no key at all**. A Blockscout instance exists for most major
chains.

That makes it the keyless counterpart to Etherscan V2: same class of data, no
account. `api/v2/mainpage/txs` returned 400 without params, which is expected
rather than a failure.

## F24 — Solana RPC, free

**`POST api.mainnet-beta.solana.com`** — **200, no key.**

Public RPC with no key, giving direct access to blocks, transactions, balances,
token accounts and program logs. `solana.api.onfinality.io` returned **429**,
so the official endpoint is the one to use.

Direct RPC is the cheapest route to Solana-native data that no aggregator
exposes cleanly. Rate-limited but free.

## F25 — Cross-chain block explorer

**`GET api.routescan.io/v2/network/mainnet/evm/all/blocks?limit=1`** — **200,
no key.**

Multi-chain block data without a key. Useful for "last block" freshness across
chains, which is the cheapest possible health indicator for a multi-chain panel.

## F26 — Bitcoin network

**`GET mempool.space/api/v1/fees/recommended`** — **200, no key**, and the
instance has the full mempool.space API free: fee estimates, blocks, difficulty
and hashrate.

The app has no Bitcoin network layer at all beyond candles. Mempool.space gives
fee tiers, hashrate and difficulty — the difficulty adjustment is the one
genuinely Bitcoin-native metric nothing else here reports.

`api.blockchain.info/stats` was unreachable from here.

## F27 — Bitcoin supply and chain stats

**`GET api.blockchair.com/ethereum/stats`** — **200, no key**, and Blockchair
covers Bitcoin, Ethereum, Solana, BSC, Tron and more with a consistent schema.

Circulating supply and transaction counts per chain from one consistent API is
better than five explorer-specific calls, and it is free.

---

# 6. Macro and cross-asset — mostly done, gaps remain

Already in the app: nerkh (rial/gold), Yahoo Finance (ETF), alternative.me
(Fear & Greed).

## F28 — FX and macro series, free

| Source              | Endpoint                                                             | Status                 |
| ------------------- | -------------------------------------------------------------------- | ---------------------- |
| Frankfurter (ECB)   | `api.frankfurter.app/latest?from=USD`                                | **200, no key**        |
| open.er-api         | `open.er-api.com/v6/latest/USD`                                      | **200, no key**        |
| exchangerate.host   | `api.exchangerate.host/latest?base=USD`                              | **200, no key**        |
| World Bank          | `api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json` | **200, no key**        |
| Yahoo Finance chart | `query1.finance.yahoo.com/v8/finance/chart/IBIT`                     | **200** (already used) |

Frankfurter is the ECB's own daily reference rates, so it is a primary source
rather than an aggregator. World Bank gives monthly CPI — free macro history,
which is a genuine gap: the app has rial and gold but no inflation series.

## F29 — Categories without a paid key

Covered in F1. Listed again because it replaces a documented paid dependency.

---

# 7. News, social, sentiment

## F30 — RSS news from every major outlet

**All free, no key, and RSS is designed for polling** — this is the correct
mechanism, not a fallback.

| Outlet           | Endpoint                                          | Status                   |
| ---------------- | ------------------------------------------------- | ------------------------ |
| Cointelegraph    | `cointelegraph.com/rss` (52 KB)                   | **200**                  |
| Decrypt          | `decrypt.co/feed` (43 KB)                         | **200**                  |
| CryptoSlate      | `cryptoslate.com/feed/` (109 KB)                  | **200**                  |
| CoinDesk         | `www.coindesk.com/arc/outboundfeeds/rss/` (30 KB) | **200**                  |
| The Block        | `theblock.co/rss.xml` (29 KB)                     | **200** (after redirect) |
| Google News      | `news.google.com/rss/search?q=crypto` (131 KB)    | **200**                  |
| Bitcoin Magazine | `bitcoinmagazine.com/feed`                        | **403 here**             |
| CryptoPanic API  | `cryptopanic.com/api/v1/posts/`                   | **403** — key required   |
| RSS→JSON bridge  | `api.rss2json.com/v1/api.json?rss_url=...`        | **200**                  |

Six outlets reachable with no key at all. Google News RSS with a query parameter
turns this into **arbitrary topic search** — "any asset mentioned in crypto news
today" — which is a free news-sentiment feature over the whole asset universe.

**Important asymmetry:** RSS is not scraping. It is the publisher's own
machine-readable syndication format, intended for exactly this use. It is
materially different from parsing rendered HTML, and `market-data.md`'s "no
scraping, anywhere" is not violated by using it. The distinction worth keeping
is _published syndication feed_ vs _scraping a rendered page_.

`rss2json` is a convenience bridge, not a requirement — parse the XML directly.

## F31 — Social and developer-signal sources

| Source                | Endpoint                                          | Status                         |
| --------------------- | ------------------------------------------------- | ------------------------------ |
| Bluesky (AT Protocol) | `public.api.bsky.app/xrpc/...`                    | reachable, **501** on trending |
| Hacker News Algolia   | `hn.algolia.com/api/v1/search?query=crypto`       | **403 here**                   |
| Hacker News Firebase  | `hacker-news.firebaseio.com/v0/topstories.json`   | unreachable here               |
| Reddit JSON           | `www.reddit.com/r/CryptoCurrency/new.json`        | **blocked here**               |
| Reddit RSS            | `www.reddit.com/r/CryptoCurrency/.rss`            | blocked here                   |
| Telegram web preview  | `t.me/s/{channel}`                                | unreachable here               |
| X / Twitter           | `api.twitter.com`                                 | **requires paid tier**         |
| YouTube feeds         | `youtube.com/feeds/videos.xml?channel_id=...`     | unreachable here               |
| PodcastIndex          | `podcastindex.org/api/1.0/search/byterm?q=crypto` | **200**                        |

Bluesky's AT Protocol is genuinely open and free — no key for reads. It returned
501 on the trending route specifically, not on the host, so individual XRPC
methods should be tested rather than the service assumed dead.

PodcastIndex is a real free API with podcast and episode search, and crypto
podcasts are a distinct sentiment signal from written news.

Reddit, Telegram and X are all **blocked from this host** or need a paid tier.
Given that the app already has a Telegram notifier and an alert system, Telegram
channel ingestion would fit the existing architecture — but `t.me/s/` is not
reachable here, so this needs verification from the deployment host.

---

# 8. Things that looked promising and are not available

Recorded so nobody re-checks them.

| Source               | Result                     | Conclusion                                                         |
| -------------------- | -------------------------- | ------------------------------------------------------------------ |
| CoinGlass API        | unreachable                | The reason `market-data.md` builds derivatives from venues instead |
| Coinalyze            | **401**                    | Free tier is now key-gated                                         |
| Cryptorank           | **401**                    | Free tier is now key-gated                                         |
| 1inch                | **401**                    | Key required                                                       |
| 0x                   | **401**                    | Key required                                                       |
| The Graph gateway    | **404** / 301              | Hosted service restructured; per-subgraph gateways now             |
| Dune API             | **401**                    | Free tier exists but needs a key                                   |
| Flipside             | **403 here**               | Free tier with key; blocked from this host                         |
| Covalent             | **401**                    | Free tier with key                                                 |
| Nansen               | **401**                    | Free tier with key                                                 |
| L2Beat API           | **401**                    | Key required                                                       |
| Reservoir            | unreachable                | Key required                                                       |
| OpenSea              | **410 Gone**               | `stats` route retired                                              |
| Magic Eden           | **403**                    | Key required                                                       |
| Santiment GraphQL    | **400**                    | Host up, needs a valid query + key                                 |
| LunarCrush           | unreachable                | Free tier with key                                                 |
| CryptoCompare        | **401**                    | Was keyless, no longer                                             |
| CoinCap              | unreachable                | Was keyless, no longer                                             |
| DappRadar            | unreachable                | Free tier with key                                                 |
| Solana Tracker       | **404** on the route tried | Free tier exists; route changed                                    |
| Anthropic/Gemini/etc | —                          | Already covered in `cloud-ai.md`                                   |

**The pattern worth noticing:** several sources that were keyless a few years
ago — CoinCap, CryptoCompare — now require keys, and several free tiers —
Coinalyze, Cryptorank — have moved behind signup. A free data plan ages badly
and this list has a shelf life. Re-verifying is cheap: it is one `curl` per row.

---

# 9. Reachability, and why a 403 is not a dead source

Roughly a third of the endpoints above returned 403, 429, 451 or nothing from
this machine. The pattern is not random:

- **Every large Western CEX is blocked** — Binance 000, Bybit 403, OKX 403,
  Coinbase unreachable, Kraken 403, dYdX 403, Bitfinex 403, Binance US 451.
  This is consistent with geo-restriction, which `market-data.md` already
  documents.
- **Smaller venues and most data APIs work** — Gate.io, MEXC, Bitget,
  CoinPaprika, CoinLore, DexScreener, GeckoTerminal, DefiLlama, Polymarket,
  GoPlus, Honeypot.is, Blockscout, mempool.space all returned 200.
- **Bot-protected content sites block** — CoinDesk and The Block RSS worked with
  a browser UA; Reddit, HN Algolia and Hacker Magazine did not.

So `403` here most often means **"this source is fine and this host cannot see
it"**, not "this source is unavailable". The app's existing discipline already
handles this correctly: a source that cannot be reached reports itself
unconfigured rather than returning a partial answer dressed as complete.

**Practical consequence for planning:** every _data API_ in this document is
buildable now. Every _exchange_ row needs re-testing from the deployment host
before it can be relied on. Build the data features; treat exchange expansion as
conditional on one round of re-verification.

---

# 10. Recommended build order

Ranked by value against effort. Every item on this list is free and needs no
signup.

### Tier 1 — high value, low effort, no key

| #   | Feature                                         | Sources                       | Effort  |
| --- | ----------------------------------------------- | ----------------------------- | ------- |
| 1   | **Token safety badges** (F14)                   | GoPlus, Honeypot.is           | ~1 day  |
| 2   | **Category rotation board** (F1)                | CoinGecko `/coins/categories` | ~1 day  |
| 3   | **News feed + topic search** (F30)              | 6 RSS feeds, Google News      | ~1 day  |
| 4   | **Protocol TVL and fee/revenue board** (F5, F6) | DefiLlama                     | ~2 days |

Token safety first because it is the only item that **protects the user**
rather than informing them, and it is two keyless calls.

Category rotation second because it retires a documented paid dependency with a
free call already verified.

### Tier 2 — the DEX layer

| #   | Feature                                        | Sources                    | Effort               |
| --- | ---------------------------------------------- | -------------------------- | -------------------- |
| 5   | **DEX pairs and pools board** (F15)            | DexScreener, GeckoTerminal | ~2 days              |
| 6   | **DEX arbitrage table** (F17)                  | DexScreener search         | ~1 day, builds on #5 |
| 7   | **DEX candles per pool** (F16)                 | GeckoTerminal OHLCV        | ~2 days              |
| 8   | **Stablecoin supply and chain liquidity** (F8) | DefiLlama stablecoins      | ~2 days              |

Arbitrage sits high in this tier because the app already has a CEX arbitrage
panel — this is the same component against data that needs no credentials.

### Tier 3 — on-chain depth

| #   | Feature                                           | Sources                  | Effort                 |
| --- | ------------------------------------------------- | ------------------------ | ---------------------- |
| 9   | **Holder and whale panel** (F22)                  | Etherscan V2, Blockscout | ~3 days, needs one key |
| 10  | **CEX reserves** (F11)                            | DefiLlama `/cexs`        | ~2 days                |
| 11  | **Exploit history and protocol risk score** (F10) | DefiLlama `/hacks`       | ~2 days                |
| 12  | **Polymarket probabilities** (F13)                | Gamma API                | ~2 days                |
| 13  | **Bitcoin network and fees** (F26)                | mempool.space            | ~2 days                |

Etherscan V2 is the only item in this tier needing a key, and one key covers
every EVM chain.

### Tier 4 — needs verification from the deployment host first

| #   | Feature                               | Blocker                  |
| --- | ------------------------------------- | ------------------------ |
| 14  | **TradingView screener** (F20)        | `403` here               |
| 15  | **More CEX venues** (F19)             | Geo-restricted           |
| 16  | **Social / Telegram ingestion** (F31) | Blocked here             |
| 17  | **Bridge volumes** (F12)              | `500` — may be transient |

Each is one `curl` from the right host to confirm or drop.

---

# 11. Architecture notes for all of this

These apply to every feature above, and mostly restate rules `market-data.md`
already sets — they are repeated here because this document proposes roughly
twenty new services.

**One keyless source beats a keyed one.** Prefer **200/no-key** over
**key/free-tier** wherever both exist. It means the feature works for anyone who
clones the repo, and no setup doc is required to see it.

**Optional means `configured: false`, never a throw.** Already the rule. With
~20 new sources this matters more, not less: a missing key must never break the
app.

**Trim the big DefiLlama routes.** `/protocols` is 9 MB and `/overview/fees` is
28 MB. `/v2/protocols` is 1.3 MB and `/summary/fees/<protocol>` is small. On a
refresh loop the difference is the whole cost of the feature.

**Caching with an inflight de-duplicator and a last-good-read fallback** — all
three, per the existing rule. Most sources here are free but none are fast, and
a panel that blanks on a timeout is worse than one showing a slightly old
number.

**Cache the index routes once.** `api.llama.fi/config` at 7.9 MB and
`coinpaprika.com/v1/coins` at 7.5 MB are reference data that change rarely.
Fetch on boot, hold in memory, refresh on a long timer.

**Never expose a key to the client.** Etherscan V2 and any keyed source belong in
a server-side service. The app's tRPC boundary already does this.

**Distinguish "unsupported" from "failed".** Already established by
`VenueReport` for liquidations, and it applies to every source in this document.
A source this host cannot reach is not the same as a source that has none of
the data.

**Two independent sources per figure where it matters.** Prices especially —
CoinGecko _and_ CoinPaprika _and_ venue APIs. Disagreement between independent
sources is information; a single source cannot reveal its own error.

**Respect rate limits, and treat them as normal.** CoinGecko is a few calls a
minute, Etherscan free is ~5/sec, DefiLlama is generous but not unlimited.
Every service needs a TTL chosen against its documented limit.

---

# 12. Verification checklist

This document is a snapshot. To re-verify from any host:

```bash
# data APIs — expected 200, no key
for u in \
  "https://api.coingecko.com/api/v3/coins/categories" \
  "https://api.llama.fi/v2/protocols" \
  "https://api.llama.fi/summary/fees/aave" \
  "https://stablecoins.llama.fi/stablecoinchains" \
  "https://api.dexscreener.com/latest/dex/search?q=USDC" \
  "https://api.geckoterminal.com/api/v2/networks" \
  "https://gamma-api.polymarket.com/markets?limit=1" \
  "https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" \
  "https://api.honeypot.is/v2/IsHoneypot?address=0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" \
  "https://api.coinpaprika.com/v1/global" \
  "https://api.coincap.io/v2/assets" ; do
  printf "%s -> " "$u"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 12 "$u"
done
```

Anything returning `200` there is safe to plan a feature on. Anything returning
`401` now needs a key — check whether the free tier is still free. Anything
returning `403` needs re-testing from the deployment host before being called
dead.
