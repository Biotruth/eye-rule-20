import * as Haptics from 'expo-haptics';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  DEFAULT_SETTINGS,
  Phase,
  PersistedTimerState,
  Settings,
  todayKey,
} from '@/constants/timer';
import {
  cancelAllScheduledAsync,
  configureAndroidChannelAsync,
  configureNotificationHandler,
  getPermissionStateAsync,
  requestPermissionsAsync,
  scheduleBreakEndWindowAsync,
  scheduleWorkEndRepeatingAsync,
} from '@/notifications/notifications';
import { loadSettings, loadTimerState, saveSettings, saveTimerState } from '@/storage/storage';

function phaseDurationMs(phase: Phase, settings: Settings): number {
  return phase === 'WORK' ? settings.workMinutes * 60_000 : settings.breakSeconds * 1_000;
}

/**
 * The single source of truth for "where are we right now": given a
 * persisted anchor (phase + the timestamp it started) and the current
 * settings, walk forward through however many phase transitions have
 * elapsed in real time since that anchor, and return the caught-up state
 * plus how many WORK->BREAK->WORK cycles were completed along the way.
 *
 * This same function is used for the 250ms UI tick (where the loop body
 * runs zero or one times) and for the app-foreground recalculation (where
 * the loop can run many times if the app was backgrounded for hours) —
 * there is no separate "resync after background" code path, which is what
 * guarantees the countdown can never drift: it is never incremented, only
 * ever recomputed from phaseStartedAt and Date.now().
 */
function advanceToNow(
  state: PersistedTimerState,
  settings: Settings,
  now: number,
): { state: PersistedTimerState; cyclesCompletedNow: number } {
  let { phase, phaseStartedAt, cyclesCompletedToday, statsDate } = state;
  let cyclesCompletedNow = 0;

  if (state.isRunning) {
    let elapsed = now - phaseStartedAt;
    let duration = phaseDurationMs(phase, settings);

    while (elapsed >= duration) {
      elapsed -= duration;
      phaseStartedAt += duration;

      const today = todayKey(new Date(phaseStartedAt));
      if (today !== statsDate) {
        statsDate = today;
        cyclesCompletedToday = 0;
      }

      if (phase === 'BREAK') {
        cyclesCompletedToday += 1;
        cyclesCompletedNow += 1;
      }
      phase = phase === 'WORK' ? 'BREAK' : 'WORK';
      duration = phaseDurationMs(phase, settings);
    }
  }

  return {
    state: { ...state, phase, phaseStartedAt, cyclesCompletedToday, statsDate },
    cyclesCompletedNow,
  };
}

function remainingMsFor(state: PersistedTimerState, settings: Settings, now: number): number {
  const duration = phaseDurationMs(state.phase, settings);
  if (!state.isRunning) {
    return state.pausedRemainingMs ?? duration;
  }
  return Math.max(0, duration - (now - state.phaseStartedAt));
}

interface TimerContextValue {
  phase: Phase;
  remainingMs: number;
  phaseDurationMs: number;
  isRunning: boolean;
  cyclesCompletedToday: number;
  settings: Settings;
  hydrated: boolean;
  notificationsGranted: boolean;
  canAskAgain: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skipBreak: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
  requestNotificationPermission: () => Promise<void>;
  refreshPermissionState: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

function freshState(): PersistedTimerState {
  return {
    phase: 'WORK',
    phaseStartedAt: Date.now(),
    isRunning: false,
    pausedRemainingMs: null,
    cyclesCompletedToday: 0,
    statsDate: todayKey(),
  };
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timerState, setTimerState] = useState<PersistedTimerState>(freshState());
  const [remainingMs, setRemainingMs] = useState<number>(phaseDurationMs('WORK', DEFAULT_SETTINGS));
  const [hydrated, setHydrated] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;
  const lastPhaseRef = useRef<Phase>(timerState.phase);

