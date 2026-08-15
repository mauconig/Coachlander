import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

export type ButtonVariant =
  /** lime pill — the single primary action on a screen */
  | 'primary'
  /** violet pill — coach-side confirm, secondary emphasis */
  | 'violet'
  /** transparent with a hairline border */
  | 'outline'
  /** near-black fill, used on violet backgrounds (Apple sign-in) */
  | 'dark'
  /** white fill (Google sign-in) */
  | 'light'
  /** bare text link */
  | 'ghost';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'lg' | 'md' | 'sm';
  /** rendered before the label */
  icon?: ReactNode;
  disabled?: boolean;
  /** stretch to fill a row */
  fill?: boolean;
  style?: ViewStyle;
  haptic?: boolean;
};

const HEIGHT = { lg: 58, md: 52, sm: 44 } as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled,
  fill,
  style,
  haptic = true,
}: Props) {
  const skin = SKIN[variant];

  const handlePress = () => {
    if (disabled) return;
    if (haptic && Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size] },
        skin.container,
        fill && styles.fill,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Txt
        variant={variant === 'ghost' ? 'bodyLg' : size === 'lg' ? 'button' : 'buttonUi'}
        tone={skin.tone}
        numberOfLines={1}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const SKIN: Record<ButtonVariant, { container: ViewStyle; tone: string }> = {
  primary: { container: { backgroundColor: color.lime }, tone: color.ink },
  violet: { container: { backgroundColor: color.violet }, tone: color.text },
  outline: {
    container: { borderWidth: 1, borderColor: color.border },
    tone: color.text,
  },
  dark: { container: { backgroundColor: color.ink }, tone: color.text },
  light: { container: { backgroundColor: color.text }, tone: color.ink },
  ghost: { container: { backgroundColor: 'transparent' }, tone: color.textFaint },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22,
  },
  fill: { flex: 1 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.4 },
});
