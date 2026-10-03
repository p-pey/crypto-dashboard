"use client";

import { Dot, Pill } from "~/components/ui";
import { useI18n } from "~/i18n/I18nProvider";
import type { VenueOutcome } from "~/services/derivatives/venue.port";

/**
 * Which venues answered, on screen.
 *
 * This component exists because of one rule: **a panel showing three exchanges
 * without saying the other four failed is worse than no panel at all.** It reads
 * as a complete answer, and the reader has no way to know it is a third of one.
 *
 * So three states are distinguished rather than collapsed into two:
 *
 * - answered, with how many rows it contributed;
 * - attempted and failed, with the reason — a network fact about here and now;
 * - **does not publish this feed** — an industry fact, not an outage.
 *
 * The last one is the reason this is a component rather than a line of text. Four
 * of the seven venues have no liquidations feed at all, and rendering that in the
 * same red as a timeout would blame the market for a network problem.
 */
export default function VenueReport({
  venues,
  className = "",
}: {
  venues: readonly VenueOutcome[];
  className?: string;
}) {
  const { t } = useI18n();

  if (venues.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {venues.map((venue) => {
        if (venue.unsupported) {
          return (
            <Pill
              key={venue.id}
              tone="muted"
              size="sm"
              title={venue.error ?? undefined}
            >
              <Dot tone="muted" />
              {venue.label}
            </Pill>
          );
        }

        if (!venue.ok) {
          return (
            <Pill
              key={venue.id}
              tone="amber"
              size="sm"
              title={`${t("derivativesPage.failed")}: ${venue.error ?? ""}`}
            >
              <Dot tone="amber" />
              {venue.label}
            </Pill>
          );
        }

        return (
          <Pill
            key={venue.id}
            tone="up"
            size="sm"
            title={t("derivativesPage.answered")}
          >
            <Dot tone="up" />
            {venue.label}
            {venue.count !== undefined && venue.count > 0 && (
              <span className="opacity-60">{venue.count}</span>
            )}
          </Pill>
        );
      })}
    </div>
  );
}
