import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PermissionBanner } from '@/components/PermissionBanner';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, typography } from '@/constants/theme';
import { useTimer } from '@/timer/TimerContext';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** The manual focused-session flow: Start/Pause/Reset over a fixed WORK/BREAK loop, independent of the always-on schedule. */
export function SessionHome() {
  const {
    phase,
    remainingMs,
    phaseDurationMs,
    isRunning,
    cyclesCompletedToday,
    notificationsGranted,
    canAskAgain,
    start,
    pause,
    reset,
    endSession,
    showPermissionPrimer,
  } = useTimer();

  const progress = phaseDurationMs > 0 ? 1 - remainingMs / phaseDurationMs : 0;
  const ringColor = phase === 'WORK' ? colors.primary : colors.success;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={endSession} accessibilityRole="button" hitSlop={12} style={styles.endSessionButton}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          <Text style={styles.endSessionText}>End session</Text>
        </Pressable>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        </Link>
      </View>

      {!notificationsGranted && (
        <PermissionBanner canAskAgain={canAskAgain} onRequestPermission={showPermissionPrimer} />
      )}

      <View style={styles.center}>
        <Text style={[styles.phaseLabel, { color: ringColor }]}>
          {phase === 'WORK' ? 'FOCUS TIME' : 'BREAK TIME'}
        </Text>
        <ProgressRing size={280} strokeWidth={16} progress={progress} color={ringColor}>
          <Text style={styles.numeral}>{formatDuration(remainingMs)}</Text>
          <Text style={styles.numeralLabel}>{phase === 'WORK' ? 'until your break' : 'look away'}</Text>
        </ProgressRing>
        <Text style={styles.cycleCount}>
          {cyclesCompletedToday} {cyclesCompletedToday === 1 ? 'break' : 'breaks'} today
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.secondaryButton} onPress={reset} accessibilityRole="button">
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          <Text style={styles.secondaryButtonText}>Reset</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: ringColor }]}
          onPress={isRunning ? pause : start}
          accessibilityRole="button"
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color={colors.background} />
          <Text style={styles.primaryButtonText}>{isRunning ? 'Pause' : 'Start'}</Text>
        </Pressable>

        <View style={styles.secondaryButton} />
      </View>
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
  endSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  endSessionText: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  cycleCount: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: '600',
    letterSpacing: 1,
  },
  center: {
    flex: 1,
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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    gap: 2,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.caption,
  },
  secondaryButton: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
