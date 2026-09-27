import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlwaysOnHome } from '@/components/AlwaysOnHome';
import { SessionHome } from '@/components/SessionHome';
import { colors } from '@/constants/theme';
import { useTimer } from '@/timer/TimerContext';

export default function TimerScreen() {
  const { hydrated, mode } = useTimer();

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return mode === 'SESSION' ? <SessionHome /> : <AlwaysOnHome />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
  },
});
