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
  Mode,
  PAUSE_DURATION_MS,
  Phase,
  PersistedTimerState,
  Settings,
  todayKey,
} from '@/constants/timer';
import { isWithinActiveHours } from '@/timer/activeHours';
import {
  addNotificationActionListener,
  cancelAllScheduledAsync,
  configureAndroidChannelAsync,
  configureAndroidOngoingChannelAsync,
  configureNotificationCategoriesAsync,
  configureNotificationHandler,
  consumeColdStartActionAsync,
  getPermissionStateAsync,
  hideOngoingStatusAsync,
  requestPermissionsAsync,
  scheduleBreakEndWindowAsync,
  scheduleWorkEndRepeatingAsync,
  scheduleWorkEndSnoozeAsync,
  showOngoingStatusAsync,
  SNOOZE_DURATION_MS,
} from '@/notifications/notifications';
import { loadSettings, loadTimerState, saveSettings, saveTimerState } from '@/storage/storage';

function phaseDurationMs(phase: Phase, settings: Settings): number {
  return phase === 'WORK' ? settings.workMinutes * 60_000 : settings.breakSeconds * 1_000;
}

/**
 * ALWAYS_ON only: are alerts supposed to be firing right now? False if the
 * master toggle is off, the user has manually paused (indefinitely or via
 * "Pause 1 hour"), or — only when the active-hours restriction is opted
 * into via `settings.activeHoursEnabled` — the clock falls outside the
 * configured hours/weekday window. With that opt-in off (the default),
 * there's no time-of-day gating at all: the schedule just runs whenever
 * enabled and not paused, and the user controls it entirely with
 * pause/resume.
 */
function isAlwaysOnActiveNow(
  manuallyPaused: boolean,
  pausedUntil: number | null,
  settings: Settings,
  now: number,
): boolean {
  if (!settings.remindersEnabled) return false;
  if (manuallyPaused) return false;
  if (pausedUntil != null && now < pausedUntil) return false;
  if (settings.activeHoursEnabled && !isWithinActiveHours(settings, new Date(now))) return false;
  return true;
}

/**
 * The single source of truth for "where are we right now" WHILE a phase
 * loop is actively running: given a persisted anchor (phase + the
 * timestamp it started) and the current settings, walk forward through
 * however many phase transitions have elapsed in real time since that
 * anchor, and return the caught-up state plus how many WORK->BREAK->WORK
 * cycles were completed along the way.
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

  return {
    state: { ...state, phase, phaseStartedAt, cyclesCompletedToday, statsDate, isRunning: true },
    cyclesCompletedNow,
  };
}

interface ReconcileResult {
  state: PersistedTimerState;
  /** ALWAYS_ON only: the loop just switched from frozen to running this instant (fresh WORK phase, schedule needs arming). */
  justActivated: boolean;
  /** ALWAYS_ON only: the loop just switched from running to frozen this instant (schedule needs cancelling). */
  justDeactivated: boolean;
  /** A "Snooze 5 min" window just elapsed — the work-end alert needs restoring from its temporary one-shot back to its normal repeating self. */
  snoozeJustExpired: boolean;
}

/**
 * Reconciles persisted state against the current settings and clock. This
 * is the one place that decides, for either mode, whether the phase loop
 * should be advancing right now — called from the tick loop, the
 * AppState foreground handler, and hydration alike, so "was this just
 * backgrounded for 5 minutes" and "was this just killed overnight" are
 * handled by the exact same code path.
 *
 * SESSION mode: unchanged from the original single-mode design —
 * `state.isRunning` is only ever set by the manual start/pause/reset
 * actions, and this just catches up the countdown via advanceToNow.
 *
 * ALWAYS_ON mode: `isRunning` becomes a DERIVED cache of "was the phase
 * loop active last time we checked," recomputed here every call rather
 * than user-toggled. Three cases:
 *  - Not active now (disabled / manually paused indefinitely / "Pause 1
 *    hour" still in effect / — only if activeHoursEnabled is on —
 *    outside active hours or an off weekday): freeze phase/phaseStartedAt
 *    in place, don't advance, but do auto-clear an expired "Pause 1 hour".
 *  - Was inactive, now active (resumed from a manual pause, a "Pause 1
 *    hour" just expired, an active window just started, or the toggle
 *    was just flipped on): start a FRESH WORK phase at `now` rather than
 *    catching up through however long the inactive gap was — catching up
 *    would mean, e.g., resuming after being paused for 3 hours and
 *    "fast-forwarding" through 3 hours of phases that never actually
 *    happened.
 *  - Was already active: behaves exactly like SESSION mode's ordinary
 *    catch-up.
 *
 * Independently of mode, this also auto-clears an expired `snoozedUntil`
 * (set by "Snooze 5 min") — see scheduleWorkEndSnoozeAsync's doc comment
 * for why the OS-level alert needs restoring afterward, which
 * applyReconciled does when `snoozeJustExpired` comes back true.
 */
