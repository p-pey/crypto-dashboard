"use client";

import { RefreshCw } from "lucide-react";
import { formatRelative, formatTime } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";

/**
 * The moment the data behind a table last changed, next to the table title.
 *
 * A price board that refreshes on a timer is only trustworthy if you can see
 * when it last actually moved, so this is rendered rather than left implicit.
 * It turns into a live counter once the data is over a minute old.
 */
export default function UpdatedStamp({
  at,
  label,
  refreshing = false,
  age,
}: {
  /** Epoch ms of the last update, or null when there is nothing yet. */
  at: number | null;
  label?: string;
  refreshing?: boolean;
  /** Set when the value was restored from the persistent cache. */
  age?: number | null;
}) {
  const { locale, t } = useI18n();

  return (
    <span className="text-fg-3 inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap">
      {refreshing && (
        <RefreshCw
          className="size-3 animate-spin"
          strokeWidth={2.4}
          aria-hidden
        />
      )}
      <span dir="ltr" className="num tabular-nums">
        {at ? formatTime(locale, at, { withSeconds: true }) : "—"}
      </span>
      <span>{label ?? t("common.updated")}</span>
      {at !== null && (
        <span className="text-fg-3/80 text-[10.5px]">
          ({formatRelative(locale, at)})
        </span>
      )}
      {age != null && (
        <span className="text-fg-3/80 text-[10.5px]">
          {t("cache.restored")}
        </span>
      )}
    </span>
  );
}
