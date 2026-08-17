import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { useCreator } from '@/state/CreatorState';
import { color, radius } from '@/theme/tokens';

/** 23 · Revisión — resumen de la rutina antes de guardar. */
export default function CreatorReview() {
  const { routineName, days } = useCreator();

  const totalExercises = days.reduce((n, d) => n + d.exercises.length, 0);
  const totalSets = days.reduce((n, d) => n + d.exercises.reduce((s, e) => s + e.sets, 0), 0);
  const activeDays = days.filter((d) => d.exercises.length > 0);

  return (
    <Screen scroll gap={14}>
      <TopBar
        title="REVISAR"
        right={
          <Pressable
            onPress={() => router.push('/crear/asignar')}
            accessibilityRole="button"
            style={styles.continue}
          >
            <Txt variant="labelTight" tone={color.ink}>
              CONTINUAR
            </Txt>
            <Icon name="chevron-right" size={13} tone={color.ink} />
          </Pressable>
        }
      />

      <Card tone="violet" radius={radius.xxl} padding={18} gap={10}>
        <Txt variant="label" tone={color.onViolet}>
          RUTINA CREADA
        </Txt>
        <Txt variant="h3">{routineName.trim() || 'Rutina sin nombre'}</Txt>
        <Txt variant="body" tone={color.onVioletStrong}>
          {`${activeDays.length} días · ${totalExercises} ejercicios · ${totalSets} series`}
        </Txt>
      </Card>

      <View style={styles.list}>
        {days.map((day) => {
          if (!day.exercises.length) return null;
          return (
            <Fragment key={day.day}>
              <Txt variant="label" tone={color.lime} style={styles.dayLabel}>
                {`DÍA ${day.day} · ${day.name.toUpperCase()}`}
              </Txt>
              {day.exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseWrap}>
                  <Row
                    left={<Icon name="check" size={13} tone={color.lime} weight={2.6} />}
                    title={exercise.name}
                    meta={`${exercise.sets} × ${exercise.reps} · ${exercise.loadKg === null ? 'PC' : `${exercise.loadKg} kg`}`}
                  />
                  {exercise.note.trim() ? (
                    <Txt variant="meta" tone={color.textFaint} style={styles.note}>
                      {exercise.note.trim()}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </Fragment>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: color.lime,
  },
  list: { gap: 9 },
  dayLabel: { paddingTop: 10 },
  exerciseWrap: { gap: 4 },
  note: { paddingLeft: 28, paddingRight: 8 },
});