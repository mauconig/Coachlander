import { ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { getAthleteHistoryDetail } from '@/db/queries';
import type { SessionRecord } from '@/data/types';
import { useQuery } from '@/db/useQuery';
import { displayDate } from '@/lib/stats';
import { weight } from '@/lib/format';
import { color } from '@/theme/tokens';

type Props = {
  visible: boolean;
  session: SessionRecord | null;
  unit: 'kg' | 'lb';
  onClose: () => void;
};

export function AthleteHistoryDetailSheet({ visible, session, unit, onClose }: Props) {
  const detail = useQuery(
    (data) => session ? getAthleteHistoryDetail(data, session.id) : null,
    [session?.id],
  );
  const title = detail?.name ?? session?.name ?? 'Entrenamiento';

  return (
    <Sheet
      visible={visible && !!session}
      onClose={onClose}
      bare
      swipeToDismiss
      eyebrow={detail?.status === 'partial' ? 'ENTRENAMIENTO PARCIAL' : 'ENTRENAMIENTO COMPLETADO'}
      title={title}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {session ? (
          <View style={styles.summary}>
            <Txt variant="meta">{displayDate(detail?.date ?? dateKey(session.date))}</Txt>
            <Txt variant="meta" tone={color.textMuted}>
              {detail?.status === 'partial' ? 'Se guardaron las series realizadas' : `${detail?.minutes ?? session.minutes} min estimados`}
            </Txt>
          </View>
        ) : null}

        {detail?.exercises.length ? detail.exercises.map((exercise, index) => (
          <View key={`${exercise.id}-${index}`} style={styles.exercise}>
            <View style={styles.exerciseHeader}>
              <View style={styles.exerciseTitle}>
                <Txt variant="h5" numberOfLines={2}>{`${index + 1}. ${exercise.name}`}</Txt>
                <Txt variant="meta" tone={color.textFaint}>{exercise.scheme}</Txt>
                <Txt variant="metaSm" tone={exercise.loadSource === 'ai' ? color.violet : color.textMuted} numberOfLines={2}>
                  {`${exercise.loadSource === 'ai' ? 'IA' : 'ENTRENADOR'} · ${exercise.loadReason || 'Carga definida en el plan.'}`}
                </Txt>
              </View>
              <Txt variant="labelTight" tone={color.textMuted}>
                {`${exercise.sets.length}/${exercise.plannedSets} SERIES`}
              </Txt>
            </View>

            {exercise.sets.length ? exercise.sets.map((set) => (
              <View key={`${exercise.id}-${index}-${set.setIndex}`} style={styles.setRow}>
                <Txt variant="labelTight" tone={color.textFaint}>{`SERIE ${set.setIndex}`}</Txt>
                <Txt variant="bodyStrong">{`${weight(set.load, unit)} · ${set.reps} reps`}</Txt>
              </View>
            )) : (
              <Txt variant="body" tone={color.textMuted}>No registraste series para este ejercicio.</Txt>
            )}
          </View>
        )) : (
          <View style={styles.empty}>
            <Txt variant="body" tone={color.textMuted}>No encontramos los ejercicios de esta rutina.</Txt>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 590 },
  content: { gap: 16, paddingBottom: 4 },
  summary: { gap: 3 },
  exercise: {
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  exerciseTitle: { flex: 1, gap: 3 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 24 },
});
