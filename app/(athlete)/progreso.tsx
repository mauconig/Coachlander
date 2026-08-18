import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  getOverloadRows,
  getProgressExercises,
  getProgressSummary,
  getRecentSetLogs,
  getWeeklyVolume,
} from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { num } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

const RANGES = ['6 SEMANAS', '3 MESES', 'TODO'] as const;
type Range = (typeof RANGES)[number];

/** Progressive overload: one logical exercise, current snapshot and audit trail. */
export default function Progress() {
  const { unit } = useApp();
  const [range, setRange] = useState<Range>('6 SEMANAS');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const exercises = useQuery(getProgressExercises);
  const exerciseId = selectedId ?? exercises[0]?.id ?? '';
  const exercise = exercises.find((item) => item.id === exerciseId) ?? exercises[0];
  const overloadRows = useQuery((db) => getOverloadRows(db, exerciseId), [exerciseId]);
  const weeklyVolume = useQuery(getWeeklyVolume);
  const summary = useQuery(getProgressSummary);
  const logged = useQuery((db) => getRecentSetLogs(db, exerciseId, 4), [exerciseId]);

  if (!exercise) {
    return (
      <Screen scroll gap={16}>
        <View style={styles.heading}>
          <Txt variant="eyebrow">PROGRESO</Txt>
          <Txt variant="h2">Todavía no hay progreso</Txt>
        </View>
        <View style={styles.emptyState}>
          <Txt variant="bodyLg" tone={color.textMuted} center>
            Cuando tengas una rutina y registres tu primer set, tus avances van a aparecer acá.
          </Txt>
        </View>
      </Screen>
    );
  }

  const isLoadMetric = exercise.progressionMetric === 'load';
  const latestRow = overloadRows[overloadRows.length - 1];
  const peak = Math.max(...weeklyVolume, 1);
  const topValue = isLoadMetric ? num(exercise.suggested || summary.topLoad) : String(latestRow?.nextReps ?? exercise.targetReps);

  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">PROGRESO</Txt>
        <Txt variant="h2">{exercise.name}</Txt>
      </View>

      <View collapsable={false} style={styles.switcherViewport}>
        <ScrollView
          horizontal
          style={styles.switcherScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcher}
        >
          {exercises.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              mono={false}
              selected={item.id === exerciseId}
              tone="violet"
              onPress={() => setSelectedId(item.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ChipGroup options={RANGES} value={range} onChange={setRange} />

      <Card tone="violet" padding={18} style={styles.top}>
        <View style={styles.topLeft}>
          <Txt variant="label" tone={color.onViolet}>
            {isLoadMetric ? 'PRÓXIMA CARGA' : exercise.progressionMetric === 'seconds' ? 'PRÓXIMO OBJETIVO' : 'PRÓXIMAS REPS'}
          </Txt>
          <Txt variant="hero" style={styles.topValue}>
            {topValue}
            <Txt variant="h5">{isLoadMetric ? ` ${unit}` : exercise.progressionMetric === 'seconds' ? ' s' : ' reps'}</Txt>
          </Txt>
        </View>
        <View style={styles.topRight}>
          <Txt variant="label" tone={color.onViolet}>{summary.windowLabel}</Txt>
          <Txt variant="h4" tone={color.lime}>{summary.growth}</Txt>
        </View>
      </Card>

      <Card tone="muted" padding={16} gap={6}>
        <View style={styles.auditHeader}>
          <Txt variant="eyebrow">ORIGEN DE LA RECOMENDACIÓN</Txt>
          <Txt variant="labelTight" tone={exercise.loadSource === 'ai' ? color.violet : color.lime}>
            {exercise.loadSource === 'ai' ? 'IA' : 'ENTRENADOR'}
          </Txt>
        </View>
        <Txt variant="bodyStrong">{exercise.loadReason || 'Carga definida en el plan.'}</Txt>
        <Txt variant="meta" tone={color.textMuted}>
          {isLoadMetric ? 'La próxima carga se calcula con la última sesión completada.' : 'El objetivo progresa en repeticiones o segundos, no en kilos.'}
        </Txt>
      </Card>

      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHead]}>
          <Txt variant="metaSm" style={styles.colSet}>SERIE</Txt>
          <Txt variant="metaSm" style={styles.colFlex}>ÚLTIMA</Txt>
          <Txt variant="metaSm" style={styles.colFlex}>PRÓXIMA</Txt>
          <Txt variant="metaSm" style={styles.colDelta}>Δ</Txt>
        </View>

        {overloadRows.length === 0 ? (
          <View style={styles.tableRow}>
            <Txt variant="meta" tone={color.textFaint}>Todavía no hay historial de este ejercicio.</Txt>
          </View>
        ) : null}

        {overloadRows.map((row, index) => {
          const delta = isLoadMetric ? row.nextLoad - row.lastLoad : row.nextReps - row.lastReps;
          const lastLabel = isLoadMetric
            ? `${num(row.lastLoad)} ${unit} × ${row.lastReps}`
            : `${row.lastReps}${exercise.progressionMetric === 'seconds' ? ' s' : ' reps'}`;
          const nextLabel = isLoadMetric
            ? `${num(row.nextLoad)} ${unit} × ${row.nextReps}`
            : `${row.nextReps}${exercise.progressionMetric === 'seconds' ? ' s' : ' reps'}`;
          return (
            <View key={row.set} style={[styles.tableRow, index < overloadRows.length - 1 && styles.tableDivider]}>
              <Txt variant="labelTight" tone={color.violet} style={styles.colSet}>{String(row.set).padStart(2, '0')}</Txt>
              <Txt variant="bodyStrong" tone={color.textMuted} style={styles.colFlex}>{lastLabel}</Txt>
              <Txt variant="bodyStrong" style={styles.colFlex}>{nextLabel}</Txt>
              <Txt variant="labelTight" tone={delta > 0 ? color.lime : color.textMuted} style={[styles.colDelta, styles.deltaText]}>
                {delta > 0 ? `+${isLoadMetric ? num(delta) : delta}` : '='}
              </Txt>
            </View>
          );
        })}
      </View>

      <Card padding={18} gap={8}>
        <Txt variant="eyebrow">{`VOLUMEN POR SEMANA · ${unit.toUpperCase()}`}</Txt>
        <View style={styles.chart}>
          {weeklyVolume.map((value, index) => {
            const last = index === weeklyVolume.length - 1;
            const recent = index >= weeklyVolume.length - 3;
            return <View key={index} style={[styles.bar, { height: `${Math.round((value / peak) * 100)}%`, backgroundColor: last ? color.lime : recent ? color.violet : color.border }]} />;
          })}
        </View>
        <View style={styles.chartAxis}>
          {weeklyVolume.map((_, index) => <Txt key={index} variant="metaSm" tone={color.textFaint}>{`S${index + 1}`}</Txt>)}
        </View>
      </Card>

      {logged.length ? (
        <Card tone="muted" padding={18} gap={10}>
          <Txt variant="eyebrow">REGISTRADO EN ESTE TELÉFONO</Txt>
          {logged.map((entry) => (
            <View key={entry.id} style={styles.logRow}>
              <Txt variant="labelTight" tone={color.violet}>{`SERIE ${entry.setIndex + 1}`}</Txt>
              <Txt variant="bodyStrong">{`${entry.load ? `${num(entry.load)} ${unit}` : 'peso corporal'} × ${entry.reps}`}</Txt>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 4 },
  switcherViewport: { height: 37, minHeight: 37, maxHeight: 37, overflow: 'hidden' },
  switcherScroll: { height: 37, minHeight: 37, maxHeight: 37, flexGrow: 0, flexShrink: 0 },
  switcher: { height: 37, gap: 8, paddingRight: 8, alignItems: 'flex-start' },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  topLeft: { gap: 3 },
  topValue: { fontSize: 40, lineHeight: 40 },
  topRight: { alignItems: 'flex-end', gap: 3 },
  auditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  table: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.xxl, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 16 },
  tableHead: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.border },
  tableDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  colSet: { width: 40 },
  colFlex: { flex: 1 },
  colDelta: { width: 54 },
  deltaText: { textAlign: 'right' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 92 },
  bar: { flex: 1, borderRadius: 6, minHeight: 6 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
