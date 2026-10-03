"use client";

import { Empty } from "antd";
import { Meter, Panel, TONE_COLOR, toneForSign } from "~/components/ui";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { EconomyFactor } from "~/services/macro/countryEconomy";
import { factorKey } from "./factorLabels";

/**
 * The macro channels, ranked by how much of the country's news each explains.
 *
 * Two numbers per row on purpose: the signed pressure, and the share of matched
 * headlines the channel is responsible for. A channel at −80 on four headlines
 * and one at −20 on forty are not the same signal, and showing only the first
 * hides that.
 */
export default function FactorBars({ factors }: { factors: EconomyFactor[] }) {
  const { locale, t } = useI18n();

  if (factors.length === 0) {
    return (
      <Panel title={t("economy.factorsChart")}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("economy.noFactors")}
        />
      </Panel>
    );
  }

  return (
    <Panel title={t("economy.factorsChart")} hint={t("economy.factorsHint")}>
      <ul className="flex flex-col gap-2.5">
        {factors.map((factor) => {
          const key = factorKey(factor.id);
          const tone = toneForSign(factor.pressure, 3);

          return (
            <li
              key={factor.id}
              className="grid grid-cols-[minmax(84px,1.1fr)_minmax(0,2fr)_auto] items-center gap-3"
            >
              <div className="min-w-0">
                <p className="text-fg-2 truncate text-[11.5px] font-semibold">
                  {key ? t(key) : factor.id}
                </p>
                <p className="text-fg-3 num text-[10px] tabular-nums">
                  {t("economy.factorArticles", factor.articles)} ·{" "}
                  {t(
                    "economy.factorShare",
                    formatNumber(locale, factor.share * 100, {
                      maximumFractionDigits: 0,
                    }),
                  )}
                  %
                </p>
              </div>

              <Meter
                value={factor.pressure}
                tone={tone}
                height={10}
                label={key ? t(key) : factor.id}
              />

              <span
                dir="ltr"
                className="num w-12 text-end text-[12px] font-bold tabular-nums"
                style={{ color: TONE_COLOR[tone] }}
              >
                {factor.pressure > 0 ? "+" : ""}
                {Math.round(factor.pressure)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
