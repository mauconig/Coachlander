import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** violet fill when selected instead of lime */
  tone?: 'lime' | 'violet';
  /** mono caps (filters) vs UI sans (choices) */
  mono?: boolean;
  style?: ViewStyle;
};

/** Pill filter / choice control. Selected state is a solid accent fill. */
export function Chip({ label, selected, onPress, tone = 'lime', mono = true, style }: ChipProps) {
  const fill = tone === 'lime' ? color.lime : color.violet;
  const container: ViewStyle = selected
    ? { backgroundColor: fill, borderWidth: 1, borderColor: fill }
    : { borderWidth: 1, borderColor: color.border };
  const textTone = selected ? (tone === 'lime' ? color.ink : color.text) : color.textMuted;

  const body = (
    <Txt variant={mono ? 'labelTight' : 'bodyStrong'} tone={textTone}>
      {label}
    </Txt>
  );

  if (!onPress) return <View style={[styles.chip, container, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, container, pressed && styles.pressed, style]}
    >
      {body}
    </Pressable>
  );
}

/** Horizontal group of chips where exactly one is selected. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  tone,
  mono,
  fill,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  tone?: 'lime' | 'violet';
  mono?: boolean;
  /** each chip stretches to share the row evenly */
  fill?: boolean;
}) {
  return (
    <View style={styles.group}>
      {options.map((opt) => (
        <Chip
          key={opt}
          label={opt}
          selected={opt === value}
          onPress={() => onChange(opt)}
          tone={tone}
          mono={mono}
          style={fill ? styles.grow : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 13,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
});
