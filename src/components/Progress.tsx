import { StyleSheet, View } from 'react-native';

import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

/** Thin progress track. `value` is 0..1. */
export function ProgressBar({
  value,
  tone = color.lime,
  height = 6,
}: {
  value: number;
  tone?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value));

  return (
    <View style={[styles.track, { height, borderRadius: radius.pill }]}>
      <View
        style={{
          height,
          borderRadius: radius.pill,
          backgroundColor: tone,
          width: `${pct * 100}%`,
        }}
      />
    </View>
  );
}

/** Onboarding "1/3" stepper: back button, track, counter. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepTrack}>
        <ProgressBar value={step / total} height={4} />
      </View>
      <Txt variant="labelTight">{`${step}/${total}`}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: color.hairline, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  stepTrack: { flex: 1 },
});
