import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CoachStatistics } from '@/api/client';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { displayDate } from '@/lib/stats';
import { color, radius } from '@/theme/tokens';

type HeatmapItem = CoachStatistics['heatmap'][number];

type Props = {
  from: string;
  to: string;
  items: HeatmapItem[];
};

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = dateFromIso(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function CoachActivityHeatmap({ from, to, items }: Props) {
  const [selected, setSelected] = useState<HeatmapItem | null>(null);
  const itemByDate = useMemo(() => new Map(items.map((item) => [item.date, item])), [items]);
  const columns = useMemo(() => {
    const start = mondayOf(from);
    const end = dateFromIso(to);
    const result: Array<Array<{ date: string; active: boolean; item: HeatmapItem }>> = [];
    for (let cursor = new Date(start); cursor <= end || result.length === 0; cursor = addDays(cursor, 7)) {
      result.push(Array.from({ length: 7 }, (_, index) => {
        const date = isoFromDate(addDays(cursor, index));
        return {
          date,
          active: date >= from && date <= to,
          item: itemByDate.get(date) ?? { date, sessions: 0, minutes: 0 },
        };
      }));
      if (cursor.getTime() > end.getTime()) break;
    }
    return result;
  }, [from, to, itemByDate]);

  return (
    <>
      <Card padding={18} gap={12}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Txt variant="eyebrow">CALENDARIO DE ACTIVIDAD</Txt>
            <Txt variant="meta" tone={color.textMuted}>Días con entrenamientos completados</Txt>
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendCell, styles.empty]} />
            <View style={[styles.legendCell, styles.one]} />
            <View style={[styles.legendCell, styles.two]} />
            <View style={[styles.legendCell, styles.three]} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.calendar}>
            <View style={styles.calendarGrid}>
              <View style={styles.dayLabels}>
                {DAY_LABELS.map((label) => <Txt key={label} variant="metaSm" tone={color.textFaint} style={styles.weekday}>{label}</Txt>)}
              </View>
              <View style={styles.columns}>
                {columns.map((column) => (
                  <View key={column[0].date} style={styles.column}>
                    {column.map(({ date, item, active }) => (
                      <Pressable
                        key={date}
                        onPress={() => active && setSelected(item)}
                        disabled={!active}
                        accessibilityRole="button"
                        accessibilityLabel={`${displayDate(date)}: ${item.sessions} sesiones`}
                        style={[styles.cell, active ? cellTone(item.sessions) : styles.outside]}
                      >
                        {active ? <Txt variant="metaSm" tone={item.sessions ? color.ink : color.textFaint}>{date.slice(8, 10)}</Txt> : null}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </Card>
      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="ACTIVIDAD"
        title={selected ? displayDate(selected.date) : ''}
      >
        {selected ? (
          <View style={styles.sheetBody}>
            <Txt variant="h3">{selected.sessions} {selected.sessions === 1 ? 'sesión' : 'sesiones'}</Txt>
            <Txt variant="body" tone={color.textMuted}>{selected.minutes} minutos estimados completados.</Txt>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function cellTone(sessions: number) {
  if (sessions >= 3) return styles.three;
  if (sessions === 2) return styles.two;
  if (sessions === 1) return styles.one;
  return styles.empty;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, gap: 4 },
  legend: { flexDirection: 'row', gap: 4 },
  legendCell: { width: 11, height: 11, borderRadius: 3 },
  scrollContent: { paddingRight: 4 },
  calendar: { gap: 7 },
  calendarGrid: { flexDirection: 'row', gap: 6 },
  dayLabels: { gap: 5, paddingTop: 1 },
  weekday: { width: 12, height: 26, textAlign: 'center', textAlignVertical: 'center' },
  columns: { flexDirection: 'row', gap: 5 },
  column: { gap: 5 },
  cell: { width: 26, height: 26, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
  empty: { backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.hairline },
  outside: { backgroundColor: 'transparent' },
  one: { backgroundColor: color.violetSoft },
  two: { backgroundColor: color.lime },
  three: { backgroundColor: color.text },
  sheetBody: { gap: 6 },
});
