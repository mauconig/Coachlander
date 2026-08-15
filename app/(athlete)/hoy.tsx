import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/components/Note';
import { Row, RowIndex } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getAthlete, getRoutineSetCount, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { longDate, num, weight } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { color } from '@/theme/tokens';

/** 01 · Hoy — the athlete's home: what to train, and the play button. */
export default function Today() {
  const { unit } = useApp();
  const athlete = useQuery(getAthlete);
  const routine = useQuery(getTodayRoutine);
  const totalSets = useQuery(getRoutineSetCount);

  return (
    <Screen scroll gap={18}>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Txt variant="eyebrow">{longDate(new Date()).toUpperCase()}</Txt>
          <Txt variant="h2">{`Hola, ${athlete.firstName}`}</Txt>
        </View>
        <Avatar name={athlete.name} size={44} />
      </View>

      <Card tone="violet" radius={26} padding={22} gap={16}>
        <View style={styles.cardHead}>
          <View style={styles.weekPill}>
            <Txt variant="label" tone={color.text} numberOfLines={1}>
              {`SEMANA ${routine.week} · DÍA ${routine.day}`}
            </Txt>
          </View>
          {/* The pill keeps its full label; the byline yields space first. */}
          <Txt variant="label" tone={color.onViolet} numberOfLines={1} style={styles.byline}>
            {`POR ${routine.coach.toUpperCase()}`}
          </Txt>
        </View>

        <Txt variant="h1" style={styles.routineTitle}>
          {`${routine.block}\n${routine.name}`}
        </Txt>

        <View style={styles.stats}>
          <StatTile bare value={String(routine.estimatedMinutes)} unit="min" label="SESIÓN EST." />
          <StatTile bare value={String(routine.secondsPerSet)} unit="s" label="POR SERIE" />
          <StatTile bare value={String(routine.exercises.length)} label="EJERCICIOS" />
        </View>

        <Button
          label="Empezar sesión"
          icon={<Icon name="play" size={15} tone={color.ink} />}
          size="sm"
          onPress={() => router.push('/sesion')}
          style={styles.play}
        />
      </Card>

      <View style={styles.list}>
        <SectionHeader title="LA RUTINA DE HOY" trailing={`${totalSets} SERIES`} />

        {routine.exercises.map((exercise, i) => (
          <Row
            key={exercise.id}
            left={<RowIndex n={i + 1} />}
            title={exercise.name}
            meta={`${exercise.scheme} · ${weight(exercise.suggested, unit)}`}
            trailing={exercise.overload ? `+${num(exercise.overload)}` : '='}
            trailingTone={exercise.overload ? color.lime : color.textMuted}
            onPress={() => router.push(`/ejercicio/${exercise.id}`)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { gap: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weekPill: {
    backgroundColor: color.onVioletFill,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexShrink: 0,
  },
  byline: { flexShrink: 1 },
  routineTitle: { lineHeight: 33 },
  stats: { flexDirection: 'row', gap: 22 },
  play: { alignSelf: 'flex-start', paddingHorizontal: 22 },
  list: { gap: 9 },
});
