import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BreakOverlay } from '@/components/BreakOverlay';
import { colors } from '@/constants/theme';
import { TimerProvider, useTimer } from '@/timer/TimerContext';
import { useConditionalKeepAwake } from '@/timer/useConditionalKeepAwake';

function KeepAwakeBridge() {
  const { isRunning, settings } = useTimer();
  useConditionalKeepAwake(isRunning && settings.keepAwakeEnabled);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TimerProvider>
        <StatusBar style="light" />
        <KeepAwakeBridge />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: '20-20-20' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        </Stack>
        <BreakOverlay />
      </TimerProvider>
    </SafeAreaProvider>
  );
}
