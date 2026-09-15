import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, typography } from '@/constants/theme';
import { useTimer } from '@/timer/TimerContext';

export function BreakOverlay() {
  const { phase, remainingMs, phaseDurationMs, skipBreak } = useTimer();
  const visible = phase === 'BREAK';
  const seconds = Math.ceil(remainingMs / 1000);
  const progress = phaseDurationMs > 0 ? 1 - remainingMs / phaseDurationMs : 0;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>BREAK TIME</Text>
          <ProgressRing size={260} strokeWidth={14} progress={progress} color={colors.success}>
            <Text style={styles.seconds}>{seconds}</Text>
            <Text style={styles.secondsLabel}>seconds</Text>
          </ProgressRing>
          <Text style={styles.instruction}>Look 20 feet away.</Text>
          <Text style={styles.subInstruction}>Give your eyes a real rest.</Text>
        </View>
        <Pressable style={styles.skipButton} onPress={skipBreak} accessibilityRole="button">
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.overlayBackground,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.success,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 3,
  },
  seconds: {
    color: colors.textPrimary,
    fontSize: typography.numeralLarge,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  secondsLabel: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginTop: -spacing.xs,
  },
  instruction: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  subInstruction: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  skipButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: typography.body,
    fontWeight: '600',
  },
});
