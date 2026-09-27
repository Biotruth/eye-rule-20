import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CYCLES_TO_SCHEDULE, Phase } from '@/constants/timer';

export const ANDROID_CHANNEL_ID = 'eye-break-alerts';

// A separate, low-importance channel for the ongoing status notification —
// deliberately distinct from the alert channel above so this silent,
// constantly-present notification never inherits MAX importance/sound/
// vibration (which would make Android re-alert the user on every update).
export const ANDROID_ONGOING_CHANNEL_ID = 'eye-break-ongoing-status';
const ONGOING_STATUS_ID = 'eye-rule-20-ongoing-status';

// A single, stable identifier for the "time for a break" alert. Scheduling
// with this identifier again always replaces the previous request (both
// iOS's UNUserNotificationCenter and expo-notifications' Android scheduler
// key pending requests by identifier), so this is always exactly one
// pending notification, never a growing pile.
const WORK_END_REPEATING_ID = 'eye-rule-20-work-end-repeating';

// A fixed-size pool of slot identifiers for upcoming "break's over" alerts.
// Reusing these same CYCLES_TO_SCHEDULE identifiers on every reschedule
// means the total pending count never exceeds
// 1 (repeating work alert) + CYCLES_TO_SCHEDULE (break slots) — comfortably
// under iOS's 64-pending-notification cap — no matter how many times the
// app foregrounds and re-tops-up the window.
const BREAK_END_SLOT_IDS = Array.from(
  { length: CYCLES_TO_SCHEDULE },
  (_, i) => `eye-rule-20-break-end-slot-${i}`,
);

// iOS silently refuses to fire a `repeats: true` interval trigger under
// 60 seconds (Android has no such floor, but we apply it everywhere for
// one consistent, cross-platform contract). Our work-duration range
// (5-60 min) never gets near this floor; it's here defensively.
const IOS_MIN_REPEATING_SECONDS = 60;

// Notification actions on the work-end "time for a break" alert. Every
// mode gets Snooze/Skip/Done; ALWAYS_ON additionally gets Pause 1 hour —
// since a notification's categoryIdentifier is a single value, that means
// two category registrations with overlapping action identifiers rather
// than one category whose actions vary by context.
export const BREAK_ALERT_CATEGORY_ID = 'BREAK_ALERT';
export const BREAK_ALERT_ALWAYS_ON_CATEGORY_ID = 'BREAK_ALERT_ALWAYS_ON';
export const SNOOZE_ACTION_ID = 'eye-rule-20-snooze-5';
export const SKIP_ACTION_ID = 'eye-rule-20-skip';
export const DONE_ACTION_ID = 'eye-rule-20-done';
export const PAUSE_ONE_HOUR_ACTION_ID = 'eye-rule-20-pause-1-hour';

export const SNOOZE_DURATION_MS = 5 * 60 * 1000;

export type NotificationActionKind = 'snooze' | 'skip' | 'done' | 'pause';

function mapActionIdentifier(actionIdentifier: string): NotificationActionKind | null {
  switch (actionIdentifier) {
    case SNOOZE_ACTION_ID:
      return 'snooze';
    case SKIP_ACTION_ID:
      return 'skip';
    case DONE_ACTION_ID:
      return 'done';
    case PAUSE_ONE_HOUR_ACTION_ID:
      return 'pause';
    default:
      return null;
  }
}

// expo-notifications does not implement local-notification scheduling on
// web (no service-worker-backed alarm scheduler), so every scheduling/
// cancellation call below is a guarded no-op there. This app targets
// iOS/Android; the web guard exists purely so the same code doesn't throw
// if it's ever run in a browser (e.g. `expo start --web` during development).
const SCHEDULING_SUPPORTED = Platform.OS !== 'web';

/**
 * Notifications received while the app is foregrounded still get shown as a
 * banner. In practice the app almost never needs this path (foreground
 * transitions are driven by the in-app timer/haptics/overlay), but it is a
 * deliberate safety net: if a scheduled notification's trigger fires in the
 * split second the app is foregrounding, or the JS timer is delayed for any
 * reason, the user still sees the alert instead of it being silently
 * swallowed.
 */
