import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

type Props = {
  value: string;
  /** small unit rendered inline after the value, e.g. "kg" */
  unit?: string;
  label: string;
  valueTone?: string;
  /** compact variant used in the tight 3-up rows */
  compact?: boolean;
  /** drop the card chrome — for stats sitting on a violet block */
  bare?: boolean;
  style?: ViewStyle;
};

/** Number-over-label tile. Appears in 8 of the 18 screens. */
export function StatTile({ value, unit, label, valueTone, compact, bare, style }: Props) {
  return (
    <View style={[bare ? styles.bare : styles.card, compact && styles.compact, style]}>
      <Txt variant={compact ? 'statSm' : 'stat'} tone={valueTone}>
        {value}
        {unit ? <Txt variant="rowTitle" tone={valueTone}>{` ${unit}`}</Txt> : null}
      </Txt>
      <Txt variant="metaSm" tone={bare ? color.onViolet : color.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 3,
  },
  compact: { padding: 12 },
  bare: { gap: 2 },
});
