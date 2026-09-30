"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ALARM_SOUNDS,
  isAlarmAudioReady,
  notificationPermission,
  playAlarm,
  requestNotificationPermission,
  showNotification,
  unlockAlarmAudio,
  type AlarmSoundId,
} from "~/lib/alarmSound";
import {
  DEFAULT_MOVE_CONFIG,
  PriceMoveDetector,
  type PriceMove,
} from "~/services/alerts/PriceMoveDetector";

export type AlertSettings = {
  enabled: boolean;
  sound: AlarmSoundId;
  volume: number;
  notify: boolean;
  thresholdPercent: number;
  windowSeconds: number;
  cooldownSeconds: number;
};

const STORAGE_KEY = "obsidian.alerts.v1";

const DEFAULT_SETTINGS: AlertSettings = {
  enabled: true,
  sound: "chime",
  volume: 0.6,
  notify: false,
  thresholdPercent: DEFAULT_MOVE_CONFIG.thresholdPercent,
  windowSeconds: DEFAULT_MOVE_CONFIG.windowMs / 1000,
  cooldownSeconds: DEFAULT_MOVE_CONFIG.cooldownMs / 1000,
};

/* ------------------------------------------------------------------ *
 * Settings store
 *
 * `localStorage` is an external mutable store, so it is read through
 * `useSyncExternalStore` rather than copied into state inside an effect. That
 * keeps the server snapshot and the client snapshot consistent through
 * hydration, and means a change made in another tab is picked up for free.
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedSettings: AlertSettings = DEFAULT_SETTINGS;

function readStore(): AlertSettings {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSettings;

  cachedRaw = raw;
  try {
    cachedSettings = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AlertSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
  }
  return cachedSettings;
}

function writeStore(next: AlertSettings): void {
  cachedSettings = next;
  cachedRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // A blocked storage quota should not stop the alarm from working.
  }
  for (const listener of listeners) listener();
}

function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const getServerSettings = () => DEFAULT_SETTINGS;

const AlertContext = createContext<AlertContextValue | null>(null);

type AlertContextValue = {
  settings: AlertSettings;
  update: (patch: Partial<AlertSettings>) => void;
  /** Feed a live price in. Returns the move if this tick crossed the threshold. */
  watch: (key: string, label: string, price: number) => PriceMove | null;
  /** Most recent alert, newest first, capped so the panel cannot grow forever. */
  history: PriceMove[];
  dismiss: (detectedAt: number) => void;
  /** Audio has been unlocked by a user gesture, so alerts can make noise. */
  audioReady: boolean;
  /** Whether the browser will show a notification. */
  permission: NotificationPermission | "unsupported";
  enableNotifications: () => Promise<boolean>;
  preview: () => void;
};

/**
 * Watches live prices and raises an alert when one moves past the threshold
 * inside the window.
 *
 * Mounted once in the app shell so any page feeding prices into
 * {@link AlertContextValue.watch} gets alerts, and settings persist across
 * reloads. The detector is a plain class in a ref: it is high frequency mutable
 * state and must never drive a render of its own.
 */
export default function AlertProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    readStore,
    getServerSettings,
  );

  const [history, setHistory] = useState<PriceMove[]>([]);
  const [audioReady, setAudioReady] = useState(false);
  // Read lazily: permission only ever changes as a result of this component's
  // own request, or when the tab is brought back into view.
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window === "undefined" ? "unsupported" : notificationPermission(),
  );

  const detector = useRef(new PriceMoveDetector());
  // `watch` is a stable callback, so it cannot close over `settings` directly;
  // the ref gives it the current values without becoming a new function on
  // every settings change, which would churn every subscriber.
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
    detector.current.setConfig({
      thresholdPercent: settings.thresholdPercent,
      windowMs: settings.windowSeconds * 1000,
      cooldownMs: settings.cooldownSeconds * 1000,
    });
  }, [settings]);

  useEffect(() => {
    // Only set state from the event callback, never from the effect body.
    const onVisibility = () => setPermission(notificationPermission());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const update = useCallback((patch: Partial<AlertSettings>) => {
    writeStore({ ...readStore(), ...patch });
  }, []);

  const watch = useCallback(
    (key: string, label: string, price: number): PriceMove | null => {
      const current = settingsRef.current;
      if (!current.enabled) return null;

      const move = detector.current.record(key, label, price);
      if (!move) return null;

      if (isAlarmAudioReady()) {
        playAlarm(current.sound, move.direction, current.volume);
      }
      if (current.notify) {
        const sign = move.changePercent > 0 ? "+" : "";
        showNotification(
          `${move.label} ${move.direction === "up" ? "pump" : "dump"}`,
          `${sign}${move.changePercent.toFixed(2)}% in ${current.windowSeconds}s · ${move.price}`,
          `move-${move.key}`,
        );
      }

      setHistory((prev) => [move, ...prev].slice(0, 40));
      return move;
    },
    [],
  );

  const dismiss = useCallback((detectedAt: number) => {
    setHistory((prev) => prev.filter((move) => move.detectedAt !== detectedAt));
  }, []);

  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermission(notificationPermission());
    if (granted) writeStore({ ...readStore(), notify: true });
    return granted;
  }, []);

  const preview = useCallback(() => {
    // Any click counts as the gesture that unlocks audio.
    setAudioReady(unlockAlarmAudio());
    playAlarm(readStore().sound, "up", readStore().volume);
  }, []);

  const value = useMemo<AlertContextValue>(
    () => ({
      settings,
      update,
      watch,
      history,
      dismiss,
      audioReady,
      permission,
      enableNotifications,
      preview,
    }),
    [
      audioReady,
      dismiss,
      enableNotifications,
      history,
      permission,
      preview,
      settings,
      update,
      watch,
    ],
  );

  return (
    <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
  );
}

export function useAlerts(): AlertContextValue {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlerts must be used inside <AlertProvider>");
  }
  return context;
}

export { ALARM_SOUNDS };
export type { AlarmSoundId };
