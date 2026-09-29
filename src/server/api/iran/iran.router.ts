import { IR_ASSETS, IR_EXCHANGES } from "~/constants/iranExchanges";
import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import { IrPriceMapper } from "~/services/iran/iran.mapper";
import type {
  IrAssetConfig,
  IrExchangeConfig,
  IrResolvedSymbols,
  IrSymbolSpec,
  IrTicker,
} from "~/services/iran/iran.types";
import { createTRPCRouter, publicProcedure } from "../trpc";

const ApiService = AppContainer.resolve(AxiosService);

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message === "timeout") {
      return "request timed out";
    }
    return error.message;
  }
  return "request failed";
}

async function fetchOrderBook(
  exchange: IrExchangeConfig,
  symbol: string,
): Promise<unknown> {
  const url = exchange.orderbookUrl.replace(
    "{symbol}",
    encodeURIComponent(symbol),
  );
  const { data } = await ApiService.get<unknown>(url, {
    headers: BROWSER_HEADERS,
    timeout: 8000,
  });
  return data;
}

/**
 * Each exchange may expose a couple of naming variants for the same market, so
 * every candidate is tried until one returns a book with at least one side.
 * The winner is reported back to the client so the socket layer subscribes to
 * the exact same market.
 */
async function fetchFirstUsableBook(
  exchange: IrExchangeConfig,
  candidates: IrSymbolSpec[],
): Promise<{ spec: IrSymbolSpec; raw: unknown } | null> {
  const failures: string[] = [];

  for (const spec of candidates) {
    try {
      const raw = await fetchOrderBook(exchange, spec.symbol);
      const { bestBid, bestAsk } = IrPriceMapper.extractDepth(raw);
      if (bestBid !== null || bestAsk !== null) return { spec, raw };
      failures.push(`${spec.symbol}: empty book`);
    } catch (error) {
      failures.push(`${spec.symbol}: ${describeError(error)}`);
    }
  }

  throw new Error(failures.join(" | ") || "no candidate symbols");
}

async function buildTicker(
  exchange: IrExchangeConfig,
  asset: IrAssetConfig,
  resolved: IrResolvedSymbols,
): Promise<IrTicker> {
  const identity = IrPriceMapper.identity(exchange, asset);
  const candidates = exchange.symbols[asset.id] ?? [];

  if (candidates.length === 0) {
    return IrPriceMapper.buildTicker({
      ...identity,
      symbol: null,
      raw: null,
      quoteScale: 1,
      status: "error",
      error: "no symbol configured",
    });
  }

  const result = await fetchFirstUsableBook(exchange, candidates);
  if (!result) throw new Error("no candidate symbol returned data");

  resolved[exchange.id] = {
    ...resolved[exchange.id],
    [asset.id]: result.spec,
  };

  return IrPriceMapper.buildTicker({
    ...identity,
    symbol: result.spec.symbol,
    raw: result.raw,
    quoteScale: result.spec.quoteScale,
    status: "live",
    updatedAt: Date.now(),
  });
}

function failedTicker(
  exchange: IrExchangeConfig,
  asset: IrAssetConfig,
  error: unknown,
): IrTicker {
  return IrPriceMapper.buildTicker({
    ...IrPriceMapper.identity(exchange, asset),
    symbol: exchange.symbols[asset.id]?.[0]?.symbol ?? null,
    raw: null,
    quoteScale: 1,
    status: "error",
    error: describeError(error),
  });
}

export const iranRouter = createTRPCRouter({
  /**
   * REST snapshot of every exchange/asset pair. Also resolves which symbol
   * variant each market is actually served under so the websocket layer does
   * not have to guess.
   */
  getTickers: publicProcedure.query(async () => {
    const resolved: IrResolvedSymbols = {};

    const tickers = await Promise.all(
      IR_EXCHANGES.flatMap((exchange) =>
        IR_ASSETS.map((asset) =>
          buildTicker(exchange, asset, resolved).catch((error: unknown) =>
            failedTicker(exchange, asset, error),
          ),
        ),
      ),
    );

    return { tickers, resolved, fetchedAt: Date.now() };
  }),
});