  // ---- hydration: load persisted state once on launch ----
  useEffect(() => {
    (async () => {
      configureNotificationHandler();
      await configureAndroidChannelAsync();

      const [loadedSettings, loadedState, permission] = await Promise.all([
        loadSettings(),
        loadTimerState(),
        getPermissionStateAsync(),
      ]);

      const initialSettings = loadedSettings;
      const initialState = loadedState ?? freshState();

      setSettings(initialSettings);

      // First launch: the OS has never asked, so prompt immediately
      // (spec: request permissions on first launch). On every later
      // launch this is a no-op since status is no longer undetermined.
      let effectivePermission = permission;
      if (permission.undetermined) {
        effectivePermission = await requestPermissionsAsync();
      }
      setNotificationsGranted(effectivePermission.granted);
      setCanAskAgain(effectivePermission.canAskAgain);

      // Catch up immediately in case the app was killed and relaunched
      // after one or more phases would have elapsed.
      const { state: caughtUp } = advanceToNow(initialState, initialSettings, Date.now());
      setTimerState(caughtUp);
      lastPhaseRef.current = caughtUp.phase;
      setRemainingMs(remainingMsFor(caughtUp, initialSettings, Date.now()));
      await saveTimerState(caughtUp);

      if (caughtUp.isRunning) {
        // Deliberately does NOT touch the repeating work-end alert here.
        // If it was armed before this launch (including before an app
        // kill), it has already been ticking on its own inside the OS
        // this whole time and needs no help — only the break-end one-shot
        // window needs topping up, since one-shots don't survive being
        // consumed by time the way a repeating trigger does.
        await scheduleBreakEndWindowAsync({
          phase: caughtUp.phase,
          phaseStartedAt: caughtUp.phaseStartedAt,
          workDurationMs: initialSettings.workMinutes * 60_000,
          breakDurationMs: initialSettings.breakSeconds * 1_000,
          soundEnabled: initialSettings.soundEnabled,
        });
      }

      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fireForegroundAlert = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  // ---- the tick loop: recompute from timestamps, never accumulate ----
  useEffect(() => {
    if (!hydrated) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const current = timerStateRef.current;
      const currentSettings = settingsRef.current;

      if (!current.isRunning) {
        setRemainingMs(remainingMsFor(current, currentSettings, now));
        return;
      }

      const { state: nextState } = advanceToNow(current, currentSettings, now);

      if (nextState.phase !== current.phase || nextState.phaseStartedAt !== current.phaseStartedAt) {
        // A phase boundary (or several, if the tick was delayed) was
        // crossed since the last tick. Persist the new anchor and fire
        // the in-app alert for the transition into the phase we're in now.
        timerStateRef.current = nextState;
        setTimerState(nextState);
        saveTimerState(nextState).catch(() => {});
        if (nextState.phase !== lastPhaseRef.current) {
          lastPhaseRef.current = nextState.phase;
          fireForegroundAlert();
        }
      }

      setRemainingMs(remainingMsFor(nextState, currentSettings, now));
    }, 250);

    return () => clearInterval(interval);
  }, [hydrated, fireForegroundAlert]);

  // ---- AppState: recalculate the instant we return to foreground ----
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      const now = Date.now();
      const current = timerStateRef.current;
      const currentSettings = settingsRef.current;
      const { state: nextState } = advanceToNow(current, currentSettings, now);

      timerStateRef.current = nextState;
      setTimerState(nextState);
      setRemainingMs(remainingMsFor(nextState, currentSettings, now));
      saveTimerState(nextState).catch(() => {});

      if (nextState.phase !== lastPhaseRef.current) {
        lastPhaseRef.current = nextState.phase;
      }

      if (nextState.isRunning) {
        // Extend the break-end rolling window so it never runs dry, and
        // re-anchor it to the just-recalculated state in case any phases
        // were skipped through while backgrounded. The repeating work-end
        // alert is untouched here on purpose (see hydration comment above).
        scheduleBreakEndWindowAsync({
          phase: nextState.phase,
          phaseStartedAt: nextState.phaseStartedAt,
          workDurationMs: currentSettings.workMinutes * 60_000,
          breakDurationMs: currentSettings.breakSeconds * 1_000,
          soundEnabled: currentSettings.soundEnabled,
        }).catch(() => {});
      }

      getPermissionStateAsync().then((p) => {
        setNotificationsGranted(p.granted);
        setCanAskAgain(p.canAskAgain);
      });
    });
    return () => sub.remove();
  }, [hydrated]);

  const persist = useCallback((next: PersistedTimerState) => {
    timerStateRef.current = next;
    setTimerState(next);
    saveTimerState(next).catch(() => {});
  }, []);

  const start = useCallback(() => {
    const current = timerStateRef.current;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const duration = phaseDurationMs(current.phase, currentSettings);
    // Preserve whatever time was remaining when paused by shifting the
    // anchor back: phaseStartedAt = now - elapsedSoFar.
    const elapsedSoFar = current.pausedRemainingMs != null ? duration - current.pausedRemainingMs : 0;
    const next: PersistedTimerState = {
      ...current,
      isRunning: true,
      phaseStartedAt: now - elapsedSoFar,
      pausedRemainingMs: null,
    };
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    // Re-arm both: the repeating work-end alert always restarts its cadence
    // fresh from this Start/Resume moment (see scheduleWorkEndRepeatingAsync
    // doc comment for why), and the break-end window is recomputed from the
    // new anchor.
    scheduleWorkEndRepeatingAsync({
      workDurationMs: currentSettings.workMinutes * 60_000,
      soundEnabled: currentSettings.soundEnabled,
    }).catch(() => {});
    scheduleBreakEndWindowAsync({
      phase: next.phase,
      phaseStartedAt: next.phaseStartedAt,
      workDurationMs: currentSettings.workMinutes * 60_000,
      breakDurationMs: currentSettings.breakSeconds * 1_000,
      soundEnabled: currentSettings.soundEnabled,
    }).catch(() => {});
  }, [persist]);

  const pause = useCallback(() => {
    const current = timerStateRef.current;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const remaining = remainingMsFor(current, currentSettings, now);
    const next: PersistedTimerState = {
      ...current,
      isRunning: false,
      pausedRemainingMs: remaining,
    };
    persist(next);
    setRemainingMs(remaining);
    cancelAllScheduledAsync().catch(() => {});
  }, [persist]);

  const reset = useCallback(() => {
    const currentSettings = settingsRef.current;
    const next: PersistedTimerState = {
      phase: 'WORK',
      phaseStartedAt: Date.now(),
      isRunning: false,
      pausedRemainingMs: null,
      cyclesCompletedToday: timerStateRef.current.cyclesCompletedToday,
      statsDate: timerStateRef.current.statsDate,
    };
    lastPhaseRef.current = 'WORK';
    persist(next);
    setRemainingMs(phaseDurationMs('WORK', currentSettings));
    cancelAllScheduledAsync().catch(() => {});
  }, [persist]);

  const skipBreak = useCallback(() => {
    const current = timerStateRef.current;
    if (current.phase !== 'BREAK') return;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const next: PersistedTimerState = {
      ...current,
      phase: 'WORK',
      phaseStartedAt: now,
      isRunning: current.isRunning,
      pausedRemainingMs: current.isRunning ? null : phaseDurationMs('WORK', currentSettings),
    };
    lastPhaseRef.current = 'WORK';
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    if (next.isRunning) {
      // Skipping a break starts a fresh WORK phase right now, so the
      // repeating work-end alert restarts its cadence from this instant too.
      scheduleWorkEndRepeatingAsync({
        workDurationMs: currentSettings.workMinutes * 60_000,
        soundEnabled: currentSettings.soundEnabled,
      }).catch(() => {});
      scheduleBreakEndWindowAsync({
        phase: next.phase,
        phaseStartedAt: next.phaseStartedAt,
        workDurationMs: currentSettings.workMinutes * 60_000,
        breakDurationMs: currentSettings.breakSeconds * 1_000,
        soundEnabled: currentSettings.soundEnabled,
      }).catch(() => {});
    }
  }, [persist]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch(() => {});

    // Recompute remaining time immediately against the new duration, and
    // reschedule notifications so future phases use the updated lengths.
    const current = timerStateRef.current;
    const now = Date.now();
    setRemainingMs(remainingMsFor(current, next, now));
    if (current.isRunning) {
      // A duration change invalidates both schedules: the repeating
      // alert's period and the break window's absolute timestamps are
      // both derived from these durations.
      scheduleWorkEndRepeatingAsync({
        workDurationMs: next.workMinutes * 60_000,
        soundEnabled: next.soundEnabled,
      }).catch(() => {});
      scheduleBreakEndWindowAsync({
        phase: current.phase,
        phaseStartedAt: current.phaseStartedAt,
        workDurationMs: next.workMinutes * 60_000,
        breakDurationMs: next.breakSeconds * 1_000,
        soundEnabled: next.soundEnabled,
      }).catch(() => {});
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    const result = await requestPermissionsAsync();
    setNotificationsGranted(result.granted);
    setCanAskAgain(result.canAskAgain);
  }, []);

  const refreshPermissionState = useCallback(async () => {
    const result = await getPermissionStateAsync();
    setNotificationsGranted(result.granted);
    setCanAskAgain(result.canAskAgain);
  }, []);

  const value: TimerContextValue = {
    phase: timerState.phase,
    remainingMs,
    phaseDurationMs: phaseDurationMs(timerState.phase, settings),
    isRunning: timerState.isRunning,
    cyclesCompletedToday: timerState.cyclesCompletedToday,
    settings,
    hydrated,
    notificationsGranted,
    canAskAgain,
    start,
    pause,
    reset,
    skipBreak,
    updateSettings,
    requestNotificationPermission,
    refreshPermissionState,
  };

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