export function configureNotificationHandler(): void {
  if (!SCHEDULING_SUPPORTED) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Registers the two BREAK_ALERT categories (with vs. without the "Pause 1
 * hour" action) that carry action buttons on the work-end alert. Must run
 * before scheduling any notification that references either identifier
 * via `categoryIdentifier` — same "call before scheduling" contract as the
 * Android channel below. Every action defaults `opensAppToForeground` to
 * true (Expo's default), so a tap always runs TimerContext's response
 * listener — registering the category only makes the buttons appear, it
 * doesn't handle the tap itself.
 */
export async function configureNotificationCategoriesAsync(): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return;
  const breakActions: Notifications.NotificationAction[] = [
    { identifier: SNOOZE_ACTION_ID, buttonTitle: 'Snooze 5 min' },
    { identifier: SKIP_ACTION_ID, buttonTitle: 'Skip' },
    { identifier: DONE_ACTION_ID, buttonTitle: 'Done' },
  ];
  await Notifications.setNotificationCategoryAsync(BREAK_ALERT_CATEGORY_ID, breakActions);
  await Notifications.setNotificationCategoryAsync(BREAK_ALERT_ALWAYS_ON_CATEGORY_ID, [
    ...breakActions,
    { identifier: PAUSE_ONE_HOUR_ACTION_ID, buttonTitle: 'Pause 1 hour' },
  ]);
}

/**
 * Creates (or updates) the Android notification channel. Must run before
 * any notification is scheduled — Android freezes a channel's importance,
 * vibration, and sound settings the first time it's created, and later
 * calls with different values are ignored by the OS unless the channel ID
 * changes. Safe to call on every launch; it's a no-op after the first time.
 */
export async function configureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '20-20-20 Eye Break Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    enableVibrate: true,
    sound: 'default',
    lightColor: '#4F9DFF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Creates (or updates) the low-importance channel the ongoing status
 * notification posts to — LOW so it sits quietly in the shade with no
 * sound, heads-up popup, or vibration each time its text is refreshed.
 * Same "must run before scheduling, no-op after the first time" contract
 * as the alert channel above.
 */
export async function configureAndroidOngoingChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_ONGOING_CHANNEL_ID, {
    name: '20-20-20 Status',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: null,
    enableVibrate: false,
    sound: null,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

function formatOngoingCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface OngoingStatusParams {
  phase: Phase;
  remainingMs: number;
}

/**
 * Presents (or refreshes) the sticky Android status notification showing
 * the current phase and remaining time. Android-only — iOS has no
 * ongoing/non-dismissable notification concept to target.
 *
 * expo-notifications exposes no chronometer/setWhen API (verified against
 * both its TypeScript types and its native Android source — neither
 * mentions it), so there is no way to hand Android a live-updating
 * countdown that ticks on its own. This instead re-presents the same
 * `identifier` with fresh text — same "same identifier replaces the
 * pending/shown entry" mechanism used everywhere else in this file — which
 * updates the notification in place rather than stacking duplicates, but
 * is still, literally, repeated re-posting; TimerContext throttles calls
 * to roughly once every 15 seconds (plus immediately on phase transitions)
 * to keep that overhead low. This only runs while the app is actually
 * alive to call it — like the rest of this app, the display goes stale
 * while backgrounded and catches up next time it's foregrounded.
 */
export async function showOngoingStatusAsync({ phase, remainingMs }: OngoingStatusParams): Promise<void> {
  if (!SCHEDULING_SUPPORTED || Platform.OS !== 'android') return;
  const title = phase === 'WORK' ? 'Focus time' : 'Break time';
  const body =
    phase === 'WORK'
      ? `${formatOngoingCountdown(remainingMs)} until your break`
      : `${formatOngoingCountdown(remainingMs)} left — look 20 feet away`;

  await Notifications.scheduleNotificationAsync({
    identifier: ONGOING_STATUS_ID,
    content: {
      title,
      body,
      sticky: true,
      autoDismiss: false,
      sound: false,
    },
    // A channel-aware trigger (as opposed to plain `null`) delivers
    // immediately while still routing to our low-importance channel.
    trigger: { channelId: ANDROID_ONGOING_CHANNEL_ID },
  });
}

/** Removes the sticky status notification — called once reminders stop running (toggled off, paused, outside active hours, or a session pauses/ends). */
export async function hideOngoingStatusAsync(): Promise<void> {
  if (!SCHEDULING_SUPPORTED || Platform.OS !== 'android') return;
  await Notifications.dismissNotificationAsync(ONGOING_STATUS_ID);
}

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  undetermined: boolean;
}

function toPermissionState(state: Notifications.NotificationPermissionsStatus): PermissionState {
  return {
    granted: state.granted,
    canAskAgain: state.canAskAgain,
    undetermined: state.status === Notifications.PermissionStatus.UNDETERMINED,
  };
}

const WEB_PERMISSION_STATE: PermissionState = { granted: false, canAskAgain: false, undetermined: false };

export async function requestPermissionsAsync(): Promise<PermissionState> {
  if (!SCHEDULING_SUPPORTED) return WEB_PERMISSION_STATE;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return toPermissionState(existing);
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: true,
    },
  });
  return toPermissionState(requested);
}

