import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PermissionBanner } from '@/components/PermissionBanner';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, typography } from '@/constants/theme';
import { nextActiveWindowStart } from '@/timer/activeHours';
import { useTimer } from '@/timer/TimerContext';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const totalMinutes = Math.max(0, Math.round((targetMs - nowMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The default home view: a standing always-on schedule you turn on and pause/resume manually whenever you like; active-hours scheduling is an opt-in refinement (Settings) layered on top. */
export function AlwaysOnHome() {
  const {
    phase,
    remainingMs,
    phaseDurationMs,
    isRunning,
    pausedUntil,
    manuallyPaused,
    cyclesCompletedToday,
    settings,
    notificationsGranted,
    canAskAgain,
    setRemindersEnabled,
    pauseOneHour,
    resumeNow,
    pauseIndefinitely,
    resumeFromManualPause,
    startSession,
    showPermissionPrimer,
  } = useTimer();

  // The global 250ms tick (in TimerContext) only re-renders consumers when
  // remainingMs actually changes, which it doesn't while frozen (paused, or
  // outside active hours) — so the "Resumes in Xm" / "next window" text
  // below needs its own, much coarser re-render trigger to stay current.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRerender((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const isPaused = pausedUntil != null && now < pausedUntil;
  const ringColor = phase === 'WORK' ? colors.primary : colors.success;
  const progress = phaseDurationMs > 0 ? 1 - remainingMs / phaseDurationMs : 0;

  let statusView: React.ReactNode;
  if (!settings.remindersEnabled) {
    statusView = (
      <View style={styles.statusCard}>
        <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
        <Text style={styles.statusTitle}>Reminders are off</Text>
        <Text style={styles.statusBody}>Turn on the toggle above to start the standing schedule.</Text>
      </View>
    );
  } else if (manuallyPaused) {
    statusView = (
      <View style={styles.statusCard}>
        <Ionicons name="pause-circle-outline" size={40} color={colors.warning} />
        <Text style={styles.statusTitle}>Paused</Text>
        <Text style={styles.statusBody}>Resume whenever you're ready — no rush.</Text>
        <Pressable style={styles.pillButton} onPress={resumeFromManualPause} accessibilityRole="button">
          <Text style={styles.pillButtonText}>Resume</Text>
        </Pressable>
      </View>
    );
  } else if (isPaused) {
    statusView = (
      <View style={styles.statusCard}>
        <Ionicons name="pause-circle-outline" size={40} color={colors.warning} />
        <Text style={styles.statusTitle}>Paused</Text>
        <Text style={styles.statusBody}>Resumes in {formatCountdown(pausedUntil!, now)}</Text>
        <Pressable style={styles.pillButton} onPress={resumeNow} accessibilityRole="button">
          <Text style={styles.pillButtonText}>Resume now</Text>
        </Pressable>
      </View>
    );
  } else if (!isRunning) {
    // Only reachable when "Restrict to active hours" is turned on in
    // Settings — with it off (the default), reminders never auto-freeze
    // by the clock, only via an explicit pause above.
    const nextStart = nextActiveWindowStart(settings, new Date(now));
    statusView = (
      <View style={styles.statusCard}>
        <Ionicons name="moon-outline" size={40} color={colors.textMuted} />
        <Text style={styles.statusTitle}>Outside active hours</Text>
        <Text style={styles.statusBody}>
          {nextStart
            ? `Next window starts ${nextStart.toLocaleDateString(undefined, { weekday: 'long' })} at ${nextStart.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
            : 'No active days are selected — check Settings.'}
        </Text>
      </View>
    );
  } else {
    statusView = (
      <View style={styles.center}>
        <Text style={[styles.phaseLabel, { color: ringColor }]}>
          {phase === 'WORK' ? 'NEXT REMINDER' : 'BREAK TIME'}
        </Text>
        <ProgressRing size={260} strokeWidth={14} progress={progress} color={ringColor}>
          <Text style={styles.numeral}>{formatDuration(remainingMs)}</Text>
          <Text style={styles.numeralLabel}>{phase === 'WORK' ? 'until your break' : 'look away'}</Text>
        </ProgressRing>
        <View style={styles.pauseRow}>
          <Pressable style={styles.pillButtonOutline} onPress={pauseIndefinitely} accessibilityRole="button">
            <Text style={styles.pillButtonOutlineText}>Pause</Text>
          </Pressable>
          <Pressable style={styles.pillButtonOutline} onPress={pauseOneHour} accessibilityRole="button">
            <Text style={styles.pillButtonOutlineText}>Pause 1 hour</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.cycleCount}>{cyclesCompletedToday} today</Text>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        </Link>
      </View>

      {!notificationsGranted && (
        <PermissionBanner canAskAgain={canAskAgain} onRequestPermission={showPermissionPrimer} />
      )}

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>Eye reminders</Text>
          <Text style={styles.toggleSub}>
            {settings.remindersEnabled ? 'Always on' : 'Off'}
          </Text>
        </View>
        <Switch
          value={settings.remindersEnabled}
          onValueChange={setRemindersEnabled}
          trackColor={{ false: colors.border, true: colors.primaryDim }}
          thumbColor={settings.remindersEnabled ? colors.primary : colors.textMuted}
        />
      </View>

      <View style={styles.body}>{statusView}</View>

      <Pressable style={styles.sessionLink} onPress={startSession} accessibilityRole="button">
        <Ionicons name="timer-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.sessionLinkText}>Start a focused session instead</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cycleCount: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: '600',
    letterSpacing: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: '600',
  },
  toggleSub: {
    color: colors.textMuted,
    fontSize: typography.caption,
    marginTop: 2,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  phaseLabel: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 3,
  },
  numeral: {
    color: colors.textPrimary,
    fontSize: typography.numeralLarge,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  numeralLabel: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginTop: -spacing.xs,
  },
  statusCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: '600',
  },
  statusBody: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
  },
  pillButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 24,
  },
  pillButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.body,
  },
  pauseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pillButtonOutline: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillButtonOutlineText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: typography.body,
  },
  sessionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  sessionLinkText: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
