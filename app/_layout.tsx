import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BreakOverlay } from '@/components/BreakOverlay';
import { OnboardingModal } from '@/components/OnboardingModal';
import { PermissionPrimerModal } from '@/components/PermissionPrimerModal';
import { colors, typography } from '@/constants/theme';
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
          {/*
            A plain pushed screen, not presentation: 'modal'. On iOS a native
            modal sheet occupies the root view controller, so the app-level
            <Modal>s below (break screen, intro, permission primer) can't
            present while it's up — buttons that open them from Settings
            silently did nothing, and swipe-dismissing the sheet could leave
            an invisible layer swallowing every touch.
          */}
          <Stack.Screen
            name="settings"
            options={({ navigation }) => ({
              title: 'Settings',
              headerBackVisible: false,
              headerRight: () => (
                <Pressable
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  hitSlop={12}
                  style={styles.doneButton}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              ),
            })}
          />
        </Stack>
        <BreakOverlay />
        <PermissionPrimerModal />
        <OnboardingModal />
      </TimerProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  doneButton: {
    paddingHorizontal: 12,
  },
  doneText: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '600',
  },
});
