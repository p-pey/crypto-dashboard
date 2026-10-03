# Trading

Places resting limit orders on the four Iranian exchanges, tracks holdings and
orders per venue, and scans for cross-venue spreads worth acting on.

Read this before setting `TRADING_MODE=live`.

## The guarantee, and what limits it

The order rests at **exactly the price shown on the board**, in that venue's own
quote unit, snapped to that market's tick. It does not fill at that price
immediately; it sits until the market reaches it. Cancelling is manual.

Three things can move the number off the price you clicked:

1. **The tick.** Rial and Toman markets quote in whole units. A Rial price with
   a decimal remainder has to land on the venue's grid.
   - A **buy snaps down**, so it never costs more than the screen showed.
   - A **sell snaps up**, so it never returns less than the screen showed.

   The ticket displays the number that is actually sent, so the difference is
   visible rather than implied.
2. **The quote unit.** Only Nobitex quotes its Rial markets in Rial. Wallex,
   Bitpin and Tabdeal use Toman, so their orders carry a tenth of the Rial figure
   on the board. This is stated per market in
   `src/constants/tradingInstruments.ts` and shown on the ticket.
3. **The minimum order value.** Wallex and Tabdeal refuse a Toman order under
   50,000; Nobitex refuses a Rial order under 500,000. At roughly 1,058,000,000
   Rial per XAUT that is a floor near 0.0005 XAUT. The ticket warns before you
   submit.

## Modes

`TRADING_MODE=paper` (the default) simulates fills against each venue's **real**
order book. No credential is used and no order leaves the machine. A paper buy at
price P fills when that venue's best bid actually reaches P, so a fill still
means something.

`TRADING_MODE=live` sends real orders.

Both modes share one code path, so bugs surface in paper first. Point
`NOBITEX_BASE_URL` at `https://testnetapiv2.nobitex.ir` to develop live-path
behaviour against Nobitex's own testnet.

## Access control

This app has **no sign-in flow**. Every trading procedure requires a
`TRADING_API_SECRET` header, compared against the same value in `.env`. That
means the API is reachable only from a process that can read the operator's own
environment, which is the intended deployment: one private machine.

Do not expose this app to a network without adding real authentication first. The
UI asks for the secret and keeps it in `sessionStorage` for the tab only.

## Setting up

```bash
# 1. Generate the guard secret
echo "TRADING_API_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Optional: Telegram notifications
#    Token from @BotFather, chat id from messaging the bot once.
echo 'TELEGRAM_BOT_TOKEN=""' >> .env
echo 'TELEGRAM_CHAT_ID=""' >> .env

# 3. Optional: exchange credentials, one block per venue
echo 'NOBITEX_TOKEN=""' >> .env
echo 'WALLEX_API_KEY=""' >> .env
echo 'BITPIN_API_KEY=""' >> .env
echo 'BITPIN_SECRET_KEY=""' >> .env
echo 'TABDEAL_API_KEY=""' >> .env
echo 'TABDEAL_API_SECRET=""' >> .env

# 4. Optional: the unattended worker, which is what CRON_SECRET protects.
echo 'CRON_SECRET=""' >> .env
```

A venue with no credential reports itself unconfigured and its buttons are
hidden. The app still boots.

Paper mode starts with an empty ledger; the account panel has a seed button.

### The unattended worker

```cron
* * * * * curl -sS -X POST http://localhost:3000/api/cron/trading -H 'x-cron-secret: $CRON_SECRET'
```

Drains the notification outbox, scans every venue for spreads that clear their
costs, and reports what it reached.

## What each venue actually offers

Verified against the live APIs, not the documentation alone.

| Venue | Auth | Gold markets | Leverage |
|---|---|---|---|
| Nobitex | `Authorization: Token <t>` | `XAUTIRT`, `PAXGIRT` (Rial) | Margin (تعهدی) to 5x on XAUT, 1x on USDT/Rial, 30-day expiry |
| Wallex | `x-api-key` | `XAUTTMN`, `PAXGTMN` (Toman) | Margin exists but lists **no** gold |
| Bitpin | JWT from key+secret | `XAUT_IRT`, `PAXG_IRT` (Toman) | **None.** Every leverage route is 404 |
| Tabdeal | HMAC-SHA256 over the query string | `XAUT_IRT`, `PAXG_IRT` (Toman) | **Perpetuals (FAPI)** on `XAUT_USDT` and `PAXG_USDT` |

Consequences worth knowing before you plan a trade:

- **There is no leveraged Rial gold future anywhere.** Tabdeal's perpetuals are
  USDT-settled, and Nobitex's margin product is the only levered Rial route. Gold
  leverage means either Nobitex margin or buying the USDT pair on Tabdeal.
- **Wallex has no `IRT` market at all.** Its quote assets are `TMN` and `USDT`
  only. Earlier versions of this repo listed `USDTIRT` and `XAUTIRT` for Wallex;
  those symbols do not exist and have been removed.
- **Bitpin's wallet calls the fiat asset `RIAL` while its markets call it `IRT`.**
  They are the same holding; the adapter aliases them.
