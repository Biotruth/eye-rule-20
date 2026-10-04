import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

interface PermissionBannerProps {
  canAskAgain: boolean;
  onRequestPermission: () => void;
}

export function PermissionBanner({ canAskAgain, onRequestPermission }: PermissionBannerProps) {
  const openSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  return (
    <View style={styles.banner}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Notifications are off</Text>
        <Text style={styles.body}>Breaks won&apos;t reach you when the app is closed.</Text>
      </View>
      <Pressable
        style={styles.button}
        onPress={canAskAgain ? onRequestPermission : openSettings}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{canAskAgain ? 'Enable' : 'Settings'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: colors.warning,
    fontSize: typography.caption,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  button: {
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