function reconcileNow(current: PersistedTimerState, settings: Settings, now: number): ReconcileResult {
  const snoozeJustExpired = current.snoozedUntil != null && now >= current.snoozedUntil;
  const base = snoozeJustExpired ? { ...current, snoozedUntil: null } : current;

  if (base.mode === 'SESSION') {
    if (!base.isRunning) {
      return { state: base, justActivated: false, justDeactivated: false, snoozeJustExpired };
    }
    const { state } = advanceToNow(base, settings, now);
    return { state, justActivated: false, justDeactivated: false, snoozeJustExpired };
  }

  // ALWAYS_ON
  const pausedUntil = base.pausedUntil != null && now >= base.pausedUntil ? null : base.pausedUntil;
  const activeNow = isAlwaysOnActiveNow(base.manuallyPaused, pausedUntil, settings, now);
  const wasActive = base.isRunning;

  if (!activeNow) {
    return {
      state: { ...base, isRunning: false, pausedUntil },
      justActivated: false,
      justDeactivated: wasActive,
      snoozeJustExpired,
    };
  }

  if (!wasActive) {
    // Resuming from a pause (indefinite or "Pause 1 hour") picks up the
    // same phase with the same time left, via pausedRemainingMs stamped
    // when pausing. Everything else that re-activates the loop (reminders
    // toggled back on, a new active-hours window) leaves that null and
    // starts a fresh WORK phase.
    const resumeRemainingMs = base.pausedRemainingMs;
    const resumePhase: Phase = resumeRemainingMs != null ? base.phase : 'WORK';
    const phaseStartedAt =
      resumeRemainingMs != null
        ? now - Math.max(0, phaseDurationMs(resumePhase, settings) - resumeRemainingMs)
        : now;
    return {
      state: {
        ...base,
        isRunning: true,
        phase: resumePhase,
        phaseStartedAt,
        pausedRemainingMs: null,
        pausedUntil: null,
        snoozedUntil: null,
      },
      justActivated: true,
      justDeactivated: false,
      snoozeJustExpired: false, // superseded by the full re-arm justActivated triggers
    };
  }

  const { state } = advanceToNow({ ...base, pausedUntil }, settings, now);
  return { state, justActivated: false, justDeactivated: false, snoozeJustExpired };
}

function remainingMsFor(state: PersistedTimerState, settings: Settings, now: number): number {
  const duration = phaseDurationMs(state.phase, settings);
  if (!state.isRunning) {
    return state.pausedRemainingMs ?? duration;
  }
  return Math.max(0, duration - (now - state.phaseStartedAt));
}

