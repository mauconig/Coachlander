import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import type { CoachHeatmapItem, CoachWeeklyActivity } from '@/api/client';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { displayMonth } from '@/lib/stats';
import { color, radius } from '@/theme/tokens';

type Props = {
  month: string;
  activityItems: CoachHeatmapItem[];
  weeklyAverages: CoachWeeklyActivity[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onMonthChange: (offset: number) => void;
};

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayOf(date: Date) {
  const day = date.getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

function monthDates(month: string) {
  const [yearValue, monthValue] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const monthEnd = new Date(Date.UTC(yearValue, monthValue, 0));
  const weeks: Date[][] = [];
  for (let cursor = mondayOf(monthStart); cursor <= monthEnd; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)));
  }
  return { monthValue, weeks };
}

function formatWeekly(value: number) {
  return `${String(Math.round(value * 10) / 10).replace('.', ',')}/sem`;
}

export function CoachHistoryCalendar({ month, activityItems, weeklyAverages, selectedDate, onSelectDate, onMonthChange }: Props) {
  const { monthValue, weeks } = useMemo(() => monthDates(month), [month]);
  const activityByDate = useMemo(() => new Map(activityItems.map((item) => [item.date, item])), [activityItems]);
  const weeksByStart = useMemo(() => new Map(weeklyAverages.map((week) => [week.start, week])), [weeklyAverages]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 48) return;
      onMonthChange(gesture.dx < 0 ? 1 : -1);
    },
  }), [onMonthChange]);

  return (
    <View {...responder.panHandlers}>
      <Card padding={16} gap={12}>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => onMonthChange(-1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Mes anterior">
            <Icon name="chevron-left" size={19} tone={color.textMuted} />
          </Pressable>
          <View style={styles.monthTitle}>
            <Txt variant="eyebrow">HISTORIAL MENSUAL</Txt>
            <Txt variant="h4">{displayMonth(month)}</Txt>
          </View>
          <Pressable onPress={() => onMonthChange(1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Mes siguiente">
            <Icon name="chevron-right" size={19} tone={color.textMuted} />
          </Pressable>
        </View>

        <View style={styles.dayHeader}>
          <View style={styles.daysHeader}>
            {DAY_LABELS.map((label) => <Txt key={label} variant="metaSm" tone={color.textFaint} style={styles.dayLabel}>{label}</Txt>)}
          </View>
          <Txt variant="metaSm" tone={color.textFaint} style={styles.weekLabel}>PROM.</Txt>
        </View>

        <View style={styles.weeks}>
          {weeks.map((week) => {
            const weekStart = isoDate(week[0]);
            const average = weeksByStart.get(weekStart);
            return (
              <View key={weekStart} style={styles.weekRow}>
                <View style={styles.daysRow}>
                  {week.map((date) => {
                    const value = isoDate(date);
                    const inMonth = date.getUTCMonth() === monthValue - 1;
                    const activity = activityByDate.get(value);
                    const count = activity?.sessions ?? 0;
                    return (
                      <Pressable
                        key={value}
                        disabled={!inMonth}
                        onPress={() => onSelectDate(value)}
                        accessibilityRole="button"
                        accessibilityLabel={`${value}: ${count} entrenamientos`}
                        style={[styles.dayCell, !inMonth && styles.outside, inMonth && dayTone(count), selectedDate === value && styles.selected]}
                      >
                        {inMonth ? (
                          <>
                            <Txt variant="metaSm" tone={count ? color.ink : color.textMuted}>{date.getUTCDate()}</Txt>
                            {count ? <Txt variant="metaSm" tone={color.ink}>{count}</Txt> : null}
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.weekAverage}>
                  <Txt variant="metaSm" tone={color.textSoft}>{average ? formatWeekly(average.normalizedSessions) : '0/sem'}</Txt>
                </View>
              </View>
            );
          })}
        </View>
        <Txt variant="metaSm" tone={color.textFaint}>Deslizá o usá las flechas para cambiar de mes.</Txt>
      </Card>
    </View>
  );
}

function dayTone(count: number) {
  if (count >= 3) return styles.dayThree;
  if (count === 2) return styles.dayTwo;
  if (count === 1) return styles.dayOne;
  return styles.dayEmpty;
}

const styles = StyleSheet.create({
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthTitle: { flex: 1, alignItems: 'center', gap: 3 },
  arrow: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  daysHeader: { flex: 1, flexDirection: 'row', gap: 4 },
  dayLabel: { flex: 1, textAlign: 'center' },
  weekLabel: { width: 55, textAlign: 'center' },
  weeks: { gap: 5 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  daysRow: { flex: 1, flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, height: 40, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center', gap: 1 },
  outside: { backgroundColor: 'transparent' },
  dayEmpty: { backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.hairline },
  dayOne: { backgroundColor: color.violetSoft },
  dayTwo: { backgroundColor: color.lime },
  dayThree: { backgroundColor: color.text },
  selected: { borderWidth: 2, borderColor: color.text },
  weekAverage: { width: 55, alignItems: 'center' },
});
