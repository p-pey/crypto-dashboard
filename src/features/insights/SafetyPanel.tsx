"use client";

import { Input } from "antd";
import { motion } from "motion/react";
import { useState } from "react";
import {
  Dot,
  Label,
  Panel,
  PanelBox,
  Pill,
  Stat,
  StatGrid,
  toneForSign,
} from "~/components/ui";
import { formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Token scam screening.
 *
 * The only feature here whose purpose is to **stop** the user doing something
 * harmful rather than to inform them, which changes how it is written:
 *
 * - **Two independent checkers, fused.** GoPlus reads the contract and reasons
 *   about it; Honeypot.is simulates a real buy and sell against the live pool.
 *   They fail differently, so two clears means more than one clear.
 * - **Disagreement is flagged, not resolved.** If one says honeypot and the other
 *   does not, the token is marked risky. Taking the optimistic reading of a
 *   disagreement is the precise failure this panel exists to prevent.
 * - **Taxes are checked alongside the honeypot flag.** A 25% sell tax that skips a
 *   simple transfer is a scam that a honeypot check alone passes.
 * - **The chain comes from the address's shape, not the request.** A safety check
 *   that quietly ran against the wrong chain would be worse than none.
 *
 * The verdict is a screening aid and the panel says so. "No flags" is not "safe",
 * and asserting otherwise would be the panel overstating itself.
 */
export default function SafetyPanel() {
  const { locale, t } = useI18n();
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isFetching, dataUpdatedAt } = api.insights.tokenSafety.useQuery(
    { address: submitted },
    {
      // No polling: a check is a point-in-time judgement about a contract that can
      // change, and re-running it every few minutes would be theatre rather than
      // freshness. The user re-checks by re-submitting.
      enabled: submitted.length > 0,
      staleTime: 5 * 60_000,
      retry: false,
    },
  );

  const safety = data?.safety ?? null;

  const verdictTone =
    safety === null
      ? "muted"
      : safety.verdict === "risk"
        ? "down"
        : safety.verdict === "ok"
          ? "up"
          : "muted";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("safety.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("safety.subtitle")}
          </p>
        </div>
        <Pill tone="muted" size="sm">
          {t("safety.source")}
        </Pill>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onPressEnter={() => {
            const next = address.trim();
            if (next.length > 0) setSubmitted(next);
          }}
          placeholder={t("safety.placeholder")}
          dir="ltr"
          style={{ width: 460, maxWidth: "100%" }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => {
            const next = address.trim();
            if (next.length > 0) setSubmitted(next);
          }}
          disabled={address.trim().length === 0 || isFetching}
          className="from-brand to-brand-2 text-white hover:opacity-90 disabled:opacity-40 rounded-[10px] bg-gradient-to-br px-4 text-[12px] font-bold transition-opacity"
        >
          {isFetching ? t("safety.checking") : t("safety.check")}
        </button>
      </div>

      {submitted.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{t("safety.disclaimer")}</p>
        </PanelBox>
      ) : (
        <>
          <StatGrid min={130} className="mb-4">
            <Stat
              label={t("safety.verdictLabel")}
              value={
                safety === null
                  ? "—"
                  : safety.verdict === "risk"
                    ? t("safety.verdictRisk")
                    : safety.verdict === "ok"
                      ? t("safety.verdictOk")
                      : t("safety.verdictUnknown")
              }
              tone={verdictTone}
            />
            <Stat
              label={t("safety.honeypot")}
              value={
                safety?.goplusHoneypot === null && safety?.honeypotIsHoneypot === null
                  ? "—"
                  : safety?.goplusHoneypot === true ||
                      safety?.honeypotIsHoneypot === true
                    ? t("safety.honeypot")
                    : t("safety.notHoneypot")
              }
              tone={
                safety?.goplusHoneypot === true || safety?.honeypotIsHoneypot === true
                  ? "down"
                  : safety?.goplusHoneypot === false &&
                      safety?.honeypotIsHoneypot === false
                    ? "up"
                    : "muted"
              }
            />
            <Stat
              label={t("safety.sellTax")}
              value={
                safety?.sellTax == null
                  ? "—"
                  : formatNumber(locale, safety.sellTax, {
                      maximumFractionDigits: 2,
                    }) + "%"
              }
              tone={
                safety?.sellTax == null
                  ? undefined
                  : safety.sellTax >= 25
                    ? "down"
                    : safety.sellTax >= 10
                      ? "amber"
                      : "up"
              }
            />
            <Stat
              label={t("safety.topTen")}
              value={
                safety?.topTenShare == null
                  ? "—"
                  : formatNumber(locale, safety.topTenShare, {
                      maximumFractionDigits: 1,
                    }) + "%"
              }
              tone={toneForSign(
                safety?.topTenShare == null ? null : -(safety.topTenShare ?? 0),
                30,
              )}
              hint={t("safety.chainDetected")}
            />
          </StatGrid>

          {safety === null ? (
            <PanelBox>
              <p className="text-fg-3 text-[11px]">
                {data?.error ?? t("safety.invalid")}
              </p>
            </PanelBox>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Pill tone={verdictTone} size="sm">
                  <Dot tone={verdictTone} />
                  {safety.chain}
                </Pill>
                <Pill
                  tone={safety.sources.goplus && safety.sources.honeypotIs ? "up" : "amber"}
                  size="sm"
                >
                  {safety.sources.goplus && safety.sources.honeypotIs
                    ? t("safety.bothCheckers")
                    : safety.sources.goplus || safety.sources.honeypotIs
                      ? t("safety.oneChecker")
                      : t("safety.noCheckers")}
                </Pill>
                {dataUpdatedAt > 0 && (
                  <span className="text-fg-3 text-[10.5px]">
                    {formatRelative(locale, dataUpdatedAt)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {safety.reasons.map((reason, index) => (
                  <div
                    key={`${reason.code}-${index}`}
                    className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2 ${
                      reason.severity === "critical"
                        ? "border-down/30 bg-down/6"
                        : reason.severity === "warning"
                          ? "border-amber/30 bg-amber/6"
                          : "border-line bg-surface-2/40"
                    }`}
                  >
                    <Pill
                      tone={
                        reason.severity === "critical"
                          ? "down"
                          : reason.severity === "warning"
                            ? "amber"
                            : "muted"
                      }
                      size="sm"
                    >
                      {reason.code}
                    </Pill>
                    <span className="text-fg-2 flex-1 text-[11px] leading-relaxed">
                      {reason.detail}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-3">
                <Flag
                  label={t("safety.buyTax")}
                  value={
                    safety.buyTax == null
                      ? "—"
                      : formatNumber(locale, safety.buyTax, {
                          maximumFractionDigits: 2,
                        }) + "%"
                  }
                />
                <Flag
                  label={t("safety.mintable")}
                  value={safety.isMintable === null ? "—" : safety.isMintable ? t("safety.flagYes") : t("safety.flagNo")}
                  tone={safety.isMintable === true ? "down" : undefined}
                />
                <Flag
                  label={t("safety.blacklist")}
                  value={
                    safety.canTakeBackOwnership === null
                      ? "—"
                      : safety.canTakeBackOwnership
                        ? t("safety.flagYes")
                        : t("safety.flagNo")
                  }
                  tone={safety.canTakeBackOwnership === true ? "amber" : undefined}
                />
                <Flag
                  label={t("safety.proxy")}
                  value={safety.isProxy === null ? "—" : safety.isProxy ? t("safety.flagYes") : t("safety.flagNo")}
                  tone={safety.isProxy === true ? "amber" : undefined}
                />
                <Flag
                  label={t("safety.verified")}
                  value={
                    safety.isVerified === null
                      ? "—"
                      : safety.isVerified
                        ? t("safety.flagYes")
                        : t("safety.flagNo")
                  }
                  tone={safety.isVerified === false ? "amber" : undefined}
                />
                <Flag
                  label={t("safety.holders")}
                  value={
                    safety.holderCount == null
                      ? "—"
                      : formatNumber(locale, safety.holderCount)
                  }
                />
              </div>
            </>
          )}

          <p className="text-fg-3 mt-3 text-[10px] leading-relaxed">
            {t("safety.disclaimer")}
          </p>
        </>
      )}
    </motion.section>
  );
}

function Flag({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "down" | "amber" | "up";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <Label>{label}</Label>
      <span
        className="text-[11.5px] font-bold"
        style={{
          color: tone ? `var(--${tone})` : "var(--fg)",
        }}
      >
        {value}
      </span>
    </div>
  );
}