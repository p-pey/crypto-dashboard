import { PriceHistoryStore } from "./PriceHistoryStore";

/**
 * Process-wide rolling price history for the coins table sparkline.
 *
 * Lives outside React so the socket listener can attach a stable array
 * reference to each row without allocating a new row object on every tick.
 */
export const coinPriceHistory = new PriceHistoryStore();
