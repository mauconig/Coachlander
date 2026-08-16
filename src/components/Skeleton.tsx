import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { Screen } from '@/components/Screen';
import { color, radius } from '@/theme/tokens';

type Props = {
  style?: ViewStyle | ViewStyle[];
  radiusValue?: number;
};

/** Animated placeholder for content that already has a known layout. */
export function Skeleton({ style, radiusValue = radius.md }: Props) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[styles.base, { borderRadius: radiusValue }, style, { opacity }]}
    />
  );
}

export function WorkspaceSkeletonScreen() {
  return (
    <Screen scroll gap={18}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Skeleton style={styles.eyebrow} radiusValue={radius.pill} />
          <Skeleton style={styles.heading} radiusValue={radius.sm} />
        </View>
        <Skeleton style={styles.avatar} radiusValue={radius.pill} />
      </View>

      <Skeleton style={styles.hero} radiusValue={radius.xxl} />

      <View style={styles.list}>
        <Skeleton style={styles.sectionTitle} radiusValue={radius.pill} />
        <Skeleton style={styles.row} radiusValue={radius.lg} />
        <Skeleton style={styles.row} radiusValue={radius.lg} />
        <Skeleton style={styles.rowShort} radiusValue={radius.lg} />
      </View>
    </Screen>
  );
}

export function RoleSkeletonScreen() {
  return (
    <Screen scroll gap={18}>
      <View style={styles.stepper}>
        <Skeleton style={styles.back} radiusValue={radius.pill} />
        <Skeleton style={styles.progress} radiusValue={radius.pill} />
      </View>

      <View style={styles.intro}>
        <Skeleton style={styles.introTitle} radiusValue={radius.sm} />
        <Skeleton style={styles.introSubtitle} radiusValue={radius.pill} />
      </View>

      <View style={styles.choices}>
        <Skeleton style={styles.choice} radiusValue={26} />
        <Skeleton style={styles.choice} radiusValue={26} />
      </View>

      <Skeleton style={styles.continueButton} radiusValue={radius.pill} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: color.raised },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { gap: 8 },
  eyebrow: { width: 122, height: 10 },
  heading: { width: 178, height: 28 },
  avatar: { width: 44, height: 44 },
  hero: { height: 238, width: '100%' },
  list: { gap: 10 },
  sectionTitle: { width: 148, height: 14, marginBottom: 3 },
  row: { height: 72, width: '100%' },
  rowShort: { height: 72, width: '86%' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44 },
  progress: { flex: 1, height: 8 },
  intro: { gap: 10, marginTop: 4 },
  introTitle: { width: '82%', height: 32 },
  introSubtitle: { width: '68%', height: 14 },
  choices: { gap: 12, marginTop: 4 },
  choice: { width: '100%', height: 166 },
  continueButton: { width: '100%', height: 58, marginTop: 'auto' },
});
