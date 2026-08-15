import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip, ChipGroup } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Heading } from '@/components/Note';
import { StepProgress } from '@/components/Progress';
import { Screen } from '@/components/Screen';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getCoach } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp, type Experience, type TrainingPlace } from '@/state/AppState';
import { radius } from '@/theme/tokens';

const EXPERIENCE: readonly Experience[] = ['Empiezo', '1-3 años', '+3 años'] as const;
const DAYS = [2, 3, 4, 5, 6];
const PLACES: readonly TrainingPlace[] = ['Gimnasio completo', 'Casa', 'Aire libre'] as const;

/** 13 · Tus datos — step 3 of 3 */
export default function ProfileSetup() {
  const { draft, patchDraft } = useApp();
  const coach = useQuery(getCoach);
  const connected = !draft.soloTraining && !!draft.coachName;

  return (
    <Screen scroll gap={20}>
      <View style={styles.stepper}>
        <BackButton />
        <StepProgress step={3} total={3} />
      </View>

      <Heading
        title={connected ? `Contale a ${coach.firstName} de vos` : 'Contanos de vos'}
        subtitle={connected ? 'Con esto arma tu primera semana.' : 'Con esto armamos tu primera semana.'}
      />

      <View style={styles.group}>
        <Txt variant="label">EXPERIENCIA</Txt>
        <ChipGroup
          options={EXPERIENCE}
          value={draft.experience}
          onChange={(experience) => patchDraft({ experience })}
          mono={false}
          fill
        />
      </View>

      <View style={styles.group}>
        <Txt variant="label">DÍAS POR SEMANA</Txt>
        <View style={styles.days}>
          {DAYS.map((d) => (
            <Chip
              key={d}
              label={String(d)}
              selected={draft.daysPerWeek === d}
              tone="violet"
              onPress={() => patchDraft({ daysPerWeek: d })}
              style={styles.day}
            />
          ))}
        </View>
      </View>

      <View style={styles.measures}>
        <Field
          label="PESO"
          value={draft.weightKg}
          onChangeText={(weightKg) => patchDraft({ weightKg })}
          keyboardType="decimal-pad"
          suffix="kg"
          style={styles.measure}
        />
        <Field
          label="ALTURA"
          value={draft.heightM}
          onChangeText={(heightM) => patchDraft({ heightM })}
          keyboardType="decimal-pad"
          suffix="m"
          style={styles.measure}
        />
      </View>

      <View style={styles.group}>
        <Txt variant="label">DÓNDE ENTRENÁS</Txt>
        <ChipGroup
          options={PLACES}
          value={draft.place}
          onChange={(place) => patchDraft({ place })}
          mono={false}
        />
      </View>

      <Button
        label={connected ? `Listo, mandar a ${coach.firstName}` : 'Listo, armar mi semana'}
        onPress={() => router.push('/listo')}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  group: { gap: 9 },
  days: { flexDirection: 'row', gap: 8 },
  day: { flex: 1, borderRadius: radius.xs, paddingVertical: 14 },
  measures: { flexDirection: 'row', gap: 9 },
  measure: { flex: 1 },
  cta: { marginTop: 'auto' },
});
