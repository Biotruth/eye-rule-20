export type Phase = 'WORK' | 'BREAK';
export type Mode = 'ALWAYS_ON' | 'SESSION';

export const DEFAULT_WORK_MINUTES = 20;
export const DEFAULT_BREAK_SECONDS = 20;

export const WORK_MINUTES_RANGE = { min: 5, max: 60 };
export const BREAK_SECONDS_RANGE = { min: 10, max: 60 };

/**
 * How many upcoming break-end transitions to keep scheduled as one-shot
 * local notifications at any given time. (The work-end alert is a single
 * indefinitely-repeating notification, not part of this count — see
 * notifications.ts.)
 */
export const CYCLES_TO_SCHEDULE = 8;

export const PAUSE_DURATION_MS = 60 * 60 * 1000; // "Pause 1 hour"

export const STORAGE_KEYS = {
  timerState: 'eyeRule20.timerState.v1',
  settings: 'eyeRule20.settings.v1',
  dailyStats: 'eyeRule20.dailyStats.v1',
} as const;

export interface ActiveHours {
  /** Minutes since local midnight, e.g. 540 = 9:00. */
  startMinutes: number;
  /** Minutes since local midnight, e.g. 1140 = 19:00. */
  endMinutes: number;
}

export const DEFAULT_ACTIVE_HOURS: ActiveHours = { startMinutes: 9 * 60, endMinutes: 19 * 60 };

/** Index 0 = Sunday ... 6 = Saturday, matching Date#getDay(). All on by default. */
export const DEFAULT_ACTIVE_WEEKDAYS: boolean[] = [true, true, true, true, true, true, true];

export interface Settings {
  workMinutes: number;
  breakSeconds: number;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  keepAwakeEnabled: boolean;
  /** Master "Eye reminders on/off" toggle for always-on mode. */
  remindersEnabled: boolean;
  /**
   * Opt-in: when false (the default), always-on mode just runs whenever
   * `remindersEnabled` is on and not manually paused — no time-of-day
   * gating at all. When true, it additionally auto-freezes outside
   * activeHours/activeWeekdays, restoring the original scheduled
   * behavior for anyone who wants it.
   */
  activeHoursEnabled: boolean;
  activeHours: ActiveHours;
  activeWeekdays: boolean[];
  /** Whether the first-launch "how it works" explainer has been dismissed. */
  onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  workMinutes: DEFAULT_WORK_MINUTES,
  breakSeconds: DEFAULT_BREAK_SECONDS,
  vibrationEnabled: true,
  soundEnabled: true,
  keepAwakeEnabled: true,
  remindersEnabled: true,
  activeHoursEnabled: false,
  activeHours: DEFAULT_ACTIVE_HOURS,
  activeWeekdays: DEFAULT_ACTIVE_WEEKDAYS,
  onboardingComplete: false,
};

/**
 * Persisted timer state. `phaseStartedAt` is the wall-clock timestamp
 * (ms since epoch) at which the CURRENT phase began. Remaining time is
 * always derived as (phaseStartedAt + phaseDurationMs) - Date.now(),
 * never accumulated via setInterval ticks, so it self-corrects across
 * backgrounding, app kills, and device sleep.
 *
 * `mode` selects which engine owns phase/isRunning right now:
 * - ALWAYS_ON: phase/isRunning are driven automatically by
 *   remindersEnabled + activeHours + pausedUntil (see activeHours.ts and
 *   TimerContext's tick loop) — there's no manual Start/Pause here.
 * - SESSION: phase/isRunning are driven manually via start()/pause()/
 *   reset(), exactly like the original single-mode app.
 */
export interface PersistedTimerState {
  mode: Mode;
  phase: Phase;
  phaseStartedAt: number;
  isRunning: boolean;
  /** ms remaining at the moment the timer was paused; null when running */
  pausedRemainingMs: number | null;
  cyclesCompletedToday: number;
  statsDate: string; // YYYY-MM-DD, local date the counter belongs to
  /** ALWAYS_ON only: while now < pausedUntil, alerts are suppressed. */
  pausedUntil: number | null;
  /** ALWAYS_ON only: an indefinite manual pause, cleared only by an explicit Resume — independent of (and freezes on top of) any active-hours schedule. */
  manuallyPaused: boolean;
  /**
   * Set by "Snooze 5 min" to the instant the snooze ends. While non-null,
   * the OS-level work-end alert is a temporary one-shot instead of its
   * normal repeating self (see scheduleWorkEndSnoozeAsync) — once
   * now >= snoozedUntil, TimerContext restores the repeating alert and
   * clears this. Independent of pausedUntil: snoozing delays one alert
   * without freezing the phase loop the way a pause does.
   */
  snoozedUntil: number | null;
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
