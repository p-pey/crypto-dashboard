import "server-only";

import { AppContainer } from "~/lib/container";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";
import { BinanceAdapter } from "./BinanceAdapter";
import { BitgetAdapter } from "./BitgetAdapter";
import { BybitAdapter } from "./BybitAdapter";
import { DeribitAdapter } from "./DeribitAdapter";
import { HyperliquidAdapter } from "./HyperliquidAdapter";
import { MexcAdapter } from "./MexcAdapter";
import { OkxAdapter } from "./OkxAdapter";
import type { PerpVenueAdapter, VenueId } from "../venue.port";

/**
 * The one place that knows which adapter serves which venue.
 *
 * Adding a derivatives venue is a new adapter plus one line here. Nothing above
 * this file changes — the aggregation, the services and the panels are all
 * written against {@link PerpVenueAdapter} and never name a venue.
 *
 * Order is display order: the largest venues first, because the reader's prior
 * is that a board listing three names is incomplete, and putting Bitget and
 * Deribit ahead of Bybit would be false modesty rather than honesty.
 *
 * Every adapter is constructed whether or not it can be reached. Reachability is
 * a runtime property, not a build-time one — the same binary has to run from a
 * region where Binance answers and one where it does not.
 */
@AppSignleton()
export class VenueRegistry {
  private readonly adapters: PerpVenueAdapter[];

  constructor(@AppInject(AxiosService) http: AxiosService) {
    this.adapters = [
      new BinanceAdapter(http),
      new BybitAdapter(http),
      new OkxAdapter(http),
      new BitgetAdapter(http),
      new HyperliquidAdapter(http),
      new DeribitAdapter(http),
      new MexcAdapter(http),
    ];
  }

  /** All venues, in display order. */
  all(): readonly PerpVenueAdapter[] {
    return this.adapters;
  }

  /** Venues that publish a liquidations feed. */
  liquidationsVenues(): readonly PerpVenueAdapter[] {
    return this.adapters.filter((adapter) => adapter.supportsLiquidations);
  }

  get(id: VenueId): PerpVenueAdapter | undefined {
    return this.adapters.find((adapter) => adapter.id === id);
  }
}

export const venues = AppContainer.resolve(VenueRegistry);
