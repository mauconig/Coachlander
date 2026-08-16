import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getCoach, getRoutineSetCount, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

const PROMISES = [
  'Cargas sugeridas serie por serie',
  'Descansos cronometrados',
  'Tu overload registrado solo',
];

/** 14 · Todo listo — the hand-off into the first session. */
export default function Ready() {
  const { draft, finishOnboarding } = useApp();
  const coach = useQuery(getCoach);
  const routine = useQuery(getTodayRoutine);
  const totalSets = useQuery(getRoutineSetCount);
  const isCoach = draft.role === 'coach';
  const soloTraining = draft.soloTraining;

  const start = () => {
    finishOnboarding();
    router.replace(isCoach ? '/alumnos' : '/hoy');
  };

  return (
    <Screen contentStyle={styles.body} bottomInset>
      <View style={styles.badge}>
        <Icon name="play" size={40} tone={color.ink} />
      </View>

      <View style={styles.copy}>
        <Txt variant="hero">
          {isCoach ? 'Tu cuenta está lista' : soloTraining ? 'Bienvenido a tu primer set' : 'Tu plan está cargado'}
        </Txt>
        <Txt variant="bodyLg">
          {isCoach
            ? 'Agregá a tu primer alumno o importá una rutina que ya tengas armada.'
            : soloTraining
              ? 'Tu dashboard está listo. Cuando tengas una rutina, va a aparecer acá.'
              : `${coach.firstName} armó tu semana 1. Empezás con ${routine.name}: ${routine.exercises.length} ejercicios, ${totalSets} series, ${routine.estimatedMinutes} minutos estimados.`}
        </Txt>
      </View>

      {!isCoach && !soloTraining ? (
        <View style={styles.promises}>
          {PROMISES.map((line) => (
            <View key={line} style={styles.promise}>
              <Icon name="check" size={14} tone={color.lime} weight={2.6} />
              <Txt variant="bodyStrong">{line}</Txt>
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label={isCoach ? 'Ver mis alumnos' : soloTraining ? 'Ir a mi dashboard' : 'Ver mi primera sesión'}
        variant="violet"
        icon={!isCoach && !soloTraining ? <Icon name="play" size={16} tone={color.text} /> : undefined}
        onPress={start}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { justifyContent: 'center', gap: 26, paddingHorizontal: 24 },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: 12 },
  promises: { gap: 9 },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
});
