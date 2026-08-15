import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, color } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  /** screen background — violet for the welcome screen, dark everywhere else */
  background?: string;
  /** wrap the body in a ScrollView (most screens are taller than a phone) */
  scroll?: boolean;
  /** apply the 22pt horizontal gutter */
  padded?: boolean;
  /** pinned to the bottom, outside the scroll area */
  footer?: ReactNode;
  /** extra breathing room under the last element */
  bottomInset?: boolean;
  gap?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  background = color.screen,
  scroll = false,
  padded = true,
  footer,
  bottomInset = true,
  gap,
  style,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  const body: ViewStyle = {
    paddingHorizontal: padded ? GUTTER : 0,
    paddingTop: 12,
    gap,
  };

  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: insets.top }, style]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            body,
            // flexGrow lets screens push their CTA to the bottom with
            // `marginTop: 'auto'` while still scrolling when content overflows.
            { flexGrow: 1, paddingBottom: footer ? 12 : bottomInset ? insets.bottom + 24 : 12 },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, body, contentStyle]}>{children}</View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingHorizontal: padded ? GUTTER : 0, paddingBottom: insets.bottom + 14 },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  footer: {
    paddingTop: 14,
    gap: 10,
  },
});
