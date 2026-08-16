import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { color, radius } from '@/theme/tokens';

type Props = {
  title?: string;
  detail?: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

/** Branded transition used while Clerk or the remote bootstrap is settling. */
export function AppLoadingScreen({
  title = 'Preparando tu espacio',
  detail = 'Un segundo y ya estamos.',
  error = false,
  actionLabel,
  onAction,
}: Props) {
  return (
    <Screen contentStyle={styles.body}>
      <View style={styles.content}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />

        <View style={styles.skeleton} accessibilityElementsHidden>
          <View style={[styles.skeletonLine, styles.skeletonShort]} />
          <View style={[styles.skeletonLine, styles.skeletonTitle]} />
          <View style={[styles.skeletonLine, styles.skeletonWide]} />
          <View style={styles.skeletonCard}>
            <View style={[styles.skeletonLine, styles.skeletonCardTitle]} />
            <View style={[styles.skeletonLine, styles.skeletonCardMeta]} />
          </View>
        </View>

        <View style={styles.copy}>
          {error ? null : <ActivityIndicator color={color.lime} size="small" />}
          <Txt variant="h3" center>
            {title}
          </Txt>
          <Txt variant="bodyLg" tone={color.textMuted} center>
            {detail}
          </Txt>
        </View>

        {actionLabel && onAction ? (
          <Button label={actionLabel} variant="outline" onPress={onAction} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { justifyContent: 'center', paddingHorizontal: 28 },
  content: { alignItems: 'center', gap: 22 },
  logo: { width: 58, height: 58, borderRadius: 18 },
  skeleton: {
    width: '100%',
    gap: 10,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  skeletonLine: { height: 11, borderRadius: radius.pill, backgroundColor: color.raised },
  skeletonShort: { width: '26%' },
  skeletonTitle: { width: '72%', height: 22 },
  skeletonWide: { width: '88%' },
  skeletonCard: {
    gap: 10,
    marginTop: 8,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceAlt,
  },
  skeletonCardTitle: { width: '64%', height: 16 },
  skeletonCardMeta: { width: '42%' },
  copy: { alignItems: 'center', gap: 9 },
});