interface TimerContextValue {
  mode: Mode;
  phase: Phase;
  remainingMs: number;
  phaseDurationMs: number;
  isRunning: boolean;
  pausedUntil: number | null;
  snoozedUntil: number | null;
  manuallyPaused: boolean;
  cyclesCompletedToday: number;
  settings: Settings;
  hydrated: boolean;
  notificationsGranted: boolean;
  canAskAgain: boolean;
  permissionPrimerVisible: boolean;
  showPermissionPrimer: () => void;
  dismissPermissionPrimer: () => void;
  confirmPermissionPrimer: () => Promise<void>;
  onboardingVisible: boolean;
  showOnboarding: () => void;
  dismissOnboarding: () => void;
  // Session-mode manual controls
  start: () => void;
  pause: () => void;
  reset: () => void;
  skipBreak: () => void;
  startSession: () => void;
  endSession: () => void;
  // Always-on controls
  setRemindersEnabled: (enabled: boolean) => void;
  pauseOneHour: () => void;
  resumeNow: () => void;
  pauseIndefinitely: () => void;
  resumeFromManualPause: () => void;
  // Break-alert notification actions (also reachable in-app)
  snoozeBreak: () => void;
  skipBreakFromAlert: () => void;
  markBreakDone: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
  requestNotificationPermission: () => Promise<void>;
  refreshPermissionState: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

function freshState(): PersistedTimerState {
  return {
    mode: 'ALWAYS_ON',
    phase: 'WORK',
    phaseStartedAt: Date.now(),
    isRunning: false,
    pausedRemainingMs: null,
    cyclesCompletedToday: 0,
    statsDate: todayKey(),
    pausedUntil: null,
    snoozedUntil: null,
    manuallyPaused: false,
  };
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timerState, setTimerState] = useState<PersistedTimerState>(freshState());
  const [remainingMs, setRemainingMs] = useState<number>(phaseDurationMs('WORK', DEFAULT_SETTINGS));
  const [hydrated, setHydrated] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [permissionPrimerVisible, setPermissionPrimerVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;
  const lastPhaseRef = useRef<Phase>(timerState.phase);
  const notificationsGrantedRef = useRef(notificationsGranted);
  notificationsGrantedRef.current = notificationsGranted;

  /**
   * Every schedule call is a no-op while notification permission is
   * missing (iOS rejects them outright — see canPostNotificationsAsync), so
   * a timer that started running before the user granted permission has
   * nothing armed. Called on the not-granted -> granted transition to arm
   * the schedule for whatever is running right now.
   */
  const armScheduleForCurrentState = useCallback(() => {
    const state = timerStateRef.current;
    const currentSettings = settingsRef.current;
    if (!state.isRunning) return;
    scheduleWorkEndRepeatingAsync({
      workDurationMs: currentSettings.workMinutes * 60_000,
      soundEnabled: currentSettings.soundEnabled,
      withPauseAction: state.mode === 'ALWAYS_ON',
    }).catch(() => {});
    scheduleBreakEndWindowAsync({
      phase: state.phase,
      phaseStartedAt: state.phaseStartedAt,
      workDurationMs: currentSettings.workMinutes * 60_000,
      breakDurationMs: currentSettings.breakSeconds * 1_000,
      soundEnabled: currentSettings.soundEnabled,
    }).catch(() => {});
  }, []);

  const applyPermissionState = useCallback((granted: boolean, askAgain: boolean) => {
    const wasGranted = notificationsGrantedRef.current;
    notificationsGrantedRef.current = granted;
    setNotificationsGranted(granted);
    setCanAskAgain(askAgain);
    if (granted && !wasGranted) {
      armScheduleForCurrentState();
    }
  }, [armScheduleForCurrentState]);

  const fireForegroundAlert = useCallback(() => {
    if (!settingsRef.current.vibrationEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  // The Android ongoing status notification is a re-post, not a true
  // chronometer (expo-notifications exposes no such API — see
  // showOngoingStatusAsync's doc comment), so it's throttled to roughly
  // once every 15s to keep that overhead low, except on a real phase/
  // running-state change, which updates it immediately via `force`.
  const ONGOING_UPDATE_INTERVAL_MS = 15_000;
  const lastOngoingUpdateRef = useRef(0);
  const ongoingVisibleRef = useRef(false);

  const updateOngoingStatus = useCallback((state: PersistedTimerState, currentSettings: Settings, now: number, force: boolean) => {
    if (!state.isRunning) {
      if (ongoingVisibleRef.current) {
        ongoingVisibleRef.current = false;
        hideOngoingStatusAsync().catch(() => {});
      }
      return;
    }
    if (!force && now - lastOngoingUpdateRef.current < ONGOING_UPDATE_INTERVAL_MS) return;
    lastOngoingUpdateRef.current = now;
    ongoingVisibleRef.current = true;
    showOngoingStatusAsync({
      phase: state.phase,
      remainingMs: remainingMsFor(state, currentSettings, now),
    }).catch(() => {});
  }, []);

  const persist = useCallback((next: PersistedTimerState) => {
    timerStateRef.current = next;
    setTimerState(next);
    saveTimerState(next).catch(() => {});
    updateOngoingStatus(next, settingsRef.current, Date.now(), true);
  }, [updateOngoingStatus]);

  /**
   * Applies the result of reconcileNow: persists a real change, fires the
   * in-app haptic for an ordinary phase transition (but not for the
   * ALWAYS_ON "just activated" edge — that's the schedule turning on for
   * the day, not a WORK/BREAK completion), and arms/cancels/refreshes
   * notifications to match. Shared by the tick loop, the foreground
   * handler, and hydration so all three keep notifications in sync with
   * the exact same rules.
   */
  const applyReconciled = useCallback((result: ReconcileResult, currentSettings: Settings) => {
    const previous = timerStateRef.current;
    const next = result.state;
    const changed =
      next.phase !== previous.phase ||
      next.phaseStartedAt !== previous.phaseStartedAt ||
      next.isRunning !== previous.isRunning ||
      next.pausedUntil !== previous.pausedUntil ||
      next.snoozedUntil !== previous.snoozedUntil ||
      next.manuallyPaused !== previous.manuallyPaused ||
      next.cyclesCompletedToday !== previous.cyclesCompletedToday;

    if (changed) {
      timerStateRef.current = next;
      setTimerState(next);
      saveTimerState(next).catch(() => {});
    }

    if (result.justActivated) {
      lastPhaseRef.current = next.phase;
    } else if (next.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = next.phase;
      fireForegroundAlert();
    }

    const workDurationMs = currentSettings.workMinutes * 60_000;
    const breakDurationMs = currentSettings.breakSeconds * 1_000;

    if (result.justActivated) {
      scheduleWorkEndRepeatingAsync({
        workDurationMs,
        soundEnabled: currentSettings.soundEnabled,
        withPauseAction: next.mode === 'ALWAYS_ON',
      }).catch(() => {});
      scheduleBreakEndWindowAsync({
        phase: next.phase,
        phaseStartedAt: next.phaseStartedAt,
        workDurationMs,
        breakDurationMs,
        soundEnabled: currentSettings.soundEnabled,
      }).catch(() => {});
    } else if (result.justDeactivated) {
      cancelAllScheduledAsync().catch(() => {});
    } else if (result.snoozeJustExpired) {
      // The temporary one-shot from a "Snooze 5 min" has run its course;
      // restore the alert to its normal indefinitely-repeating self.
      scheduleWorkEndRepeatingAsync({
        workDurationMs,
        soundEnabled: currentSettings.soundEnabled,
        withPauseAction: next.mode === 'ALWAYS_ON',
      }).catch(() => {});
    } else if (next.isRunning && changed) {
      // Ordinary catch-up while already active: only the break-end window
      // needs topping up (see scheduleBreakEndWindowAsync doc comment) —
      // the repeating work-end alert is untouched.
      scheduleBreakEndWindowAsync({
        phase: next.phase,
        phaseStartedAt: next.phaseStartedAt,
        workDurationMs,
        breakDurationMs,
        soundEnabled: currentSettings.soundEnabled,
      }).catch(() => {});
    }

    updateOngoingStatus(next, currentSettings, Date.now(), changed);
  }, [fireForegroundAlert, updateOngoingStatus]);

  const pauseOneHour = useCallback(() => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow(timerStateRef.current, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    const current = reconciled.state;
    if (current.mode !== 'ALWAYS_ON') return;
    const next: PersistedTimerState = {
      ...current,
      isRunning: false,
      pausedRemainingMs: current.isRunning ? remainingMsFor(current, currentSettings, now) : current.pausedRemainingMs,
      pausedUntil: now + PAUSE_DURATION_MS,
    };
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    cancelAllScheduledAsync().catch(() => {});
  }, [applyReconciled, persist]);

  /** Pauses ALWAYS_ON indefinitely — unlike "Pause 1 hour," this only ever clears via an explicit resumeFromManualPause(). */
  const pauseIndefinitely = useCallback(() => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow(timerStateRef.current, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    const current = reconciled.state;
    if (current.mode !== 'ALWAYS_ON') return;
    const next: PersistedTimerState = {
      ...current,
      isRunning: false,
      pausedRemainingMs: current.isRunning ? remainingMsFor(current, currentSettings, now) : current.pausedRemainingMs,
      manuallyPaused: true,
    };
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    cancelAllScheduledAsync().catch(() => {});
  }, [applyReconciled, persist]);

  const resumeFromManualPause = useCallback(() => {
    const current = timerStateRef.current;
    if (current.mode !== 'ALWAYS_ON' || !current.manuallyPaused) return;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow({ ...current, manuallyPaused: false }, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    setRemainingMs(remainingMsFor(reconciled.state, currentSettings, now));
  }, [applyReconciled]);

  /**
   * Shared by "Skip" and "Done": both force the current break to end and a
   * fresh WORK phase to begin right now. The only difference is whether
   * the break counts toward today's completed-cycle tally — "Done" is the
   * user affirmatively saying they took the break, "Skip" is declining it.
   *
   * Reconciles from the live persisted state first (rather than trusting
   * whatever `timerStateRef.current` happened to hold) because this can be
   * invoked from a notification action tapped after the app was killed —
   * the AppState 'active' listener firing from the same foregrounding
   * event isn't guaranteed to run before this does.
   */
  const forceNewWorkPhase = useCallback((incrementCycle: boolean) => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow(timerStateRef.current, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    const current = reconciled.state;

    let cyclesCompletedToday = current.cyclesCompletedToday;
    let statsDate = current.statsDate;
    if (incrementCycle) {
      const today = todayKey(new Date(now));
      if (today !== statsDate) {
        statsDate = today;
        cyclesCompletedToday = 0;
      }
      cyclesCompletedToday += 1;
    }

    const next: PersistedTimerState = {
      ...current,
      phase: 'WORK',
      phaseStartedAt: now,
      pausedRemainingMs: current.isRunning ? null : phaseDurationMs('WORK', currentSettings),
      snoozedUntil: null,
      cyclesCompletedToday,
      statsDate,
    };
    lastPhaseRef.current = 'WORK';
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    if (next.isRunning) {
      scheduleWorkEndRepeatingAsync({
        workDurationMs: currentSettings.workMinutes * 60_000,
        soundEnabled: currentSettings.soundEnabled,
        withPauseAction: next.mode === 'ALWAYS_ON',
      }).catch(() => {});
      scheduleBreakEndWindowAsync({
        phase: 'WORK',
        phaseStartedAt: now,
        workDurationMs: currentSettings.workMinutes * 60_000,
        breakDurationMs: currentSettings.breakSeconds * 1_000,
        soundEnabled: currentSettings.soundEnabled,
      }).catch(() => {});
    }
  }, [applyReconciled, persist]);

  const skipBreakFromAlert = useCallback(() => forceNewWorkPhase(false), [forceNewWorkPhase]);
  const markBreakDone = useCallback(() => forceNewWorkPhase(true), [forceNewWorkPhase]);

  /**
   * "Snooze 5 min": push the current phase's end 5 minutes further out and
   * replace the OS-level repeating alert with a matching one-shot — see
   * scheduleWorkEndSnoozeAsync's doc comment for the tradeoff this
   * involves and how it self-heals via reconcileNow's snoozeJustExpired.
   */
  const snoozeBreak = useCallback(() => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow(timerStateRef.current, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    const current = reconciled.state;

    const next: PersistedTimerState = {
      ...current,
      phaseStartedAt: current.phaseStartedAt + SNOOZE_DURATION_MS,
      snoozedUntil: now + SNOOZE_DURATION_MS,
    };
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    scheduleWorkEndSnoozeAsync({
      soundEnabled: currentSettings.soundEnabled,
      withPauseAction: next.mode === 'ALWAYS_ON',
    }).catch(() => {});
    scheduleBreakEndWindowAsync({
      phase: next.phase,
      phaseStartedAt: next.phaseStartedAt,
      workDurationMs: currentSettings.workMinutes * 60_000,
      breakDurationMs: currentSettings.breakSeconds * 1_000,
      soundEnabled: currentSettings.soundEnabled,
    }).catch(() => {});
  }, [applyReconciled, persist]);

  const dispatchNotificationAction = useCallback((action: 'snooze' | 'skip' | 'done' | 'pause') => {
    if (action === 'pause') pauseOneHour();
    else if (action === 'snooze') snoozeBreak();
    else if (action === 'skip') skipBreakFromAlert();
    else if (action === 'done') markBreakDone();
  }, [pauseOneHour, snoozeBreak, skipBreakFromAlert, markBreakDone]);

  // ---- hydration: load persisted state once on launch ----
  useEffect(() => {
    (async () => {
      try {
        configureNotificationHandler();
        await Promise.all([
          configureAndroidChannelAsync(),
          configureAndroidOngoingChannelAsync(),
          configureNotificationCategoriesAsync(),
        ]);

        const [loadedSettings, loadedState, permission] = await Promise.all([
          loadSettings(),
          loadTimerState(),
          getPermissionStateAsync(),
        ]);

        const initialSettings = loadedSettings;
        const initialState = loadedState ?? freshState();

        setSettings(initialSettings);

        // First launch (or a fresh install): show the "how it works"
        // explainer before the permission primer — PermissionPrimerModal
        // suppresses itself while this is visible, so the two never overlap.
        if (!initialSettings.onboardingComplete) {
          setOnboardingVisible(true);
        }

        notificationsGrantedRef.current = permission.granted;
        setNotificationsGranted(permission.granted);
        setCanAskAgain(permission.canAskAgain);

        // First launch: the OS has never asked, so show the priming
        // explainer before ever calling requestPermissionsAsync (spec) — the
        // system dialog only fires if the user taps "Enable alerts" in it.
        // On every later launch this is a no-op since status is no longer
        // undetermined.
        if (permission.undetermined) {
          setPermissionPrimerVisible(true);
        }

        // Catch up (or, for ALWAYS_ON re-entering an active window, freshly
        // activate) immediately in case the app was killed and relaunched.
        const now = Date.now();
        const reconciled = reconcileNow(initialState, initialSettings, now);
        timerStateRef.current = reconciled.state;
        lastPhaseRef.current = reconciled.state.phase;
        setTimerState(reconciled.state);
        setRemainingMs(remainingMsFor(reconciled.state, initialSettings, now));
        await saveTimerState(reconciled.state);
        updateOngoingStatus(reconciled.state, initialSettings, now, true);

        if (reconciled.justActivated) {
          await scheduleWorkEndRepeatingAsync({
            workDurationMs: initialSettings.workMinutes * 60_000,
            soundEnabled: initialSettings.soundEnabled,
            withPauseAction: reconciled.state.mode === 'ALWAYS_ON',
          });
          await scheduleBreakEndWindowAsync({
            phase: reconciled.state.phase,
            phaseStartedAt: reconciled.state.phaseStartedAt,
            workDurationMs: initialSettings.workMinutes * 60_000,
            breakDurationMs: initialSettings.breakSeconds * 1_000,
            soundEnabled: initialSettings.soundEnabled,
          });
        } else if (reconciled.justDeactivated) {
          await cancelAllScheduledAsync();
        } else if (reconciled.snoozeJustExpired) {
          await scheduleWorkEndRepeatingAsync({
            workDurationMs: initialSettings.workMinutes * 60_000,
            soundEnabled: initialSettings.soundEnabled,
            withPauseAction: reconciled.state.mode === 'ALWAYS_ON',
          });
        } else if (reconciled.state.isRunning) {
          // Deliberately does NOT touch the repeating work-end alert here.
          // If it was armed before this launch (including before an app
          // kill), it has already been ticking on its own inside the OS
          // this whole time and needs no help — only the break-end one-shot
          // window needs topping up, since one-shots don't survive being
          // consumed by time the way a repeating trigger does.
          await scheduleBreakEndWindowAsync({
            phase: reconciled.state.phase,
            phaseStartedAt: reconciled.state.phaseStartedAt,
            workDurationMs: initialSettings.workMinutes * 60_000,
            breakDurationMs: initialSettings.breakSeconds * 1_000,
            soundEnabled: initialSettings.soundEnabled,
          });
        }

        // A notification action tap that cold-launched the app won't have
        // been caught by addNotificationResponseReceivedListener (that only
        // fires for responses received while already running), so check
        // for it explicitly once hydration has a base state to layer onto.
        const coldStartAction = await consumeColdStartActionAsync();
        if (coldStartAction) {
          dispatchNotificationAction(coldStartAction);
        }
      } catch (error) {
        // Hydration touches a lot of native/storage APIs in sequence with
        // no other guard around this effect; without a catch here, any one
        // of them throwing would surface as an unhandled promise rejection
        // AND permanently strand the app on the "Loading…" screen, since
        // setHydrated(true) below would never run. Logging and falling
        // through to `finally` keeps the app usable with whatever state
        // was already applied before the failure.
        console.error('[TimerProvider] hydration failed', error);
      } finally {
        setHydrated(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- listen for notification-action taps while the app is already running ----
  useEffect(() => {
    if (!hydrated) return;
    return addNotificationActionListener(dispatchNotificationAction);
  }, [hydrated, dispatchNotificationAction]);

  // ---- the tick loop: recompute from timestamps, never accumulate ----
  useEffect(() => {
    if (!hydrated) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const current = timerStateRef.current;
      const currentSettings = settingsRef.current;
      const reconciled = reconcileNow(current, currentSettings, now);
      applyReconciled(reconciled, currentSettings);
      setRemainingMs(remainingMsFor(reconciled.state, currentSettings, now));
    }, 250);

    return () => clearInterval(interval);
  }, [hydrated, applyReconciled]);

  // ---- AppState: recalculate the instant we return to foreground ----
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      const now = Date.now();
      const current = timerStateRef.current;
      const currentSettings = settingsRef.current;
      const reconciled = reconcileNow(current, currentSettings, now);
      applyReconciled(reconciled, currentSettings);
      setRemainingMs(remainingMsFor(reconciled.state, currentSettings, now));

      // Also catches the user granting permission from iOS/Android
      // Settings while the app was in the background.
      getPermissionStateAsync()
        .then((p) => applyPermissionState(p.granted, p.canAskAgain))
        .catch(() => {});
    });
    return () => sub.remove();
  }, [hydrated, applyReconciled, applyPermissionState]);

  // ---- Session-mode manual controls (unchanged from the original design) ----
  const start = useCallback(() => {
    const current = timerStateRef.current;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const duration = phaseDurationMs(current.phase, currentSettings);
    const elapsedSoFar = current.pausedRemainingMs != null ? duration - current.pausedRemainingMs : 0;
    const next: PersistedTimerState = {
      ...current,
      isRunning: true,
      phaseStartedAt: now - elapsedSoFar,
      pausedRemainingMs: null,
      snoozedUntil: null,
    };
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    scheduleWorkEndRepeatingAsync({
      workDurationMs: currentSettings.workMinutes * 60_000,
      soundEnabled: currentSettings.soundEnabled,
      withPauseAction: next.mode === 'ALWAYS_ON',
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
    const current = timerStateRef.current;
    const next: PersistedTimerState = {
      ...current,
      phase: 'WORK',
      phaseStartedAt: Date.now(),
      isRunning: false,
      pausedRemainingMs: null,
      pausedUntil: null,
      snoozedUntil: null,
      manuallyPaused: false,
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
      snoozedUntil: null,
    };
    lastPhaseRef.current = 'WORK';
    persist(next);
    setRemainingMs(remainingMsFor(next, currentSettings, now));
    if (next.isRunning) {
      scheduleWorkEndRepeatingAsync({
        workDurationMs: currentSettings.workMinutes * 60_000,
        soundEnabled: currentSettings.soundEnabled,
        withPauseAction: next.mode === 'ALWAYS_ON',
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

  // ---- Mode switching ----
  const startSession = useCallback(() => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    // The always-on schedule must stop while a manual session is active,
    // to avoid double alerts firing from two independent schedules.
    cancelAllScheduledAsync().catch(() => {});
    const next: PersistedTimerState = {
      mode: 'SESSION',
      phase: 'WORK',
      phaseStartedAt: now,
      isRunning: true,
      pausedRemainingMs: null,
      cyclesCompletedToday: timerStateRef.current.cyclesCompletedToday,
      statsDate: timerStateRef.current.statsDate,
      pausedUntil: null,
      snoozedUntil: null,
      manuallyPaused: false,
    };
    lastPhaseRef.current = 'WORK';
    persist(next);
    setRemainingMs(phaseDurationMs('WORK', currentSettings));
    scheduleWorkEndRepeatingAsync({
      workDurationMs: currentSettings.workMinutes * 60_000,
      soundEnabled: currentSettings.soundEnabled,
      withPauseAction: false,
    }).catch(() => {});
    scheduleBreakEndWindowAsync({
      phase: 'WORK',
      phaseStartedAt: now,
      workDurationMs: currentSettings.workMinutes * 60_000,
      breakDurationMs: currentSettings.breakSeconds * 1_000,
      soundEnabled: currentSettings.soundEnabled,
    }).catch(() => {});
  }, [persist]);

  const endSession = useCallback(() => {
    const currentSettings = settingsRef.current;
    const now = Date.now();
    cancelAllScheduledAsync().catch(() => {});
    const base: PersistedTimerState = {
      ...timerStateRef.current,
      mode: 'ALWAYS_ON',
      isRunning: false,
      pausedRemainingMs: null,
      snoozedUntil: null,
      manuallyPaused: false,
    };
    const reconciled = reconcileNow(base, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    setRemainingMs(remainingMsFor(reconciled.state, currentSettings, now));
  }, [applyReconciled]);

  // ---- Always-on controls ----
  const resumeNow = useCallback(() => {
    const current = timerStateRef.current;
    if (current.mode !== 'ALWAYS_ON' || current.pausedUntil == null) return;
    const currentSettings = settingsRef.current;
    const now = Date.now();
    const reconciled = reconcileNow({ ...current, pausedUntil: null }, currentSettings, now);
    applyReconciled(reconciled, currentSettings);
    setRemainingMs(remainingMsFor(reconciled.state, currentSettings, now));
  }, [applyReconciled]);

  const setRemindersEnabled = useCallback((enabled: boolean) => {
    const next = { ...settingsRef.current, remindersEnabled: enabled };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch(() => {});

    const now = Date.now();
    const reconciled = reconcileNow(timerStateRef.current, next, now);
    applyReconciled(reconciled, next);
    setRemainingMs(remainingMsFor(reconciled.state, next, now));
  }, [applyReconciled]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch(() => {});

    const now = Date.now();
    const current = timerStateRef.current;
    const reconciled = reconcileNow(current, next, now);
    applyReconciled(reconciled, next);
    setRemainingMs(remainingMsFor(reconciled.state, next, now));

    // A work/break duration or sound change needs its own reschedule even
    // when reconcile above didn't flip phase/running (e.g. adjusting
    // workMinutes mid-WORK-phase doesn't cross a phase boundary) — the
    // repeating alert's period, the break window's absolute timestamps,
    // and every pending alert's sound are all baked in at schedule time.
    // Skip this when applyReconciled already armed/cancelled/restored the
    // schedule above.
    const scheduleAffected =
      partial.workMinutes !== undefined ||
      partial.breakSeconds !== undefined ||
      partial.soundEnabled !== undefined;
    if (
      scheduleAffected &&
      reconciled.state.isRunning &&
      !reconciled.justActivated &&
      !reconciled.justDeactivated &&
      !reconciled.snoozeJustExpired
    ) {
      scheduleWorkEndRepeatingAsync({
        workDurationMs: next.workMinutes * 60_000,
        soundEnabled: next.soundEnabled,
        withPauseAction: reconciled.state.mode === 'ALWAYS_ON',
      }).catch(() => {});
      scheduleBreakEndWindowAsync({
        phase: reconciled.state.phase,
        phaseStartedAt: reconciled.state.phaseStartedAt,
        workDurationMs: next.workMinutes * 60_000,
        breakDurationMs: next.breakSeconds * 1_000,
        soundEnabled: next.soundEnabled,
      }).catch(() => {});
    }
  }, [applyReconciled]);

  const requestNotificationPermission = useCallback(async () => {
    const result = await requestPermissionsAsync();
    applyPermissionState(result.granted, result.canAskAgain);
  }, [applyPermissionState]);

  const refreshPermissionState = useCallback(async () => {
    const result = await getPermissionStateAsync();
    applyPermissionState(result.granted, result.canAskAgain);
  }, [applyPermissionState]);

  // ---- Permission priming: explainer before the OS dialog ----
  const showPermissionPrimer = useCallback(() => {
    setPermissionPrimerVisible(true);
  }, []);

  const dismissPermissionPrimer = useCallback(() => {
    setPermissionPrimerVisible(false);
  }, []);

  const confirmPermissionPrimer = useCallback(async () => {
    setPermissionPrimerVisible(false);
    await requestNotificationPermission();
  }, [requestNotificationPermission]);

  // ---- Onboarding: first-launch "how it works" explainer, re-viewable later ----
  const showOnboarding = useCallback(() => {
    setOnboardingVisible(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOnboardingVisible(false);
    const next = { ...settingsRef.current, onboardingComplete: true };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch(() => {});
  }, []);

  const value: TimerContextValue = {
    mode: timerState.mode,
    phase: timerState.phase,
    remainingMs,
    phaseDurationMs: phaseDurationMs(timerState.phase, settings),
    isRunning: timerState.isRunning,
    pausedUntil: timerState.pausedUntil,
    snoozedUntil: timerState.snoozedUntil,
    manuallyPaused: timerState.manuallyPaused,
    cyclesCompletedToday: timerState.cyclesCompletedToday,
    settings,
    hydrated,
    notificationsGranted,
    canAskAgain,
    permissionPrimerVisible,
    showPermissionPrimer,
    dismissPermissionPrimer,
    confirmPermissionPrimer,
    onboardingVisible,
    showOnboarding,
    dismissOnboarding,
    start,
    pause,
    reset,
    skipBreak,
    startSession,
    endSession,
    setRemindersEnabled,
    pauseOneHour,
    resumeNow,
    pauseIndefinitely,
    resumeFromManualPause,
    snoozeBreak,
    skipBreakFromAlert,
    markBreakDone,
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
