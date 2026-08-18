import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import type { AthleteExerciseProgress, AthleteProgressPoint, Unit } from '@/data/types';
import { displayDate } from '@/lib/stats';
import { num } from '@/lib/format';
import { color } from '@/theme/tokens';
import { Txt } from '@/components/Txt';

type Props = {
  progress: AthleteExerciseProgress;
  unit: Unit;
  compareGoal: boolean;
};

const HEIGHT = 220;
const PAD_X = 24;
const PAD_TOP = 18;
const PAD_BOTTOM = 32;

export function AthleteProgressChart({ progress, unit, compareGoal }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(progress.points.length - 1, 0));
  const chartWidth = Math.max(340, progress.points.length * 56);

  useEffect(() => {
    setSelectedIndex(Math.max(progress.points.length - 1, 0));
  }, [progress]);

  const goalValues = useMemo(
    () => progress.points.map((point) => interpolateGoal(point.date, progress)),
    [progress],
  );
  const actualValues = progress.points.map((point) => point.value);
  const numericValues = [...actualValues, ...goalValues].filter((value): value is number => value !== null);
  const minValue = Math.max(0, Math.min(...numericValues, 0) * 0.9);
  const maxValue = Math.max(...numericValues, 1) * 1.1;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xFor = (index: number) => progress.points.length <= 1
    ? chartWidth / 2
    : PAD_X + (index * (chartWidth - PAD_X * 2)) / (progress.points.length - 1);
  const yFor = (value: number) => PAD_TOP + innerHeight - ((value - minValue) / Math.max(maxValue - minValue, 1)) * innerHeight;
  const selectedPoint = progress.points[selectedIndex] ?? null;
  const goalPoints = goalValues
    .map((value, index) => (value === null ? null : `${xFor(index)},${yFor(value)}`))
    .filter((point): point is string => point !== null)
    .join(' ');

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={{ width: chartWidth }}>
          <Svg width={chartWidth} height={HEIGHT} viewBox={`0 0 ${chartWidth} ${HEIGHT}`}>
            <Line x1={PAD_X} y1={HEIGHT - PAD_BOTTOM} x2={chartWidth - PAD_X} y2={HEIGHT - PAD_BOTTOM} stroke={color.border} strokeWidth="1" />
            <Line x1={PAD_X} y1={PAD_TOP} x2={PAD_X} y2={HEIGHT - PAD_BOTTOM} stroke={color.border} strokeWidth="1" />
            {compareGoal && goalPoints ? <Polyline points={goalPoints} fill="none" stroke={color.violetSoft} strokeWidth="2" strokeDasharray="6 5" /> : null}
            {makeStepPaths(progress.points, actualValues, xFor, yFor).map((path, index) => (
              <Path key={index} d={path} fill="none" stroke={color.lime} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {progress.points.map((point, index) => {
              const value = actualValues[index];
              const x = xFor(index);
              const y = value === null ? HEIGHT - PAD_BOTTOM : yFor(value);
              return (
                <Circle
                  key={`${point.date}-${index}`}
                  cx={x}
                  cy={y}
                  r={selectedIndex === index ? 6 : 4}
                  fill={value === null ? color.surface : color.lime}
                  stroke={value === null ? color.textFaint : color.ink}
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
      </ScrollView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color.lime }]} />
          <Txt variant="meta" tone={color.textMuted}>Progreso real</Txt>
        </View>
        {compareGoal && goalPoints ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { borderColor: color.violetSoft }]} />
            <Txt variant="meta" tone={color.textMuted}>Objetivo</Txt>
          </View>
        ) : null}
      </View>

      {selectedPoint ? <PointTooltip point={selectedPoint} progress={progress} unit={unit} /> : null}
      <Txt variant="meta" tone={color.textFaint}>{metricLabel(progress)}</Txt>
    </View>
  );
}

function PointTooltip({ point, progress, unit }: { point: AthleteProgressPoint; progress: AthleteExerciseProgress; unit: Unit }) {
  const valueLabel = point.value === null
    ? 'Objetivo no alcanzado'
    : progress.exercise.progressionMetric === 'load' && !progress.exercise.bodyweight
      ? `${num(point.value)} ${unit}`
      : `${num(point.value)} ${progress.exercise.progressionMetric === 'seconds' ? 's' : 'reps'}`;

  return (
    <View style={styles.tooltip}>
      <Txt variant="meta" tone={color.textMuted}>{displayDate(point.date)}</Txt>
      <Txt variant="rowTitle">{`${valueLabel} · ${point.reps ?? 0} reps reales`}</Txt>
    </View>
  );
}

function metricLabel(progress: AthleteExerciseProgress): string {
  if (progress.exercise.progressionMetric === 'seconds') return 'MEJOR TIEMPO REGISTRADO';
  if (progress.exercise.bodyweight || progress.exercise.progressionMetric === 'reps') return 'REPS MÁXIMAS ALCANZADAS';
  return `CARGA A ${progress.exercise.targetReps} REPS`;
}

function makeStepPaths(
  points: AthleteProgressPoint[],
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
) {
  const paths: string[] = [];
  let current = '';
  values.forEach((value, index) => {
    if (value === null) {
      if (current) paths.push(current);
      current = '';
      return;
    }
    const x = xFor(index);
    const y = yFor(value);
    if (!current) current = `M ${x} ${y}`;
    else {
      const previous = points[index - 1];
      const previousValue = values[index - 1];
      if (!previous || previousValue === null) current = `M ${x} ${y}`;
      else current += ` H ${x} V ${y}`;
    }
  });
  if (current) paths.push(current);
  return paths;
}

function interpolateGoal(date: string, progress: AthleteExerciseProgress): number | null {
  const goal = progress.goal;
  if (!goal) return null;
  const loadMetric = progress.exercise.progressionMetric === 'load' && !progress.exercise.bodyweight;
  const baseline = loadMetric ? goal.baselineLoadKg : goal.baselineReps;
  const target = loadMetric ? goal.targetLoadKg : goal.targetReps;
  if (baseline === null || target === null) return null;
  const start = Date.parse(`${goal.baselineDate}T00:00:00Z`);
  const end = Date.parse(`${goal.targetDate}T00:00:00Z`);
  const point = Date.parse(`${date}T00:00:00Z`);
  const ratio = end === start ? 1 : Math.max(0, Math.min(1, (point - start) / (end - start)));
  return baseline + (target - baseline) * ratio;
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  scrollContent: { paddingRight: 10 },
  axisLabels: { position: 'absolute', left: PAD_X, right: PAD_X, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 18, borderTopWidth: 2, borderStyle: 'dashed' },
  tooltip: { backgroundColor: color.surfaceAlt, borderRadius: 14, padding: 12, gap: 3 },
});
