import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';
import { WEEKDAY_SHORT_LABELS } from '@/timer/activeHours';

interface WeekdayPickerProps {
  value: boolean[];
  onChange: (next: boolean[]) => void;
}

export function WeekdayPicker({ value, onChange }: WeekdayPickerProps) {
  const toggleDay = (index: number) => {
    const next = [...value];
    next[index] = !next[index];
    onChange(next);
  };

  return (
    <View style={styles.row}>
      {WEEKDAY_SHORT_LABELS.map((label, index) => {
        const active = value[index];
        return (
          <Pressable
            key={index}
            style={[styles.day, active && styles.dayActive]}
            onPress={() => toggleDay(index)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.dayText, active && styles.dayTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  dayActive: {
    backgroundColor: colors.primary,
  },
  dayText: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: '700',
  },
  dayTextActive: {
    color: colors.background,
  },
});
