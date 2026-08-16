import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Heading } from '@/components/Note';
import { StepProgress } from '@/components/Progress';
import { Screen } from '@/components/Screen';
import { RoleSkeletonScreen } from '@/components/Skeleton';
import { RadioDot } from '@/components/Toggle';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import type { Role } from '@/data/types';
import { useApp } from '@/state/AppState';
import { color } from '@/theme/tokens';

const CHOICES: { role: Role; eyebrow: string; title: string; blurb: string }[] = [
  {
    role: 'athlete',
    eyebrow: 'ENTRENO',
    title: 'Soy alumno',
    blurb: 'Sigo el plan que me carga mi entrenador y registro mis series.',
  },
  {
    role: 'coach',
    eyebrow: 'ENTRENO A OTROS',
    title: 'Soy entrenador',
    blurb: 'Armo rutinas, sigo el progreso de mis alumnos y ajusto cargas.',
  },
];

/** 11 · ¿Alumno o entrenador? — step 1 of 3 */
export default function RolePicker() {
  const { draft, patchDraft, remoteStatus, retryRemoteData } = useApp();

  if (remoteStatus === 'error') {
    return (
      <AppLoadingScreen
        error
        title="No pudimos preparar tu cuenta"
        detail="Revisá tu conexión e intentá de nuevo."
        actionLabel="Reintentar"
        onAction={() => void retryRemoteData()}
      />
    );
  }

  if (remoteStatus !== 'ready') {
    return <RoleSkeletonScreen />;
  }

  const next = () => router.push(draft.role === 'coach' ? '/datos' : '/codigo');

  return (
    <Screen scroll gap={22}>
      <View style={styles.stepper}>
        <BackButton />
        <StepProgress step={1} total={3} />
      </View>

      <Heading title="¿Cómo vas a usar Coachlander?" subtitle="Podés cambiarlo después desde tu perfil." />

      <View style={styles.choices}>
        {CHOICES.map((choice) => {
          const selected = draft.role === choice.role;
          return (
            <Card
              key={choice.role}
              tone={selected ? 'violet' : 'surface'}
              radius={26}
              padding={22}
              gap={10}
              onPress={() => patchDraft({ role: choice.role })}
            >
              <View style={styles.cardHead}>
                <Txt variant="label" tone={selected ? color.onViolet : color.textMuted}>
                  {choice.eyebrow}
                </Txt>
                <RadioDot selected={selected} size={22} />
              </View>
              <Txt variant="h3" style={styles.cardTitle}>
                {choice.title}
              </Txt>
              <Txt variant="body" tone={selected ? color.onVioletStrong : color.textMuted}>
                {choice.blurb}
              </Txt>
            </Card>
          );
        })}
      </View>

      <Button label="Continuar" onPress={next} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choices: { gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 27 },
  cta: { marginTop: 'auto' },
});
