import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { selectCurrentRoutine } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/components/Note';
import { Row, RowIndex } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getAthlete, getRoutineOptions, getRoutineSetCount, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { longDate, num, weight } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useRemoteData, useRefreshRemoteData } from '@/state/RemoteState';
import { color } from '@/theme/tokens';

/** 01 · Hoy — the athlete's home: what to train, and the play button. */
export default function Today() {
  const { getToken } = useAuth();
  const { unit, draft } = useApp();
  const remoteData = useRemoteData();
  const refreshRemoteData = useRefreshRemoteData();
  const athlete = useQuery(getAthlete);
  const routine = useQuery(getTodayRoutine);
  const routineOptions = useQuery(getRoutineOptions);
  const totalSets = useQuery(getRoutineSetCount);
  const [selectingRoutineId, setSelectingRoutineId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const isAdmin = remoteData.user?.isAdmin === true;

  const chooseRoutine = async (routineId: string) => {
    if (routineId === routine.id || selectingRoutineId) return;
    setSelectingRoutineId(routineId);
    setSelectionError('');
    try {
      await selectCurrentRoutine(getToken, routineId);
      await refreshRemoteData({ force: true });
    } catch (error: unknown) {
      setSelectionError(error instanceof Error ? error.message : 'No pudimos seleccionar la rutina.');
    } finally {
      setSelectingRoutineId(null);
    }
  };

  if (!routine.id) {
    const waitingForCoach = remoteData.user?.role === 'athlete' && !remoteData.user?.soloTraining;
    return (
      <Screen scroll gap={18}>
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Txt variant="eyebrow">{longDate(new Date()).toUpperCase()}</Txt>
            <Txt variant="h2">{athlete.firstName ? `Hola, ${athlete.firstName}` : 'Hola'}</Txt>
          </View>
          <Avatar name={athlete.name} size={44} />
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon name="play" size={24} tone={color.ink} />
          </View>
          <Txt variant="h1">{waitingForCoach ? 'Esperando tu plan' : 'Tu dashboard está vacío'}</Txt>
          <Txt variant="bodyLg" tone={color.textMuted} center>
            {waitingForCoach
              ? 'Tu entrenador va a asignarte una rutina para esta semana.'
              : 'Cuando tengas una rutina disponible, va a aparecer acá.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll gap={18}>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Txt variant="eyebrow">{longDate(new Date()).toUpperCase()}</Txt>
            <Txt variant="h2">{athlete.firstName ? `Hola, ${athlete.firstName}` : 'Hola'}</Txt>
        </View>
        <Avatar name={athlete.name} size={44} />
      </View>

      {(isAdmin || remoteData.user?.soloTraining) && routineOptions.length > 1 ? (
        <View style={styles.library}>
          <SectionHeader title="ELEGÍ TU RUTINA" trailing={`${routineOptions.length} DÍAS`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.libraryScroll}
          >
            {routineOptions.map((option) => {
              const selected = option.id === routine.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Día ${option.day}, ${option.name}`}
                  disabled={!!selectingRoutineId}
                  onPress={() => void chooseRoutine(option.id)}
                  style={({ pressed }) => [
                    styles.routineOption,
                    selected && styles.routineOptionSelected,
                    pressed && styles.optionPressed,
                    selectingRoutineId === option.id && styles.optionLoading,
                  ]}
                >
                  <Txt variant="label" tone={selected ? color.onViolet : color.lime}>
                    {`DÍA ${option.day}`}
                  </Txt>
                  <Txt
                    variant="rowTitle"
                    tone={selected ? color.text : color.textSoft}
                    numberOfLines={2}
                    style={styles.optionName}
                  >
                    {option.name}
                  </Txt>
                  <View style={styles.optionFooter}>
                    <Txt variant="meta" tone={selected ? color.onViolet : color.textMuted}>
                      {`${option.exerciseCount} ${option.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}`}
                    </Txt>
                    {selectingRoutineId === option.id ? (
                      <ActivityIndicator size="small" color={color.lime} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          {selectionError ? <Txt variant="meta" tone={color.textSoft}>{selectionError}</Txt> : null}
        </View>
      ) : null}

      <Card testID="today-routine-card" tone="violet" radius={26} padding={22} gap={16}>
        <View style={styles.cardHead}>
          <View style={styles.weekPill}>
            <Txt variant="label" tone={color.text} numberOfLines={1}>
              {`SEMANA ${routine.week} · DÍA ${routine.day}`}
            </Txt>
          </View>
          {/* The pill keeps its full label; the byline yields space first. */}
          {!draft.soloTraining && routine.coach ? (
            <Txt variant="label" tone={color.onViolet} numberOfLines={1} style={styles.byline}>
              {`POR ${routine.coach.toUpperCase()}`}
            </Txt>
          ) : null}
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
          testID="today-start-session"
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
            key={`${exercise.id}-${i}`}
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
  library: { gap: 9 },
  libraryScroll: { gap: 9, paddingRight: 24 },
  routineOption: {
    width: 190,
    minHeight: 126,
    justifyContent: 'space-between',
    gap: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  routineOptionSelected: { backgroundColor: color.violet, borderColor: color.lime },
  optionName: { flex: 1 },
  optionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  optionPressed: { opacity: 0.82 },
  optionLoading: { opacity: 0.55 },
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
  emptyState: {
    flex: 1,
    minHeight: 440,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
});
