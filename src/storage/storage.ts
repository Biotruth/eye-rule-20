import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SETTINGS,
  PersistedTimerState,
  Settings,
  STORAGE_KEYS,
  todayKey,
} from '@/constants/timer';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export async function loadTimerState(): Promise<PersistedTimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.timerState);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTimerState>;
    // Roll the daily counter over if the persisted state belongs to a
    // previous calendar day.
    const statsDate = parsed.statsDate === todayKey() ? parsed.statsDate : todayKey();
    const cyclesCompletedToday = parsed.statsDate === todayKey() ? (parsed.cyclesCompletedToday ?? 0) : 0;
    // `mode`/`pausedUntil` default in for state persisted before always-on
    // mode existed, so an old install migrates cleanly into ALWAYS_ON.
    return {
      mode: parsed.mode ?? 'ALWAYS_ON',
      phase: parsed.phase ?? 'WORK',
      phaseStartedAt: parsed.phaseStartedAt ?? Date.now(),
      isRunning: parsed.isRunning ?? false,
      pausedRemainingMs: parsed.pausedRemainingMs ?? null,
      cyclesCompletedToday,
      statsDate,
      pausedUntil: parsed.pausedUntil ?? null,
      snoozedUntil: parsed.snoozedUntil ?? null,
      manuallyPaused: parsed.manuallyPaused ?? false,
    };
  } catch {
    return null;
  }
}

export async function saveTimerState(state: PersistedTimerState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.timerState, JSON.stringify(state));
}
