/**
 * Notification sounds, synthesised with the Web Audio API.
 *
 * No audio files are shipped: every sound is generated from oscillators and a
 * gain envelope, which keeps the bundle small, avoids licensing questions, and
 * means a new sound is a few lines of code rather than a binary asset.
 *
 * The context is created lazily on the first user gesture because browsers
 * refuse to start audio before one, and each playback builds its own short
 * graph so overlapping alerts never cut each other off.
 */

export type AlarmSoundId = "chime" | "blip" | "coinDrop" | "siren" | "knock";

export const ALARM_SOUNDS: readonly AlarmSoundId[] = [
  "chime",
  "blip",
  "coinDrop",
  "siren",
  "knock",
];

type Tone = {
  /** Frequency in Hz. */
  freq: number;
  /** Offset from the start of the sound, in seconds. */
  at: number;
  /** How long the note rings, in seconds. */
  duration: number;
  type: OscillatorType;
  gain: number;
};

/** Each sound is a short arpeggio; the "up" and "down" variants transpose it. */
const SCORES: Record<AlarmSoundId, Tone[]> = {
  chime: [
    { freq: 784, at: 0, duration: 0.18, type: "sine", gain: 0.5 },
    { freq: 1046, at: 0.09, duration: 0.26, type: "sine", gain: 0.45 },
  ],
  blip: [{ freq: 1320, at: 0, duration: 0.09, type: "triangle", gain: 0.4 }],
  coinDrop: [
    { freq: 1568, at: 0, duration: 0.07, type: "square", gain: 0.22 },
    { freq: 1046, at: 0.06, duration: 0.16, type: "square", gain: 0.2 },
  ],
  siren: [
    { freq: 520, at: 0, duration: 0.16, type: "sawtooth", gain: 0.28 },
    { freq: 392, at: 0.16, duration: 0.16, type: "sawtooth", gain: 0.28 },
    { freq: 520, at: 0.32, duration: 0.2, type: "sawtooth", gain: 0.28 },
  ],
  knock: [
    { freq: 180, at: 0, duration: 0.1, type: "sine", gain: 0.6 },
    { freq: 150, at: 0.12, duration: 0.12, type: "sine", gain: 0.55 },
  ],
};

let context: AudioContext | null = null;
let unlocked = false;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/**
 * Unlocks audio. Browsers block sound until the page has been interacted with,
 * so this must be called from a click handler before any alert can make noise.
 */
export function unlockAlarmAudio(): boolean {
  const ctx = audioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") void ctx.resume();
  unlocked = ctx.state === "running";
  return unlocked;
}

export function isAlarmAudioReady(): boolean {
  return unlocked && context?.state === "running";
}

/** Transposition applied to a score for a pump versus a dump. */
function transpose(sound: AlarmSoundId, rising: boolean): number {
  if (rising) return 1;
  // A dump is the same motif a tone lower, so the two are distinguishable
  // without ear training.
  return sound === "knock" ? 0.75 : 0.79;
}

export function playAlarm(
  sound: AlarmSoundId,
  direction: "up" | "down",
  volume = 0.6,
): void {
  const ctx = audioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const factor = transpose(sound, direction === "up");

  for (const tone of SCORES[sound]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq * factor, now + tone.at);

    // A short attack then an exponential tail: a linear ramp to zero would
    // click on release.
    const start = now + tone.at;
    const end = start + tone.duration;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.gain * volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/* ------------------------------------------------------------------ *
 * Browser notifications
 * ------------------------------------------------------------------ */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission():
  NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(
  title: string,
  body: string,
  tag: string,
): void {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return;

  // Reusing a tag collapses repeats, which matters because a fast tape can
  // cross the threshold several times in a minute.
  new Notification(title, {
    body,
    tag,
    icon: "/favicon.ico",
    // A pump or a dump is time sensitive; leaving it in the tray is not useful.
    requireInteraction: false,
    silent: true, // the sound is synthesised separately, so the OS tone would double it
  });
}
