import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCoachExerciseProgress, type CoachExerciseProgress } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachExerciseGoalSheet } from '@/components/CoachExerciseGoalSheet';
import { CoachExerciseProgressChart } from '@/components/CoachExerciseProgressChart';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { displayDate, displayRange, todayRange, type StatsRange } from '@/lib/stats';
import { color } from '@/theme/tokens';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function metricValue(point: CoachExerciseProgress['points'][number], bodyweight: boolean) {
  if (!point.meetsTarget) return null;
  return bodyweight ? point.reps : point.loadKg;
}

function possiblePlateau(progress: CoachExerciseProgress) {
  const values = progress.points
    .map((point) => metricValue(point, progress.exercise.bodyweight))
    .filter((value): value is number => value !== null);
  const recent = values.slice(-3);
  return recent.length >= 3 && Math.max(...recent) - Math.min(...recent) <= 0.5;
}

function belowGoal(progress: CoachExerciseProgress) {
  if (!progress.goal) return false;
  const latest = [...progress.points].reverse().find((point) => metricValue(point, progress.exercise.bodyweight) !== null);
  if (!latest) return false;
  const actual = metricValue(latest, progress.exercise.bodyweight);
  const baseline = progress.exercise.bodyweight ? progress.goal.baselineReps : progress.goal.baselineLoadKg;
  const target = progress.exercise.bodyweight ? progress.goal.targetReps : progress.goal.targetLoadKg;
  if (actual === null || baseline === null || target === null) return false;
  const start = Date.parse(`${progress.goal.baselineDate}T00:00:00Z`);
  const end = Date.parse(`${progress.goal.targetDate}T00:00:00Z`);
  const point = Date.parse(`${latest.bucketStart}T00:00:00Z`);
  const ratio = end === start ? 1 : Math.max(0, Math.min(1, (point - start) / (end - start)));
  const ideal = baseline + (target - baseline) * ratio;
  return actual < ideal;
}

export default function StudentExerciseProgressDetail() {
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const params = useLocalSearchParams<{ clientId?: string; from?: string; to?: string; exerciseKey?: string }>();
  const clients = useQuery(getClients);
  const defaults = useMemo(() => todayRange(), []);
  const clientId = firstParam(params.clientId) ?? '';
  const exerciseKey = firstParam(params.exerciseKey) ?? '';
  const fromParam = firstParam(params.from);
  const toParam = firstParam(params.to);
  const range: StatsRange = validIsoDate(fromParam) && validIsoDate(toParam) && fromParam <= toParam
    ? { from: fromParam, to: toParam }
    : defaults;
  const selectedClient = clients.find((client) => client.id === clientId);
  const [progress, setProgress] = useState<CoachExerciseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [goalVisible, setGoalVisible] = useState(false);

  useEffect(() => {
    if (!clientId || !exerciseKey) {
      setLoading(false);
      setError('Faltan datos para abrir este progreso.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setProgress(null);
    void getCoachExerciseProgress(() => tokenRef.current(), { clientId, exerciseKey, from: range.from, to: range.to })
      .then((nextProgress) => {
        if (!cancelled) setProgress(nextProgress);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar el progreso.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, exerciseKey, range.from, range.to, retry]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (clientId) router.replace({ pathname: '/progreso-alumno', params: { clientId, from: range.from, to: range.to } });
    else router.replace('/estadisticas');
  };

  return (
    <>
      <Screen scroll gap={15}>
        <TopBar title="PROGRESO" onBack={goBack} />
        {loading ? (
          <Card tone="muted" padding={24} gap={10} style={styles.loading}>
            <ActivityIndicator color={color.lime} />
            <Txt variant="meta" tone={color.textMuted}>Cargando progreso…</Txt>
          </Card>
        ) : error ? (
          <Card tone="muted" padding={18} gap={12}>
            <Txt variant="body" tone={color.textSoft}>{error}</Txt>
            <Button label="Reintentar" variant="outline" size="sm" onPress={() => setRetry((value) => value + 1)} />
          </Card>
        ) : progress ? (
          <>
            <View style={styles.heading}>
              <Txt variant="h2">{progress.exercise.name}</Txt>
              <Txt variant="body" tone={color.textMuted}>{`${selectedClient?.name ?? 'Alumno'} · ${displayRange(range)}`}</Txt>
            </View>

            <Card padding={18} gap={12}>
              <View style={styles.cardHeader}>
                <View style={styles.heading}>
                  <Txt variant="eyebrow">{progress.exercise.bodyweight ? 'REPS MÁXIMAS' : `CARGA A ${progress.exercise.targetReps} REPS`}</Txt>
                  <Txt variant="meta" tone={color.textMuted}>{progress.goal ? 'Comparación con objetivo del entrenador' : 'Rendimiento real registrado'}</Txt>
                </View>
                <Txt variant="labelTight" tone={color.lime}>{progress.points.length} puntos</Txt>
              </View>
              <CoachExerciseProgressChart progress={progress} />
              {!progress.goal ? <Button label="DEFINIR OBJETIVO" variant="outline" size="sm" onPress={() => setGoalVisible(true)} /> : null}
            </Card>

            {progress.goal ? (
              <Card tone="muted" padding={16} gap={5}>
                <Txt variant="eyebrow">OBJETIVO ACTIVO</Txt>
                <Txt variant="body" tone={color.textSoft}>{`${progress.goal.baselineReps} reps · ${displayDate(progress.goal.baselineDate)} → ${progress.goal.targetReps} reps · ${displayDate(progress.goal.targetDate)}`}</Txt>
                <Button label="EDITAR OBJETIVO" variant="ghost" size="sm" onPress={() => setGoalVisible(true)} />
              </Card>
            ) : null}

            {possiblePlateau(progress) ? (
              <Card tone="muted" padding={16} gap={4}>
                <Txt variant="eyebrow" tone={color.violetSoft}>POSIBLE MESETA</Txt>
                <Txt variant="meta" tone={color.textMuted}>Tres registros válidos sin mejora visible. Es una señal para revisar, no un diagnóstico.</Txt>
              </Card>
            ) : null}
            {belowGoal(progress) ? (
              <Card tone="muted" padding={16} gap={4}>
                <Txt variant="eyebrow" tone={color.violetSoft}>POR DEBAJO DEL OBJETIVO</Txt>
                <Txt variant="meta" tone={color.textMuted}>El último registro válido está por debajo de la línea ideal configurada.</Txt>
              </Card>
            ) : null}

            <View style={styles.lastSession}>
              <Txt variant="eyebrow">ÚLTIMA SESIÓN REGISTRADA</Txt>
              <Txt variant="body" tone={color.textMuted}>
                {progress.points.length ? `${displayDate(progress.points[progress.points.length - 1].bucketStart)} · ${progress.points[progress.points.length - 1].reps ?? 0} reps` : 'Sin registros'}
              </Txt>
            </View>
          </>
        ) : null}
      </Screen>
      {progress ? (
        <CoachExerciseGoalSheet
          visible={goalVisible}
          clientId={clientId}
          progress={progress}
          tokenProvider={getToken}
          onClose={() => setGoalVisible(false)}
          onSaved={() => {
            setGoalVisible(false);
            setRetry((value) => value + 1);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center' },
  heading: { gap: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  lastSession: { gap: 5 },
});
