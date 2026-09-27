import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/constants/theme';
import { useTimer } from '@/timer/TimerContext';

/**
 * Shown before the OS permission dialog ever appears, on first launch and
 * whenever the user taps "Enable notifications" while still askable. The
 * system prompt only fires from the "Enable alerts" button here — tapping
 * "Not now" just dismisses this screen, leaving permission status
 * untouched (still undetermined) so it can be asked again later without
 * counting against the OS's "asked and denied" tracking.
 *
 * Suppresses itself while the onboarding explainer is up — both are
 * "overFullScreen" modals that could otherwise render simultaneously on
 * first launch, and onboarding should be seen first.
 */
export function PermissionPrimerModal() {
  const { permissionPrimerVisible, onboardingVisible, dismissPermissionPrimer, confirmPermissionPrimer } =
    useTimer();
  const visible = permissionPrimerVisible && !onboardingVisible;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="overFullScreen" transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.card} edges={['bottom']}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Stay on schedule</Text>
          <Text style={styles.body}>
            20-20-20 uses notifications to remind you to take an eye break — including while the
            app is in the background or your phone is locked. Without them, reminders only work
            while the app is open.
          </Text>
          <Pressable style={styles.primaryButton} onPress={confirmPermissionPrimer} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Enable alerts</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={dismissPermissionPrimer} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Not now</Text>
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 24,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.body,
  },
  secondaryButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: typography.body,
  },
});
