"use client";

import { motion } from "motion/react";
import { Stat, StatGrid, toneForSign } from "~/components/ui";
import { formatNumber, formatSignedPercent } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { CountryEconomy } from "~/services/macro/countryEconomy";
import { factorKey } from "./factorLabels";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Staggers a tile so a country switch reads as a change rather than a reload.
 *
 * Kept here rather than in the design system because the system has no opinion
 * about when a grid should animate — that is a page-level decision.
 */
function Tile({
  delay = 0,
  ...stat
}: {
  delay?: number;
  label: string;
  value: string;
  hint?: string;
  tone?: Parameters<typeof Stat>[0]["tone"];
  meter?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      <Stat {...stat} />
    </motion.div>
  );
}

/**
 * The country's scorecard.
 *
 * Eight figures and no sentences: two signed indices, the headline flow, four
 * ratios that say how much to trust those indices, and the channel currently
 * doing the most damage. Everything is a number so the page can be scanned in
 * one pass.
 *
 * Every bar is a `meter` on a `Stat`, which is what makes the grid line up: the
 * tile heights are equal whether or not a figure has a bar under it.
 */
export default function EconomyKpis({ economy }: { economy: CountryEconomy }) {
  const { locale, t } = useI18n();

  const top = economy.factors.reduce<(typeof economy.factors)[number] | null>(
    (best, factor) =>
      best === null || factor.articles > best.articles ? factor : best,
    null,
  );
  const topKey = top ? factorKey(top.id) : null;

  const ratio = (value: number) =>
    formatNumber(locale, value, { maximumFractionDigits: 0 });

  return (
    <StatGrid min={150}>
      <Tile
        label={t("economy.tone")}
        value={signed(economy.tone, ratio)}
        hint={t("economy.toneHint")}
        tone={toneForSign(economy.tone, 3)}
        meter={economy.tone / 100}
      />
      <Tile
        label={t("economy.risk")}
        value={signed(economy.risk, ratio)}
        hint={t("economy.riskHint")}
        tone={toneForSign(economy.risk, 3)}
        meter={economy.risk / 100}
      />
      <Tile
        label={t("economy.pressure")}
        value={signed(economy.pressure, ratio)}
        hint={`${economy.factors.length} ch`}
        tone={toneForSign(economy.pressure, 3)}
        meter={economy.pressure / 100}
        delay={0.04}
      />
      <Tile
        label={t("economy.flow")}
        value={formatSignedPercent(locale, economy.flowMomentum * 100, 0)}
        hint={t("economy.flowHint")}
        tone={toneForSign(economy.flowMomentum, 0.05)}
        delay={0.08}
      />
      <Tile
        label={t("economy.headlines")}
        value={ratio(economy.headlines24h)}
        hint={`${economy.headlines} total`}
        delay={0.12}
      />
      <Tile
        label={t("economy.coverage")}
        value={`${ratio(economy.coverage * 100)}%`}
        tone={economy.coverage > 0.6 ? "brand" : "amber"}
        meter={economy.coverage}
        delay={0.16}
      />
      <Tile
        label={t("economy.relevance")}
        value={`${ratio(economy.relevance * 100)}%`}
        tone="cyan"
        meter={economy.relevance}
        delay={0.2}
      />
      <Tile
        label={t("economy.topFactor")}
        value={topKey ? t(topKey) : "—"}
        hint={
          top
            ? `${t("economy.factorArticles", top.articles)} · ${t(
                "economy.factorShare",
                `${ratio(top.share * 100)}%`,
              )}`
            : t("economy.noFactors")
        }
        tone={top ? toneForSign(top.pressure, 3) : ("muted" as const)}
        delay={0.24}
      />
    </StatGrid>
  );
}

function signed(value: number, format: (value: number) => string): string {
  return value > 0 ? `+${format(value)}` : format(value);
}
