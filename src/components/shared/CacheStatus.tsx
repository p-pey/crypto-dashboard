"use client";

import { Database, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import {
  CACHE_VERSION,
  clearCache,
  pruneCache,
  readCacheIndex,
} from "~/lib/persistentCache";

type State = {
  entries: { key: string; savedAt: number; ageMs: number }[];
  loading: boolean;
  cleared: boolean;
};

/**
 * Shows what the browser has stored and how old it is.
 *
 * The cache is invisible when it works, which is exactly why it needs a
 * readout: if a number on screen is six hours old you should be able to see
 * that rather than having to guess whether the refetch happened.
 */
export default function CacheStatus() {
  const { locale, t } = useI18n();
  const [state, setState] = useState<State>({
    entries: [],
    loading: true,
    cleared: false,
  });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void readCacheIndex().then((entries) => {
        if (cancelled) return;
        setState({ entries, loading: false, cleared: false });
      });
    };

    load();
    // The ages drift, so the readout is refreshed on a slow tick.
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const freshest = state.entries.reduce(
    (best, entry) => Math.max(best, entry.savedAt),
    0,
  );
  const oldest = state.entries.reduce(
    (worst, entry) => Math.min(worst || entry.savedAt, entry.savedAt),
    0,
  );

  async function onClear() {
    await clearCache();
    await pruneCache();
    setState({ entries: [], loading: false, cleared: true });
  }

  return (
    <div className="border-line bg-surface-2/50 rounded-[14px] border px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-2 inline-flex items-center gap-2 text-[12px] font-bold">
          <Database className="size-4" strokeWidth={2.1} />
          {t("cache.title")}
        </span>
        <button
          type="button"
          onClick={() => void onClear()}
          disabled={state.entries.length === 0}
          className="border-line text-fg-2 hover:border-rose/50 hover:text-rose inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40"
        >
          <Trash2 className="size-3" strokeWidth={2.2} />
          {state.cleared ? t("cache.cleared") : t("cache.clear")}
        </button>
      </div>

      <p className="text-fg-3 mb-2 text-[10.5px] leading-relaxed">
        {t("cache.description")}
      </p>

      {state.loading ? null : (
        <div className="text-fg-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span>
            {t(
              "cache.entries",
              formatNumber(locale, state.entries.length, {
                maximumFractionDigits: 0,
              }),
            )}
          </span>
          <span dir="ltr">{t("cache.version", CACHE_VERSION)}</span>
          {freshest > 0 && (
            <span>
              {t("cache.age")}: {formatRelative(locale, freshest)}
            </span>
          )}
          {oldest > 0 && oldest !== freshest && (
            <span className="text-fg-3/70">
              {formatRelative(locale, oldest)} →{" "}
              {formatRelative(locale, freshest)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
