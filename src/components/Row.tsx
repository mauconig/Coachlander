import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

type Props = {
  title: string;
  meta?: string;
  /** colour override for the meta line — lime flags something needing attention */
  metaTone?: string;
  titleTone?: string;
  titleNumberOfLines?: number;
  /** leading slot: index number, avatar, icon */
  left?: ReactNode;
  /** trailing slot; falls back to `trailing` text or a chevron */
  right?: ReactNode;
  trailing?: string;
  trailingTone?: string;
  chevron?: boolean;
  onPress?: () => void;
  active?: boolean;
  tone?: 'surface' | 'muted' | 'violet';
  style?: ViewStyle;
};

/**
 * The list row that carries most of the app's content: exercises, clients,
 * sessions and settings all share this shape.
 */
export function Row({
  title,
  meta,
  metaTone,
  titleTone,
  titleNumberOfLines = 1,
  left,
  right,
  trailing,
  trailingTone = color.textMuted,
  chevron,
  onPress,
  active,
  tone = 'surface',
  style,
}: Props) {
  const container: ViewStyle = {
    ...styles.row,
    ...(tone === 'violet'
      ? { backgroundColor: color.violet }
      : tone === 'muted'
        ? { backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.border }
        : { backgroundColor: color.surface, borderWidth: 1, borderColor: active ? color.lime : color.border }),
  };

  const body = (
    <>
      {left}
      <View style={styles.text}>
        <Txt variant="rowTitle" tone={titleTone} numberOfLines={titleNumberOfLines}>
          {title}
        </Txt>
        {meta ? (
          <Txt variant="meta" tone={metaTone} numberOfLines={1}>
            {meta}
          </Txt>
        ) : null}
      </View>
      {right ??
        (trailing ? (
          <Txt variant="labelTight" tone={trailingTone}>
            {trailing}
          </Txt>
        ) : chevron ? (
          <Icon name="chevron-right" size={16} tone={color.textFaint} />
        ) : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [container, pressed && styles.pressed, style]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[container, style]}>{body}</View>;
}

/** Two-digit ordinal shown at the head of exercise rows. */
export function RowIndex({ n, tone = color.violet }: { n: number; tone?: string }) {
  return (
    <Txt variant="labelTight" tone={tone} style={styles.index}>
      {String(n).padStart(2, '0')}
    </Txt>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  text: { flex: 1, gap: 2 },
  index: { fontSize: 13 },
  pressed: { opacity: 0.85 },
});
