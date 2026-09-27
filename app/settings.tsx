import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PermissionBanner } from '@/components/PermissionBanner';
import { Stepper } from '@/components/Stepper';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import { BREAK_SECONDS_RANGE, WORK_MINUTES_RANGE } from '@/constants/timer';
import { colors, spacing, typography } from '@/constants/theme';
import { cancelAllScheduledAsync, logScheduledNotificationsAsync } from '@/notifications/notifications';
import { formatMinutesOfDay } from '@/timer/activeHours';
import { useTimer } from '@/timer/TimerContext';

function SettingsRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchLabelBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primaryDim }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, notificationsGranted, canAskAgain, showPermissionPrimer, showOnboarding } =
    useTimer();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!notificationsGranted && (
          <PermissionBanner canAskAgain={canAskAgain} onRequestPermission={showPermissionPrimer} />
        )}

        <Text style={styles.sectionTitle}>Durations</Text>
        <View style={styles.card}>
          <Stepper
            label="Work duration"
            value={settings.workMinutes}
            unit="min"
            min={WORK_MINUTES_RANGE.min}
            max={WORK_MINUTES_RANGE.max}
            step={5}
            onChange={(workMinutes) => updateSettings({ workMinutes })}
          />
          <View style={styles.divider} />
          <Stepper
            label="Break duration"
            value={settings.breakSeconds}
            unit="sec"
            min={BREAK_SECONDS_RANGE.min}
            max={BREAK_SECONDS_RANGE.max}
            step={5}
            onChange={(breakSeconds) => updateSettings({ breakSeconds })}
          />
        </View>

        <Text style={styles.sectionTitle}>Active Hours</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Restrict to active hours"
            description="Off by default — reminders just run whenever you turn them on, no schedule. Turn this on to auto-pause outside set hours/days instead."
            value={settings.activeHoursEnabled}
            onValueChange={(activeHoursEnabled) => updateSettings({ activeHoursEnabled })}
          />
          {settings.activeHoursEnabled && (
            <>
              <View style={styles.divider} />
              <Stepper
                label="Starts"
                value={settings.activeHours.startMinutes}
                unit="min"
                min={0}
                max={settings.activeHours.endMinutes - 30}
                step={30}
                formatValue={formatMinutesOfDay}
                rangeLabel="When the standing schedule begins each active day"
                onChange={(startMinutes) =>
                  updateSettings({ activeHours: { ...settings.activeHours, startMinutes } })
                }
              />
              <View style={styles.divider} />
              <Stepper
                label="Ends"
                value={settings.activeHours.endMinutes}
                unit="min"
                min={settings.activeHours.startMinutes + 30}
                max={24 * 60}
                step={30}
                formatValue={formatMinutesOfDay}
                rangeLabel="When it stops for the day"
                onChange={(endMinutes) =>
                  updateSettings({ activeHours: { ...settings.activeHours, endMinutes } })
                }
              />
              <View style={styles.divider} />
              <View style={styles.weekdayRow}>
                <Text style={styles.label}>Active days</Text>
                <WeekdayPicker
                  value={settings.activeWeekdays}
                  onChange={(activeWeekdays) => updateSettings({ activeWeekdays })}
                />
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Alerts</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Vibration"
            description="Haptic pulse at each phase transition"
            value={settings.vibrationEnabled}
            onValueChange={(vibrationEnabled) => updateSettings({ vibrationEnabled })}
          />
          <View style={styles.divider} />
          <SettingsRow
            label="Sound"
            description="Play a sound with background notifications"
            value={settings.soundEnabled}
            onValueChange={(soundEnabled) => updateSettings({ soundEnabled })}
          />
        </View>

        <Text style={styles.sectionTitle}>Display</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Keep screen awake"
            description="Prevent the screen from sleeping while the timer runs"
            value={settings.keepAwakeEnabled}
            onValueChange={(keepAwakeEnabled) => updateSettings({ keepAwakeEnabled })}
          />
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Pressable style={styles.debugRow} onPress={showOnboarding} accessibilityRole="button">
            <Text style={styles.label}>How the 20-20-20 rule works</Text>
            <Text style={styles.description}>Replay the short first-launch explainer</Text>
          </Pressable>
        </View>

        {__DEV__ && (
          <>
            <Text style={styles.sectionTitle}>Debug</Text>
            <View style={styles.card}>
              <Pressable style={styles.debugRow} onPress={showPermissionPrimer} accessibilityRole="button">
                <Text style={styles.label}>Show permission primer</Text>
                <Text style={styles.description}>Previews the pre-permission explainer screen</Text>
              </Pressable>
              {Platform.OS !== 'web' && (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    style={styles.debugRow}
                    onPress={() => logScheduledNotificationsAsync().catch(() => {})}
                    accessibilityRole="button"
                  >
                    <Text style={styles.label}>Log scheduled notifications</Text>
                    <Text style={styles.description}>Prints the pending schedule to the JS console</Text>
                  </Pressable>
                  <View style={styles.divider} />
                  <Pressable
                    style={styles.debugRow}
                    onPress={() => cancelAllScheduledAsync().catch(() => {})}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.label, { color: colors.danger }]}>Stop all reminders</Text>
                    <Text style={styles.description}>
                      Cancels every pending notification (repeating + one-shots). Does not affect the
                      running timer.
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  switchLabelBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  debugRow: {
    paddingVertical: spacing.md,
    gap: 2,
  },
  weekdayRow: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
});