export async function getPermissionStateAsync(): Promise<PermissionState> {
  if (!SCHEDULING_SUPPORTED) return WEB_PERMISSION_STATE;
  const state = await Notifications.getPermissionsAsync();
  return toPermissionState(state);
}

export async function cancelAllScheduledAsync(): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

interface WorkEndRepeatingParams {
  workDurationMs: number;
  soundEnabled: boolean;
  /** Attaches the "Pause 1 hour" action button; pass only for always-on mode. */
  withPauseAction?: boolean;
}

/**
 * Arms (or re-arms) the "time for a break" alert as a single, indefinitely
 * REPEATING notification instead of a one-shot.
 *
 * Why: previously the "next work-end" alert was just one entry in the
 * one-shot rolling window, and the window only covered CYCLES_TO_SCHEDULE
 * cycles ahead. If the app is killed and never reopened, that window
 * eventually empties out and every future alert silently stops — the app
 * has no code running to top it back up. A `repeats: true` TIME_INTERVAL
 * trigger is scheduled once and then re-fires forever at that same
 * interval, entirely inside the OS — no app code needs to run again for
 * it to keep working. That makes this specific alert immune to the app
 * being force-quit and never relaunched.
 *
 * The tradeoff (and why this ISN'T used for break-end too): a repeating
 * trigger only takes one fixed interval — there is no way to say "fire
 * once at T, then every D after." So this alarm always uses the full
 * nominal work duration as its period, re-armed from "now" every time
 * this function runs (Start, Resume, and whenever the work duration
 * setting changes while running). That's a deliberate simplification: the
 * precise, phase-accurate experience is still delivered by the foreground
 * timer/haptics/overlay and by the break-end one-shots below; this
 * repeating alarm is purely a coarse "in case you forgot about the app
 * entirely" safety net, so being off by however much time was already
 * elapsed before a pause/resume is an acceptable tradeoff for a alert
 * that otherwise never runs out.
 *
 * Reused identifier (WORK_END_REPEATING_ID) means calling this again
 * always replaces the previous pending request rather than stacking a
 * second one — see the identifier's doc comment above.
 */
