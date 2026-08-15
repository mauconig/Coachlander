import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Txt } from './Txt';
import { font } from '@/theme/type';
import { color, radius } from '@/theme/tokens';

type Props = {
  /** full name; initials are derived from it */
  name: string;
  size?: number;
  tone?: 'neutral' | 'violet' | 'lime' | 'ink';
  /** square-ish tile instead of a circle (date badges) */
  square?: boolean;
  style?: ViewStyle;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export function Avatar({ name, size = 44, tone = 'neutral', square, style }: Props) {
  const skin = TONE[tone];

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: square ? 14 : radius.pill,
          ...skin.container,
        },
        style,
      ]}
    >
      <Txt
        tone={skin.tone}
        style={{ fontFamily: font.displayBold, fontSize: Math.round(size * 0.34) }}
      >
        {initials(name)}
      </Txt>
    </View>
  );
}

const TONE = {
  neutral: {
    container: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
    tone: color.text,
  },
  violet: { container: { backgroundColor: color.violet }, tone: color.text },
  lime: { container: { backgroundColor: color.lime }, tone: color.ink },
  ink: { container: { backgroundColor: color.ink }, tone: color.text },
} as const;

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
