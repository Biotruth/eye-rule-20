import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/constants/theme';
import { useTimer } from '@/timer/TimerContext';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'timer-outline', text: "We'll quietly track time in the background." },
  { icon: 'eye-outline', text: 'Every 20 minutes, a break screen appears.' },
  { icon: 'telescope-outline', text: 'Look at something at least 20 feet away for 20 seconds.' },
  { icon: 'refresh-outline', text: "That's it — repeat, and your eyes get a real rest." },
];

/** First-launch explainer for the 20-20-20 rule itself — shown before the permission primer, and re-viewable later from Settings. */
export function OnboardingModal() {
  const { onboardingVisible, dismissOnboarding } = useTimer();

  return (
    <Modal visible={onboardingVisible} animationType="fade" presentationStyle="overFullScreen" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.card} edges={['bottom']}>
          <Text style={styles.eyebrow}>THE 20-20-20 RULE</Text>
          <Text style={styles.title}>When the break hits...</Text>
          <View style={styles.steps}>
            {STEPS.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={dismissOnboarding} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Got it</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: '700',
    marginTop: -spacing.xs,
  },
  steps: {
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.body,
  },
});
