import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  getCoachStatisticsHistoryDetail,
  type CoachHistoryDetail,
  type CoachHistorySession,
  type TokenProvider,
} from '@/api/client';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { displayDate } from '@/lib/stats';
import { weight } from '@/lib/format';
import { color } from '@/theme/tokens';

type Props = {
  visible: boolean;
  session: CoachHistorySession | null;
  tokenProvider: TokenProvider;
  onClose: () => void;
};

export function CoachHistoryDetailSheet({ visible, session, tokenProvider, onClose }: Props) {
  const tokenProviderRef = useRef(tokenProvider);
  tokenProviderRef.current = tokenProvider;
  const [detail, setDetail] = useState<CoachHistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!visible || !session) {
      setDetail(null);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    void getCoachStatisticsHistoryDetail(() => tokenProviderRef.current(), session.id)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar el detalle.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [retry, session?.id, visible]);

  const title = detail?.name ?? session?.name ?? 'Entrenamiento';

  return (
    <Sheet visible={visible && !!session} onClose={onClose} bare eyebrow={session?.status === 'partial' ? 'ENTRENAMIENTO PARCIAL' : 'ENTRENAMIENTO COMPLETADO'} title={title}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {session ? (
          <View style={styles.summary}>
            <Txt variant="bodyStrong">{detail?.clientName ?? session.clientName}</Txt>
            <Txt variant="meta">{`${displayDate(detail?.date ?? session.date)} · ${detail?.minutes ?? session.minutes} min`}</Txt>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={color.lime} />
            <Txt variant="meta" tone={color.textMuted}>Cargando ejercicios…</Txt>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Txt variant="body" tone={color.textSoft}>{error}</Txt>
            <Button label="Reintentar" variant="outline" size="sm" onPress={() => setRetry((value) => value + 1)} />
          </View>
        ) : detail?.exercises.length ? (
          detail.exercises.map((exercise, index) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseTitle}>
                  <Txt variant="h5" numberOfLines={2}>{`${index + 1}. ${exercise.name}`}</Txt>
                  <Txt variant="meta" tone={color.textFaint}>{exercise.scheme}</Txt>
                  <Txt variant="metaSm" tone={exercise.loadSource === 'ai' ? color.violet : color.textMuted} numberOfLines={2}>
                    {`${exercise.loadSource === 'ai' ? 'IA' : 'ENTRENADOR'} · ${exercise.suggested > 0 ? weight(exercise.suggested) : 'Peso corporal'} · ${exercise.loadReason || 'Carga definida en el plan.'}`}
                  </Txt>
                </View>
                <Txt variant="labelTight" tone={color.textMuted}>
                  {`${exercise.sets.length || exercise.plannedSets} SERIES`}
                </Txt>
              </View>

              {exercise.sets.length ? (
                exercise.sets.map((set) => (
                  <View key={`${exercise.id}-${set.setIndex}`} style={styles.setRow}>
                    <Txt variant="labelTight" tone={color.textFaint}>{`SERIE ${set.setIndex}`}</Txt>
                    <Txt variant="bodyStrong">{`${weight(set.load)} · ${set.reps} reps`}</Txt>
                  </View>
                ))
              ) : (
                <Txt variant="body" tone={color.textMuted}>No hay registros de series para este ejercicio.</Txt>
              )}
            </View>
          ))
        ) : (
          <View style={styles.state}>
            <Txt variant="body" tone={color.textMuted}>No hay ejercicios registrados en esta rutina.</Txt>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 590 },
  content: { gap: 16, paddingBottom: 4 },
  summary: { gap: 3 },
  state: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  exercise: {
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  exerciseTitle: { flex: 1, gap: 3 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
