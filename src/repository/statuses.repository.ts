import { AppSignleton } from "~/lib/container";
import type { CoinStatus } from "~/services/statuses/statuses.types";

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory cache with a 24 hour TTL.
 *
 * Matches the brief: analysis is produced on demand the first time a coin is
 * expanded and then reused for a day. Note the trade-off this implies - the
 * cache dies with the process, so on a serverless deployment or after a restart
 * the next request re-analyses.
 */
@AppSignleton()
export class StatusesRepository {
  private readonly store = new Map<string, CoinStatus>();

  private key(coinId: string): string {
    return coinId.trim().toLowerCase();
  }

  get(coinId: string, now = Date.now()): CoinStatus | null {
    const key = this.key(coinId);
    const found = this.store.get(key);
    if (!found) return null;
    if (found.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return found;
  }

  set(status: CoinStatus): CoinStatus {
    this.store.set(this.key(status.coinId), status);
    return status;
  }

  /**
   * Drops the entry so the next read re-analyses. Used by the `force` flag on
   * the analyze procedure and by the cron route to refresh a whole batch.
   */
  invalidate(coinId: string): void {
    this.store.delete(this.key(coinId));
  }

  /** Removes expired entries so a long-lived process does not grow forever. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, value] of this.store) {
      if (value.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  all(now = Date.now()): CoinStatus[] {
    return [...this.store.values()].filter((status) => status.expiresAt > now);
  }

  get size(): number {
    return this.store.size;
  }
}
