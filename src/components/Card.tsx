import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { color, radius } from '@/theme/tokens';

export type CardTone =
  /** default dark card with hairline border */
  | 'surface'
  /** quieter panel, no border emphasis */
  | 'muted'
  /** violet feature block */
  | 'violet'
  /** lime feature block */
  | 'lime'
  /** dashed outline — dropzones and "add" affordances */
  | 'dashed';

type Props = {
  children: ReactNode;
  tone?: CardTone;
  /** lime hairline: marks the active/selected card */
  active?: boolean;
  /** violet hairline: marks the card being edited */
  editing?: boolean;
  onPress?: () => void;
  padding?: number;
  gap?: number;
  radius?: number;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Every surface in the design is one of five card tones. Keeping them here
 * means the "selected" hairline is the same lime in all 18 screens.
 */
export function Card({
  children,
  tone = 'surface',
  active,
  editing,
  onPress,
  padding = 18,
  gap,
  radius: r = radius.xxl,
  style,
  testID,
}: Props) {
  const base: ViewStyle = {
    padding,
    gap,
    borderRadius: r,
    ...TONE[tone],
  };

  if (active) base.borderColor = color.lime;
  if (editing) base.borderColor = color.violet;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View testID={testID} style={[base, style]}>{children}</View>;
}

const TONE: Record<CardTone, ViewStyle> = {
  surface: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  muted: { backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.hairline },
  violet: { backgroundColor: color.violet },
  lime: { backgroundColor: color.lime },
  dashed: {
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
  },
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
});
