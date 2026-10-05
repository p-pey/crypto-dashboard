import "server-only";

import { env } from "~/env.js";
import type { BaseExchangeAdapter } from "~/services/exchanges/BaseExchangeAdapter";
import { BitpinAdapter } from "~/services/exchanges/bitpin/BitpinAdapter";
import { NobitexAdapter } from "~/services/exchanges/nobitex/NobitexAdapter";
import { TabdealAdapter } from "~/services/exchanges/tabdeal/TabdealAdapter";
import { WallexAdapter } from "~/services/exchanges/wallex/WallexAdapter";
import { ExchangeError } from "~/services/trading/exchange.port";
import {
  EXCHANGE_IDS,
  type ExchangeId,
  type ExchangeSession,
} from "~/services/trading/trading.types";

/**
 * The one place that knows which adapter serves which venue.
 *
 * Adding a venue is a single entry here plus a new adapter; nothing above this
 * file changes. That is the whole point of the port: the application layer
 * resolves adapters by id and never imports one.
 */
class Registry {
  private readonly adapters = new Map<ExchangeId, BaseExchangeAdapter>();

  constructor() {
    for (const adapter of [
      new NobitexAdapter(),
      new WallexAdapter(),
      new BitpinAdapter(),
      new TabdealAdapter(),
    ]) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  has(id: ExchangeId): boolean {
    return this.adapters.has(id);
  }

  /** Throws rather than returning null, so a bad id can never reach a fetch. */
  get(id: ExchangeId): BaseExchangeAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new ExchangeError(
        id,
        "unsupported",
        `no trading adapter is registered for ${id}`,
      );
    }
    return adapter;
  }

  all(): BaseExchangeAdapter[] {
    return EXCHANGE_IDS.flatMap((id) => {
      const adapter = this.adapters.get(id);
      return adapter ? [adapter] : [];
    });
  }

  /**
   * Reports every venue's readiness in one pass.
   *
   * Probes run concurrently but each adapter paces itself, so a slow or hanging
   * venue cannot serialise the whole board. An unconfigured venue returns
   * immediately, which is the common case for a fresh checkout.
   */
  async sessions(): Promise<ExchangeSession[]> {
    const adapters = this.all();
    const settled = await Promise.all(
      adapters.map((adapter) => adapter.probe()),
    );

    return settled.map((session) => ({
      ...session,
      // Paper mode needs no credential, so a venue with none configured is
      // still tradeable - which is the point of starting in paper.
      ready: env.TRADING_MODE === "paper" ? true : session.ready,
    }));
  }
}

let instance: Registry | null = null;

export function exchangeRegistry(): Registry {
  instance ??= new Registry();
  return instance;
}
