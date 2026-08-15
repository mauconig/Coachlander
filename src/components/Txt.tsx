import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { type TypeToken, type as typeScale } from '@/theme/type';

type Props = TextProps & {
  /** typography token from `src/theme/type.ts` */
  variant?: TypeToken;
  /** overrides the token colour */
  tone?: string;
  center?: boolean;
};

/**
 * The single text primitive. Screens never reach for `Text` directly so that
 * every string in the app is anchored to a token in the type scale.
 */
export function Txt({ variant = 'body', tone, center, style, ...rest }: Props) {
  const override: TextStyle = {};
  if (tone) override.color = tone;
  if (center) override.textAlign = 'center';

  // Android adds letterSpacing after the final glyph but leaves it out of the
  // measured width, so wide-tracked labels wrap or truncate a character early.
  // Reserving the trailing advance is what keeps them on one line.
  if (Platform.OS === 'android') {
    const flattenedStyle = StyleSheet.flatten([typeScale[variant], style]) as TextStyle | undefined;
    const tracking = flattenedStyle?.letterSpacing ?? 0;
    if (tracking > 0) override.paddingRight = Math.ceil(tracking);
  }

  return <Text {...rest} style={[typeScale[variant], style, override]} />;
}
