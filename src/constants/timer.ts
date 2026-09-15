export type Phase = 'WORK' | 'BREAK';

export const DEFAULT_WORK_MINUTES = 20;
export const DEFAULT_BREAK_SECONDS = 20;

export const WORK_MINUTES_RANGE = { min: 5, max: 60 };
export const BREAK_SECONDS_RANGE = { min: 10, max: 60 };

/**
 * How many upcoming phase-transitions to keep scheduled as local
 * notifications at any given time. A "cycle" is one WORK phase + one BREAK
 * phase, so this schedules CYCLES_TO_SCHEDULE work-end notifications and the
 * same number of break-end notifications, interleaved.
 */
export const CYCLES_TO_SCHEDULE = 8;

export const STORAGE_KEYS = {
  timerState: 'eyeRule20.timerState.v1',
  settings: 'eyeRule20.settings.v1',
  dailyStats: 'eyeRule20.dailyStats.v1',
} as const;

export interface Settings {
  workMinutes: number;
  breakSeconds: number;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  keepAwakeEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  workMinutes: DEFAULT_WORK_MINUTES,
  breakSeconds: DEFAULT_BREAK_SECONDS,
  vibrationEnabled: true,
  soundEnabled: true,
  keepAwakeEnabled: true,
};

/**
 * Persisted timer state. `phaseStartedAt` is the wall-clock timestamp
 * (ms since epoch) at which the CURRENT phase began. Remaining time is
 * always derived as (phaseStartedAt + phaseDurationMs) - Date.now(),
 * never accumulated via setInterval ticks, so it self-corrects across
 * backgrounding, app kills, and device sleep.
 */
export interface PersistedTimerState {
  phase: Phase;
  phaseStartedAt: number;
  isRunning: boolean;
  /** ms remaining at the moment the timer was paused; null when running */
  pausedRemainingMs: number | null;
  cyclesCompletedToday: number;
  statsDate: string; // YYYY-MM-DD, local date the counter belongs to
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