export async function scheduleWorkEndRepeatingAsync({
  workDurationMs,
  soundEnabled,
  withPauseAction = false,
}: WorkEndRepeatingParams): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return;

  const seconds = Math.max(IOS_MIN_REPEATING_SECONDS, Math.round(workDurationMs / 1000));

  await Notifications.scheduleNotificationAsync({
    identifier: WORK_END_REPEATING_ID,
    content: {
      title: 'Time for an eye break',
      body: 'Look at something 20 feet away for 20 seconds.',
      sound: soundEnabled ? 'default' : undefined,
      categoryIdentifier: withPauseAction ? BREAK_ALERT_ALWAYS_ON_CATEGORY_ID : BREAK_ALERT_CATEGORY_ID,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: true,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

/**
 * Replaces the repeating work-end alert with a ONE-SHOT reminder
 * SNOOZE_DURATION_MS out, in response to a "Snooze 5 min" tap. Reuses
 * WORK_END_REPEATING_ID, so this temporarily converts that pending
 * request from a repeating trigger to a one-shot (same "same identifier
 * replaces" mechanism as everywhere else) — a `repeats: true` trigger
 * can't express "fire once in 5 minutes, then resume the normal
 * interval," so there is no way to snooze without briefly giving up the
 * "survives being killed forever" property for exactly this one
 * work-end cycle. TimerContext closes that gap itself: it stamps
 * `snoozedUntil` in persisted state and, the next time the app ticks or
 * foregrounds at or after that instant, calls scheduleWorkEndRepeatingAsync
 * again to restore the normal repeating cadence — so the gap only
 * persists until the app is next opened after the snooze elapses (which,
 * per the one-shot's own tap-to-open behavior, is often immediately).
 */
export async function scheduleWorkEndSnoozeAsync({
  soundEnabled,
  withPauseAction = false,
}: {
  soundEnabled: boolean;
  withPauseAction?: boolean;
}): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return;

  await Notifications.scheduleNotificationAsync({
    identifier: WORK_END_REPEATING_ID,
    content: {
      title: 'Time for an eye break',
      body: 'Look at something 20 feet away for 20 seconds.',
      sound: soundEnabled ? 'default' : undefined,
      categoryIdentifier: withPauseAction ? BREAK_ALERT_ALWAYS_ON_CATEGORY_ID : BREAK_ALERT_CATEGORY_ID,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: SNOOZE_DURATION_MS / 1000,
      repeats: false,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

interface BreakEndWindowParams {
  /** The phase that is currently active. */
  phase: Phase;
  /** Wall-clock ms-since-epoch timestamp when the current phase began. */
  phaseStartedAt: number;
  workDurationMs: number;
  breakDurationMs: number;
  soundEnabled: boolean;
}

/**
 * Schedules the next CYCLES_TO_SCHEDULE "break's over, back to work" alerts
 * as individual one-shot notifications, anchored to the persisted
 * phase-start timestamp rather than to "now".
 *
 * These stay one-shots (can't be a repeating trigger like the work-end
 * alert) because the break duration is user-configurable down to 10
 * seconds, and iOS refuses `repeats: true` intervals under 60 seconds —
 * there is no single fixed interval that would correctly capture "fire
 * repeatedly every work+break cycle" without also drifting once a pause
 * or a settings change shifts the phase boundaries. So instead this
 * keeps a rolling window of the next 8 real, precisely-computed
 * break-end instants, and callers re-run it on every app foreground (and
 * on Start/Resume/settings-change) to keep the window topped up — see
 * TimerContext's AppState handler.
 *
 * Why anchor to phaseStartedAt instead of just scheduling "20 seconds
 * from now" every time this is called: this function can be called many
 * times (every foreground). If it naively scheduled relative to the
 * moment it's called, repeated calls would keep pushing alerts later,
 * and they'd never land on the real cycle boundaries. By always deriving
 * absolute transition timestamps from the single source of truth
 * (phaseStartedAt + durations), rescheduling is idempotent: no matter how
 * many times it runs, break-slot N always corresponds to the same
 * real-world instant (until settings or the phase anchor actually change).
 *
 * Each of the CYCLES_TO_SCHEDULE slots reuses a fixed identifier
 * (BREAK_END_SLOT_IDS), so re-running this overwrites the existing 8
 * pending requests in place instead of accumulating new ones — combined
 * with the single repeating work-end alert, total pending notifications
 * are always exactly 1 + CYCLES_TO_SCHEDULE, far under iOS's 64 cap.
 */
export async function scheduleBreakEndWindowAsync({
  phase,
  phaseStartedAt,
  workDurationMs,
  breakDurationMs,
  soundEnabled,
}: BreakEndWindowParams): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return;

  const now = Date.now();
  const currentPhaseDurationMs = phase === 'WORK' ? workDurationMs : breakDurationMs;
  let nextTransitionAt = phaseStartedAt + currentPhaseDurationMs;
  let endingPhase: Phase = phase;
  let slotIndex = 0;

  // Walk the alternating WORK -> BREAK -> WORK -> ... sequence forward
  // until CYCLES_TO_SCHEDULE break-end instants have been placed into
  // slots (this necessarily also walks over the interleaved work-end
  // instants, which are ignored here since that alert is handled by the
  // single repeating notification above).
  while (slotIndex < CYCLES_TO_SCHEDULE) {
    if (endingPhase === 'BREAK') {
      const secondsFromNow = (nextTransitionAt - now) / 1000;
      // A trigger needs seconds > 0; if the computed instant is at/behind
      // "now" (can happen for the very first transition), floor it to 1s
      // rather than skip the slot — skipping would leave that slot
      // holding its previous, now-incorrect schedule instead of being
      // refreshed.
      await Notifications.scheduleNotificationAsync({
        identifier: BREAK_END_SLOT_IDS[slotIndex],
        content: {
          title: 'Break complete',
          body: 'Back to work — 20-20-20 timer resumed.',
          sound: soundEnabled ? 'default' : undefined,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.round(secondsFromNow)),
          repeats: false,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      slotIndex += 1;
    }

    const nextPhaseDurationMs = endingPhase === 'WORK' ? breakDurationMs : workDurationMs;
    endingPhase = endingPhase === 'WORK' ? 'BREAK' : 'WORK';
    nextTransitionAt += nextPhaseDurationMs;
  }
}

/**
 * Subscribes to notification-action taps for as long as the app is
 * running (warm background or foreground), invoking `onAction` with which
 * button was tapped. Returns an unsubscribe function.
 */
export function addNotificationActionListener(onAction: (action: NotificationActionKind) => void): () => void {
  if (!SCHEDULING_SUPPORTED) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const action = mapActionIdentifier(response.actionIdentifier);
    if (action) onAction(action);
  });
  return () => sub.remove();
}

/**
 * Checks whether the app was just cold-launched by tapping a notification
 * action (addNotificationResponseReceivedListener only fires for
 * responses received while already running, so a fresh launch needs this
 * instead). Clears the stored response after reading it so it isn't
 * re-applied on every subsequent hydration.
 */
export async function consumeColdStartActionAsync(): Promise<NotificationActionKind | null> {
  if (!SCHEDULING_SUPPORTED) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  const action = response ? mapActionIdentifier(response.actionIdentifier) : null;
  if (action) {
    await Notifications.clearLastNotificationResponseAsync();
  }
  return action;
}

/**
 * Debug utility: logs every currently-pending local notification (both the
 * repeating work-end alert and the break-end one-shot slots) so the
 * schedule can be inspected against what's expected. Call this from
 * anywhere after scheduling — e.g. a temporary button, or directly from
 * the debugger/Metro console via the exposed global (see notifications
 * module usage in Settings) — to confirm: exactly one entry with
 * identifier `eye-rule-20-work-end-repeating` and `repeats: true`, plus up
 * to CYCLES_TO_SCHEDULE entries named `eye-rule-20-break-end-slot-N`, and
 * nothing else.
 */
export async function logScheduledNotificationsAsync(): Promise<void> {
  if (!SCHEDULING_SUPPORTED) {
    console.log('[notifications] scheduling not supported on this platform (web)');
    return;
  }
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  console.log(`[notifications] ${pending.length} pending notification(s):`);
  for (const request of pending) {
    const trigger = request.trigger as { type?: string; seconds?: number; repeats?: boolean };
    let etaLabel = '';
    try {
      const nextDate = await Notifications.getNextTriggerDateAsync(
        request.trigger as Notifications.SchedulableNotificationTriggerInput,
      );
      if (nextDate) {
        const secondsUntil = Math.round((nextDate - Date.now()) / 1000);
        etaLabel = ` -> next fire in ~${secondsUntil}s (${new Date(nextDate).toLocaleTimeString()})`;
      }
    } catch {
      // Some trigger shapes (e.g. already-fired or platform-specific ones)
      // don't support this lookup; the raw trigger dump below still shows.
    }
    console.log(
      `  [${request.identifier}] "${request.content.title}" type=${trigger.type} ` +
        `seconds=${trigger.seconds} repeats=${trigger.repeats ?? false}${etaLabel}`,
    );
  }
}
