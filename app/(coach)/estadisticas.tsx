import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getClients, getHistory, getMetaNumber, getWeeklyVolume } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { dayBadge, grouped, hoursMinutes } from '@/lib/format';
import { color } from '@/theme/tokens';

/** 08 · Estadísticas del entrenador — alumnos, actividad y volumen semanal. */
export default function Stats() {
  const clients = useQuery(getClients);
  const clientCount = useQuery((db) => getMetaNumber(db, 'client_count'));
  const liveCount = useQuery((db) => getClients(db).filter((client) => client.live).length);
  const sessions = useQuery((db) => getMetaNumber(db, 'history_sessions'));
  const totalMinutes = useQuery((db) => getMetaNumber(db, 'history_minutes'));
  const completion = useQuery((db) => getMetaNumber(db, 'history_completion'));
  const weeklyVolume = useQuery(getWeeklyVolume);
  const history = useQuery(getHistory);

  const peak = Math.max(...weeklyVolume, 1);

  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">MODO ENTRENADOR</Txt>
        <Txt variant="h2">Estadísticas</Txt>
      </View>

      <View style={styles.grid}>
        <StatTile value={String(clientCount)} label="ALUMNOS" valueTone={color.lime} />
        <StatTile value={String(liveCount)} label="ENTRENANDO HOY" />
      </View>

      <View style={styles.grid}>
        <StatTile value={String(sessions)} label="SESIONES" valueTone={color.lime} />
        <StatTile value={hoursMinutes(totalMinutes)} label="TIEMPO TOTAL" />
        <StatTile value={`${completion} %`} label="CUMPLIDAS" />
      </View>

      <Card padding={18} gap={8}>
        <Txt variant="eyebrow">VOLUMEN POR SEMANA · KG</Txt>
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

      <View style={styles.list}>
        <Txt variant="eyebrow">ÚLTIMAS SESIONES</Txt>
        {history.slice(0, 5).map((session, i) => {
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
                  <Txt variant="metaSm" tone={latest ? color.text : color.textMuted} style={styles.badgeMonth}>
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
  heading: { gap: 3 },
  grid: { flexDirection: 'row', gap: 9 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 92 },
  bar: { flex: 1, borderRadius: 6, minHeight: 6 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  list: { gap: 9 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLatest: { backgroundColor: color.violet },
  badgeMuted: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
  badgeDay: { fontSize: 14, lineHeight: 16 },
  badgeMonth: { fontSize: 8, lineHeight: 11 },
});