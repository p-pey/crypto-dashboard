"use client";

import { motion } from "motion/react";
import { COUNTRIES } from "~/constants/countries";
import type { CountryId } from "~/constants/countries";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { TranslationKey } from "~/i18n/dictionaries/types";

const EASE = [0.16, 1, 0.3, 1] as const;

type Counts = Partial<Record<CountryId, { headlines: number; tone: number }>>;

/**
 * The country picker, deliberately the first control on the page.
 *
 * Every other panel is scoped to whatever is chosen here, and the buttons carry
 * their own headline count and pressure index so switching countries is a
 * comparison rather than a jump into the dark.
 */
export default function CountrySelector({
  value,
  onChange,
  counts,
}: {
  value: CountryId;
  onChange: (country: CountryId) => void;
  counts: Counts;
}) {
  const { locale, t } = useI18n();

  return (
    <section className="panel px-5 py-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-fg text-[10.5px] font-bold tracking-[0.14em] uppercase">
          {t("country.label")}
        </h2>
        <p className="text-fg-3 text-[11px]">{t("country.hint")}</p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {COUNTRIES.map((country) => {
          const active = country.id === value;
          const count = counts[country.id];

          return (
            <motion.button
              key={country.id}
              type="button"
              onClick={() => onChange(country.id)}
              aria-pressed={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="relative flex items-center gap-3 overflow-hidden rounded-[16px] border px-4 py-3 text-start transition-all duration-300"
              style={{
                borderColor: active
                  ? `color-mix(in srgb, ${country.accent} 55%, var(--border))`
                  : "var(--border)",
                background: active
                  ? `color-mix(in srgb, ${country.accent} 9%, transparent)`
                  : "color-mix(in srgb, var(--surface-2) 60%, transparent)",
                boxShadow: active
                  ? `0 18px 44px -30px ${country.accent}`
                  : undefined,
              }}
            >
              <span aria-hidden className="text-[26px] leading-none">
                {country.flag}
              </span>

              <span className="min-w-0 flex-1">
                <span className="text-fg block text-[14px] leading-tight font-bold">
                  {t(country.labelKey)}
                </span>
                <span className="text-fg-3 num mt-0.5 block text-[10.5px] font-semibold">
                  {country.currency} ·{" "}
                  {count
                    ? `${t("economy.headlines")} ${formatNumber(locale, count.headlines, { maximumFractionDigits: 0 })}`
                    : t(
                        `country.${country.includeRegional ? "regionalIn" : "regionalOut"}`,
                      )}
                </span>
              </span>

              {count && (
                <span className="flex flex-col items-end">
                  <span
                    dir="ltr"
                    className="num text-[17px] leading-none font-extrabold tabular-nums"
                    style={{
                      color:
                        Math.abs(count.tone) < 3
                          ? "var(--text-3)"
                          : count.tone > 0
                            ? "var(--down)"
                            : "var(--up)",
                    }}
                  >
                    {count.tone > 0 ? "+" : ""}
                    {Math.round(count.tone)}
                  </span>
                  <span className="text-fg-3 mt-1 text-[9.5px] font-semibold tracking-wider uppercase">
                    {t("economy.tone") as TranslationKey}
                  </span>
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
