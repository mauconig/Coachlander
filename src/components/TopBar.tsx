import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Txt } from './Txt';
import { color, hitSlop, radius } from '@/theme/tokens';

type Props = {
  /** centre eyebrow, rendered in mono caps */
  title?: string;
  /** replaces the centre eyebrow with a two-line block */
  subtitle?: string;
  /** text action on the right */
  action?: string;
  actionTone?: string;
  onAction?: () => void;
  onBack?: () => void;
  /** hide the back affordance (root screens of a flow) */
  hideBack?: boolean;
  right?: ReactNode;
};

/** The circular back button that opens almost every non-tab screen. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      hitSlop={hitSlop}
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Volver"
    >
      <Icon name="chevron-left" size={18} tone={color.textMuted} />
    </Pressable>
  );
}

export function TopBar({
  title,
  subtitle,
  action,
  actionTone = color.textFaint,
  onAction,
  onBack,
  hideBack,
  right,
}: Props) {
  return (
    <View style={styles.bar}>
      {hideBack ? <View style={styles.spacer} /> : <BackButton onPress={onBack} />}

      <View style={styles.centre}>
        {subtitle ? (
          <>
            <Txt variant="labelSm">{title}</Txt>
            <Txt variant="rowTitle" style={styles.subtitle}>
              {subtitle}
            </Txt>
          </>
        ) : title ? (
          <Txt variant="label">{title}</Txt>
        ) : null}
      </View>

      {right ?? (
        action ? (
          <Pressable hitSlop={hitSlop} onPress={onAction} accessibilityRole="button">
            <Txt variant="labelTight" tone={actionTone}>
              {action}
            </Txt>
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  circle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: 34, height: 34 },
  pressed: { opacity: 0.6 },
  centre: { flex: 1, alignItems: 'center', gap: 3 },
  subtitle: { fontSize: 13 },
});
