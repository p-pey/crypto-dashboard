"use client";

import { Badge, Popover, Switch, Tooltip } from "antd";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { useState } from "react";
import {
  formatNumber,
  formatRelative,
  formatSignedPercent,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { ALARM_SOUNDS, useAlerts } from "~/providers/AlertProvider";
import type { TranslationKey } from "~/i18n/dictionaries/types";

const SOUND_LABEL_KEYS: Record<string, TranslationKey> = {
  chime: "alerts.sounds.chime",
  blip: "alerts.sounds.blip",
  coinDrop: "alerts.sounds.coinDrop",
  siren: "alerts.sounds.siren",
  knock: "alerts.sounds.knock",
};

/**
 * Alarm configuration and the log of alerts raised this session.
 *
 * The panel is the only place a user has to acknowledge that audio is
 * blocked until a click, so enabling anything here is what unlocks the sound.
 */
export default function AlertBell() {
  const { locale, t } = useI18n();
  const {
    settings,
    update,
    history,
    dismiss,
    audioReady,
    permission,
    enableNotifications,
    preview,
  } = useAlerts();
  const [open, setOpen] = useState(false);

  const canNotify = permission === "granted";

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      trigger="click"
      content={
        <div className="flex w-[290px] flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-[12.5px] font-semibold">
            <span>{t("alerts.enable")}</span>
            <Switch
              size="small"
              checked={settings.enabled}
              onChange={(checked) => {
                if (checked) preview();
                update({ enabled: checked });
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold">
            <span className="text-fg-3">{t("alerts.sound")}</span>
            <select
              value={settings.sound}
              onChange={(event) => {
                update({
                  sound: event.target.value as (typeof ALARM_SOUNDS)[number],
                });
                preview();
              }}
              className="border-line bg-surface-2 text-fg rounded-lg border px-2 py-1.5 text-[12px]"
            >
              {ALARM_SOUNDS.map((sound) => (
                <option key={sound} value={sound}>
                  {t(SOUND_LABEL_KEYS[sound] ?? "alerts.sounds.chime")}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold">
            <span className="text-fg-3 flex justify-between">
              <span>{t("alerts.threshold")}</span>
              <span className="num">
                {formatNumber(locale, settings.thresholdPercent, {
                  maximumFractionDigits: 2,
                })}
                {t("common.percent")}
              </span>
            </span>
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={settings.thresholdPercent}
              onChange={(event) =>
                update({ thresholdPercent: Number(event.target.value) })
              }
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold">
            <span className="text-fg-3 flex justify-between">
              <span>{t("alerts.window")}</span>
              <span className="num">{settings.windowSeconds}s</span>
            </span>
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={settings.windowSeconds}
              onChange={(event) =>
                update({ windowSeconds: Number(event.target.value) })
              }
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold">
            <span className="text-fg-3 flex justify-between">
              <span>{t("alerts.volume")}</span>
              <span className="num">{Math.round(settings.volume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(event) =>
                update({ volume: Number(event.target.value) })
              }
            />
          </label>

          <div className="border-line flex items-center justify-between gap-2 border-t pt-2.5">
            <span className="text-[11.5px] font-semibold">
              {t("alerts.notifications")}
            </span>
            {canNotify ? (
              <Switch
                size="small"
                checked={settings.notify}
                onChange={(checked) => update({ notify: checked })}
              />
            ) : (
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="border-line text-brand-2 rounded-full border px-2.5 py-1 text-[11px] font-bold"
              >
                {t("alerts.allow")}
              </button>
            )}
          </div>

          {!audioReady && settings.enabled && (
            <p className="text-amber text-[11px] leading-relaxed">
              {t("alerts.audioHint")}
            </p>
          )}

          <div className="border-line flex flex-col gap-1.5 border-t pt-2.5">
            <span className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
              {t("alerts.history")}
            </span>
            {history.length === 0 ? (
              <p className="text-fg-3 text-[11px]">
                {t("alerts.historyEmpty")}
              </p>
            ) : (
              history.slice(0, 6).map((move) => (
                <button
                  key={`${move.key}-${move.detectedAt}`}
                  type="button"
                  onClick={() => dismiss(move.detectedAt)}
                  className="text-start"
                >
                  <span className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span
                      className="font-bold"
                      style={{
                        color:
                          move.direction === "up"
                            ? "var(--mint)"
                            : "var(--rose)",
                      }}
                    >
                      {move.label}
                    </span>
                    <span className="num text-fg-2 font-semibold">
                      {formatSignedPercent(locale, move.changePercent)}
                    </span>
                  </span>
                  <span className="text-fg-3 text-[10px]">
                    {formatRelative(locale, move.detectedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      }
    >
      <Tooltip title={t("alerts.title")}>
        <Badge count={history.length} size="small" offset={[2, 2]}>
          <button
            type="button"
            onClick={preview}
            aria-label={t("alerts.title")}
            className="border-line bg-surface-2/70 text-fg-2 hover:border-brand/50 hover:text-fg relative grid size-10 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 active:scale-95"
          >
            {settings.enabled ? (
              <Bell className="size-[17px]" strokeWidth={2.1} />
            ) : (
              <BellOff className="text-fg-3 size-[17px]" strokeWidth={2.1} />
            )}
            {settings.enabled && audioReady && (
              <Volume2
                aria-hidden
                className="text-mint absolute -end-0.5 -bottom-0.5 size-3"
                strokeWidth={2.6}
              />
            )}
          </button>
        </Badge>
      </Tooltip>
    </Popover>
  );
}
