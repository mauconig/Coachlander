import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import type { DayMark } from '@/data/mock';
import { getHistory, getHistorySummary, getMonthGrid } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { dayBadge, grouped, hoursMinutes, monthName } from '@/lib/format';
import { color, radius } from '@/theme/tokens';

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const DAY_STYLE: Record<DayMark, { backgroundColor: string; borderColor?: string }> = {
  done: { backgroundColor: color.violet },
  today: { backgroundColor: color.lime },
  planned: { backgroundColor: color.raised, borderColor: color.border },
  rest: { backgroundColor: color.raised },
};

/** Splits the flat month into rows of seven so the grid stays exact. */
const toWeeks = (days: DayMark[]): DayMark[][] =>
  Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7));

/** 05 · Historial de sesiones */
export default function History() {
  const history = useQuery(getHistory);
  const summary = useQuery(getHistorySummary);
  const weeks = toWeeks(useQuery(getMonthGrid));

  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="h2">Historial</Txt>
        <Txt variant="labelTight" tone={color.lime}>
          {monthName(new Date())}
        </Txt>
      </View>

      <Card padding={18} gap={14}>
        <View style={styles.weekdays}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Txt key={i} variant="metaSm" tone={color.textFaint} style={styles.weekday}>
              {d}
            </Txt>
          ))}
        </View>

        <View style={styles.grid}>
          {weeks.map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((mark, i) => (
                <View
                  key={i}
                  style={[styles.day, DAY_STYLE[mark], mark === 'planned' && styles.dayOutlined]}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <StatTile
            bare
            compact
            value={String(summary.sessions)}
            label="SESIONES"
            style={styles.summaryTile}
          />
          <StatTile
            bare
            compact
            value={hoursMinutes(summary.totalMinutes)}
            label="TIEMPO TOTAL"
            style={styles.summaryTile}
          />
          <StatTile
            bare
            compact
            value={`${summary.completion} %`}
            label="CUMPLIDAS"
            valueTone={color.lime}
            style={styles.summaryTile}
          />
        </View>
      </Card>

      <View style={styles.list}>
        {history.map((session, i) => {
          const badge = dayBadge(session.date);
          const latest = i === 0;
          return (
            <Row
              key={session.id}
              left={
                <View style={[styles.badge, latest ? styles.badgeLatest : styles.badgeMuted]}>
                  <Txt variant="statSm" style={styles.badgeDay}>
                    {badge.day}
                  </Txt>
                  <Txt
                    variant="metaSm"
                    tone={latest ? color.text : color.textMuted}
                    style={styles.badgeMonth}
                  >
                    {badge.month}
                  </Txt>
                </View>
              }
              title={session.name}
              meta={`${session.minutes} min · ${session.sets} series · ${grouped(session.volume)} kg`}
              trailing={`${session.completion} %`}
              trailingTone={session.completion === 100 ? color.lime : color.textMuted}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  weekdays: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { gap: 7 },
  week: { flexDirection: 'row', gap: 7 },
  day: { flex: 1, height: 30, borderRadius: 9 },
  dayOutlined: { borderWidth: 1 },
  summary: {
    flexDirection: 'row',
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 14,
  },
  summaryTile: { flex: 0 },
  list: { gap: 9 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLatest: { backgroundColor: color.violet },
  badgeMuted: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
  badgeDay: { fontSize: 14, lineHeight: 16 },
  badgeMonth: { fontSize: 8, lineHeight: 11 },
});
