import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

interface StepperProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}

export function Stepper({ label, value, unit, min, max, step, onChange }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  return (
    <View style={styles.row}>
      <View style={styles.labelBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.range}>
          {min}–{max} {unit}
        </Text>
      </View>
      <View style={styles.control}>
        <Pressable
          style={[styles.button, value <= min && styles.buttonDisabled]}
          onPress={dec}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          hitSlop={8}
        >
          <Ionicons name="remove" size={20} color={value <= min ? colors.textMuted : colors.textPrimary} />
        </Pressable>
        <Text style={styles.value}>
          {value} {unit}
        </Text>
        <Pressable
          style={[styles.button, value >= max && styles.buttonDisabled]}
          onPress={inc}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={value >= max ? colors.textMuted : colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  labelBlock: {
    gap: 2,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: '600',
  },
  range: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  value: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: '600',
    minWidth: 90,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
