import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

interface PermissionBannerProps {
  canAskAgain: boolean;
  onRequestPermission: () => void;
}

export function PermissionBanner({ canAskAgain, onRequestPermission }: PermissionBannerProps) {
  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>Notifications are off</Text>
      <Text style={styles.body}>
        Alerts won&apos;t fire while the app is in the background. Enable notifications so you
        don&apos;t miss your eye breaks.
      </Text>
      <Pressable
        style={styles.button}
        onPress={canAskAgain ? onRequestPermission : openSettings}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{canAskAgain ? 'Enable notifications' : 'Open Settings'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  title: {
    color: colors.warning,
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  buttonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: typography.caption,
  },
});
