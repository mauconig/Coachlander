import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import type { CoachExerciseProgress } from '@/api/client';
import { Txt } from '@/components/Txt';
import { displayDate } from '@/lib/stats';
import { num } from '@/lib/format';
import { color } from '@/theme/tokens';

type Props = { progress: CoachExerciseProgress };
type Point = CoachExerciseProgress['points'][number];

const WIDTH = 340;
const HEIGHT = 210;
const PAD_X = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

export function CoachExerciseProgressChart({ progress }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(progress.points.length - 1);
  const metricLabel = progress.exercise.bodyweight ? 'REPS MÁXIMAS' : 'CARGA A REPS OBJETIVO';
  const values = useMemo(() => progress.points.map((point) => metricValue(point, progress.exercise.bodyweight)), [progress]);
  const idealValues = useMemo(() => progress.goal
    ? progress.points.map((point) => interpolateGoal(point.bucketStart, progress.goal!, progress.exercise.bodyweight))
    : [], [progress]);
  const numericValues = [...values, ...idealValues].filter((value): value is number => value !== null);
  const minValue = Math.max(0, Math.min(...numericValues, 0) * 0.9);
  const maxValue = Math.max(...numericValues, 1) * 1.1;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xFor = (index: number) => progress.points.length <= 1
    ? WIDTH / 2
    : PAD_X + (index * (WIDTH - PAD_X * 2)) / (progress.points.length - 1);
  const yFor = (value: number) => PAD_TOP + innerHeight - ((value - minValue) / Math.max(maxValue - minValue, 1)) * innerHeight;
  const actualSegments = makeSegments(progress.points, values, xFor, yFor);
  const idealPoints = idealValues.length
    ? idealValues.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ')
    : '';
  const selectedPoint = progress.points[selectedIndex] ?? null;
  const selectedValue = selectedPoint ? metricValue(selectedPoint, progress.exercise.bodyweight) : null;

  return (
    <View style={styles.root}>
      <View style={styles.chartFrame}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Line x1={PAD_X} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH - PAD_X} y2={HEIGHT - PAD_BOTTOM} stroke={color.border} strokeWidth="1" />
          <Line x1={PAD_X} y1={PAD_TOP} x2={PAD_X} y2={HEIGHT - PAD_BOTTOM} stroke={color.border} strokeWidth="1" />
          {progress.goal && idealPoints ? <Polyline points={idealPoints} fill="none" stroke={color.violetSoft} strokeWidth="2" strokeDasharray="6 5" /> : null}
          {actualSegments.map((segment, index) => (
            <Polyline key={index} points={segment} fill="none" stroke={color.lime} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {progress.points.map((point, index) => {
            const value = values[index];
            if (value === null) {
              return <Circle key={point.bucketStart} cx={xFor(index)} cy={HEIGHT - PAD_BOTTOM} r="3" fill={color.surface} stroke={color.textFaint} strokeWidth="1" />;
            }
            return (
              <Circle
                key={point.bucketStart}
                cx={xFor(index)}
                cy={yFor(value)}
                r={selectedIndex === index ? 6 : 4}
                fill={point.meetsTarget ? color.lime : color.surface}
                stroke={point.meetsTarget ? color.ink : color.textFaint}
                strokeWidth="2"
                onPress={() => setSelectedIndex(index)}
              />
            );
          })}
        </Svg>
        <View style={styles.axisLabels}>
          <Txt variant="metaSm" tone={color.textFaint}>{progress.points[0]?.label ?? ''}</Txt>
          <Txt variant="metaSm" tone={color.textFaint}>{progress.points[progress.points.length - 1]?.label ?? ''}</Txt>
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color.lime }]} /><Txt variant="meta" tone={color.textMuted}>Real</Txt></View>
        {progress.goal ? <View style={styles.legendItem}><View style={[styles.legendLine, { borderColor: color.violetSoft }]} /><Txt variant="meta" tone={color.textMuted}>Objetivo</Txt></View> : null}
      </View>
      {selectedPoint ? (
        <View style={styles.tooltip}>
          <Txt variant="meta" tone={color.textMuted}>{displayDate(selectedPoint.bucketStart)}</Txt>
          <Txt variant="rowTitle">{selectedValue === null ? 'Objetivo no alcanzado' : `${progress.exercise.bodyweight ? `${selectedValue} reps` : `${num(selectedValue)} kg`} · ${selectedPoint.reps ?? 0} reps reales`}</Txt>
        </View>
      ) : null}
      <Txt variant="meta" tone={color.textFaint}>{metricLabel}</Txt>
    </View>
  );
}

function metricValue(point: Point, bodyweight: boolean) {
  if (!point.meetsTarget) return null;
  return bodyweight ? point.reps : point.loadKg;
}

function makeSegments(points: Point[], values: Array<number | null>, xFor: (index: number) => number, yFor: (value: number) => number) {
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${xFor(index)},${yFor(value)}`);
  });
  if (current.length) segments.push(current.join(' '));
  return segments;
}

function interpolateGoal(date: string, goal: NonNullable<CoachExerciseProgress['goal']>, bodyweight: boolean) {
  const baseline = bodyweight ? goal.baselineReps : goal.baselineLoadKg;
  const target = bodyweight ? goal.targetReps : goal.targetLoadKg;
  if (baseline === null || target === null) return baseline ?? target ?? 0;
  const start = Date.parse(`${goal.baselineDate}T00:00:00Z`);
  const end = Date.parse(`${goal.targetDate}T00:00:00Z`);
  const point = Date.parse(`${date}T00:00:00Z`);
  const ratio = end === start ? 1 : Math.max(0, Math.min(1, (point - start) / (end - start)));
  return baseline + (target - baseline) * ratio;
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  chartFrame: { height: HEIGHT, position: 'relative' },
  axisLabels: { position: 'absolute', left: PAD_X, right: PAD_X, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 18, borderTopWidth: 2, borderStyle: 'dashed' },
  tooltip: { backgroundColor: color.surfaceAlt, borderRadius: 14, padding: 12, gap: 3 },
});
