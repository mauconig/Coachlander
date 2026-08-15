import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  getExercises,
  getOverloadRows,
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

/** 04 · Progressive overload — last vs. suggested load, set by set. */
export default function Progress() {
  const { unit } = useApp();
  const [range, setRange] = useState<Range>('6 SEMANAS');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const exercises = useQuery(getExercises);
  const exerciseId = selectedId ?? exercises[0]?.id ?? '';
  const exercise = exercises.find((e) => e.id === exerciseId) ?? exercises[0];

  const overloadRows = useQuery((db) => getOverloadRows(db, exerciseId), [exerciseId]);
  const weeklyVolume = useQuery(getWeeklyVolume);
  const summary = useQuery(getProgressSummary);
  // Sets logged on this device during a live session.
  const logged = useQuery((db) => getRecentSetLogs(db, exerciseId, 4), [exerciseId]);

  const peak = Math.max(...weeklyVolume, 1);

  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">PROGRESO</Txt>
        <Txt variant="h2">{exercise.name}</Txt>
      </View>

      {/* The design charts a single exercise; the tab needs a way to switch. */}
      <View collapsable={false} style={styles.switcherViewport}>
        <ScrollView
          horizontal
          style={styles.switcherScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcher}
        >
          {exercises.map((e) => (
            <Chip
              key={e.id}
              label={e.name}
              mono={false}
              selected={e.id === exerciseId}
              tone="violet"
              onPress={() => setSelectedId(e.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ChipGroup options={RANGES} value={range} onChange={setRange} />

      <Card tone="violet" padding={18} style={styles.top}>
        <View style={styles.topLeft}>
          <Txt variant="label" tone={color.onViolet}>
            CARGA TOPE HOY
          </Txt>
          <Txt variant="hero" style={styles.topValue}>
            {num(exercise.suggested || summary.topLoad)}
            <Txt variant="h5">{` ${unit}`}</Txt>
          </Txt>
        </View>
        <View style={styles.topRight}>
          <Txt variant="label" tone={color.onViolet}>
            {summary.windowLabel}
          </Txt>
          <Txt variant="h4" tone={color.lime}>
            {summary.growth}
          </Txt>
        </View>
      </Card>

      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHead]}>
          <Txt variant="metaSm" style={styles.colSet}>SERIE</Txt>
          <Txt variant="metaSm" style={styles.colFlex}>ÚLTIMA</Txt>
          <Txt variant="metaSm" style={styles.colFlex}>SUGERIDA</Txt>
          <Txt variant="metaSm" style={styles.colDelta}>Δ</Txt>
        </View>

        {overloadRows.length === 0 ? (
          <View style={styles.tableRow}>
            <Txt variant="meta" tone={color.textFaint}>
              Todavía no hay historial de este ejercicio.
            </Txt>
          </View>
        ) : null}

        {overloadRows.map((row, i) => {
          const delta = row.nextLoad - row.lastLoad;
          return (
            <View
              key={row.set}
              style={[styles.tableRow, i < overloadRows.length - 1 && styles.tableDivider]}
            >
              <Txt variant="labelTight" tone={color.violet} style={styles.colSet}>
                {String(row.set).padStart(2, '0')}
              </Txt>
              <Txt variant="bodyStrong" tone={color.textMuted} style={styles.colFlex}>
                {`${num(row.lastLoad)} × ${row.lastReps}`}
              </Txt>
              <Txt variant="bodyStrong" style={styles.colFlex}>
                {`${num(row.nextLoad)} × ${row.nextReps}`}
              </Txt>
              <Txt
                variant="labelTight"
                tone={delta > 0 ? color.lime : color.textMuted}
                style={[styles.colDelta, styles.deltaText]}
              >
                {delta > 0 ? `+${num(delta)}` : '='}
              </Txt>
            </View>
          );
        })}
      </View>

      <Card padding={18} gap={8}>
        <Txt variant="eyebrow">{`VOLUMEN POR SEMANA · ${unit.toUpperCase()}`}</Txt>
        <View style={styles.chart}>
          {weeklyVolume.map((v, i) => {
            const last = i === weeklyVolume.length - 1;
            const recent = i >= weeklyVolume.length - 3;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: `${Math.round((v / peak) * 100)}%`,
                    backgroundColor: last ? color.lime : recent ? color.violet : color.border,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.chartAxis}>
          {weeklyVolume.map((_, i) => (
            <Txt key={i} variant="metaSm" tone={color.textFaint}>
              {`S${i + 1}`}
            </Txt>
          ))}
        </View>
      </Card>

      {/* Written by the live session player — proof the log is persisting. */}
      {logged.length ? (
        <Card tone="muted" padding={18} gap={10}>
          <Txt variant="eyebrow">REGISTRADO EN ESTE TELÉFONO</Txt>
          {logged.map((entry) => (
            <View key={entry.id} style={styles.logRow}>
              <Txt variant="labelTight" tone={color.violet}>
                {`SERIE ${entry.setIndex + 1}`}
              </Txt>
              <Txt variant="bodyStrong">
                {`${entry.load ? `${num(entry.load)} ${unit}` : 'peso corporal'} × ${entry.reps}`}
              </Txt>
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
  // Horizontal ScrollView content stretches children on its cross-axis by
  // default. Keep exercise chips at their intrinsic pill height when the
  // selected state changes.
  switcher: { height: 37, gap: 8, paddingRight: 8, alignItems: 'flex-start' },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  topLeft: { gap: 3 },
  topValue: { fontSize: 40, lineHeight: 40 },
  topRight: { alignItems: 'flex-end', gap: 3 },

  table: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xxl,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
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
});