- **Bitpin's authenticate body is undocumented.** `BitpinTokenStore` tries the
  plausible field spellings in order and caches whichever the live API accepts, so
  it works without knowing the answer up front.

## Spreads

The scan compares the **ask** on the cheapest venue against the **bid** on the
richest, never the mid against the mid, which would double-count the spread and
invent profit.

It reports two numbers, and only the second is an opportunity:

- `grossSpreadPercent` — what the screen shows.
- `netSpreadPercent` — gross minus both venues' taker fees and a transfer
  allowance.

The alert threshold applies to the net figure. A cross-venue spread also needs
the asset moved between exchanges, which on these venues is a manual, slow
operation; that cost is modelled as a flat allowance per venue pair rather than
pretended away.

## Adding a venue

1. Write an adapter extending `BaseExchangeAdapter` in `src/services/exchanges/`.
   Implement the port in `src/services/trading/exchange.port.ts`.
2. Register it in `ExchangeRegistry`.
3. Add its credentials to `src/env.js` and `.env.example`.
4. Add its markets and leverage mode to `src/constants/tradingInstruments.ts`.

Nothing above the adapter changes. The differences between venues are genuine
incompatibility — symbol spelling, quote unit, how a partial fill is spelled,
whether a business failure arrives with HTTP 200 — which is why they are confined
to the adapters instead of branched on in every caller.

## Money arithmetic

`src/services/trading/decimal.ts` holds fixed-point `bigint` arithmetic, and
nothing on an order path uses a JS `number`. A Rial order may be worth
50,000,000,000 and gold is sized to 0.000001, so `price * amount` is routinely a
1e10 integer times a 1e-6 fraction. Monetary values cross the wire as decimal
strings; exchange schemas declare them as strings, and sending a float is what
loses the precision.

## The trade workspace

`/trade` is the spot and futures screen: a market list on the left, the order
form beside it, resting orders and history to the right, and open positions above
when the futures tab is active.

It carries the same rule as the rest of the app. The price is **shown, not typed**,
and the order rests at that number until the market reaches it. What is editable
is the size, in base units.

### Which products exist, and where

The futures tab only lists pairs a venue actually trades with leverage, and marks
which product each one uses:

| Venue | Product | Gold pairs |
|---|---|---|
| Tabdeal | **perpetuals (FAPI)** | `XAUT_USDT`, `PAXG_USDT` |
| Nobitex | **margin** (تعهدی), to 5x | `XAUTIRT`, Rial |
| Wallex | margin, **no gold** | — |
| Bitpin | **none** | — |

There is no leveraged Rial gold future anywhere. Tabdeal's perpetuals are
USDT-settled, so leveraged gold means either Tabdeal's USDT pair or Nobitex's
Rial margin.

## Take-profit and stop-loss

**These are not the same feature on every venue, and the UI says so.**

- **Tabdeal perpetuals: native.** The real `positionSlTp` endpoint on FAPI, using
  mark-price triggers. The level lives on the exchange, survives this app being
  closed, and costs no order slot when it fires.
- **Nobitex margin: emulated.** There is **no such endpoint at all** - nothing to
  call, nothing to configure. The level is stored locally, the cron worker watches
  the price, and a **limit** reduce order is placed when it crosses.

The emulated path is a genuinely weaker guarantee. It depends on the process being
alive, on the cron interval, and on the reduce order itself succeeding. It is
labelled `emulated` in the UI, warned about before it is armed, and the Telegram
message says the same thing.

Two deliberate choices in that path:

- **The reduce order is a limit order at the level**, not a market one, consistent
  with every other order here. A stop that fills somewhere other than its level is
  not the order that was asked for. It can also sit unfilled, which is visible on
  the resting-orders screen rather than hidden inside a market fill.
- **The level is claimed before the order is sent.** The gap between sending and
  the position actually closing is longer than one poll interval, so a check that
  marked the row afterwards would fire the same stop twice. Claiming first means a
  failed reduce order is reported rather than duplicated - and a stop that did not
  fire gets noticed.

The cron worker checks armed levels on every pass, using the books it already
fetched, so arming a stop costs no extra request:

```cron
* * * * * curl -sS -X POST http://localhost:3000/api/cron/trading -H 'x-cron-secret: $CRON_SECRET'
```

## Notifications

Telegram's `sendMessage` has **no idempotency key** — no `random_id`, no header,
nothing. A timeout after Telegram already delivered is indistinguishable from one
that never arrived, and retrying duplicates the message.

So every message is written to an outbox row before the send is attempted, and
retries are asymmetric: a connection-level failure provably never reached Telegram
and is safe to repeat, while an established connection that then failed is logged
for a human instead of repeated.

## What is stored locally

Live orders, fills, balances and positions are always read from the exchange. The
local SQLite file holds only what an exchange cannot tell us:

- the paper ledger, since a simulated account has no venue to ask
- the notification outbox
- arbitrage alert rules and their cooldowns
- a client-order-id to venue-order-id map, which matters because Bitpin deletes
  fully-unfilled orders after seven days

It lives at `.data/trading.sqlite` and is gitignored.
