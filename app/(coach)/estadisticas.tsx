import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { CoachHistorySession, CoachStatistics } from '@/api/client';
import { getCoachStatistics } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachActivityCharts } from '@/components/CoachActivityCharts';
import { CoachActivityHeatmap } from '@/components/CoachActivityHeatmap';
import { CoachHistoryDetailSheet } from '@/components/CoachHistoryDetailSheet';
import { CoachHistoryRow } from '@/components/CoachHistoryRow';
import { CoachStatsFilters } from '@/components/CoachStatsFilters';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { hoursMinutes } from '@/lib/format';
import { todayRange, type StatsPreset, type StatsRange } from '@/lib/stats';
import { color } from '@/theme/tokens';

/** Estadísticas del entrenador filtrables por alumno y período. */
export default function Stats() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const clients = useQuery(getClients);
  const [clientId, setClientId] = useState<string | null>(null);
  const [range, setRange] = useState<StatsRange>(() => todayRange());
  const [preset, setPreset] = useState<StatsPreset>('month');
  const [stats, setStats] = useState<CoachStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedSession, setSelectedSession] = useState<CoachHistorySession | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getCoachStatistics(() => getTokenRef.current(), { clientId, from: range.from, to: range.to })
      .then((nextStats) => {
        if (!cancelled) setStats(nextStats);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar las estadísticas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, retry]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const subtitle = selectedClient?.name ?? 'Todos los alumnos';

  const openHistory = () => {
    router.push({
      pathname: '/historial-estadisticas',
      params: {
        clientId: clientId ?? 'all',
        from: range.from,
        to: range.to,
      },
    });
  };

  const openExerciseProgress = () => {
    if (!clientId) return;
    router.push({
      pathname: '/progreso-alumno',
      params: { clientId, from: range.from, to: range.to },
    });
  };

  return (
    <>
      <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">MODO ENTRENADOR</Txt>
        <Txt variant="h2">Estadísticas</Txt>
        <Txt variant="body" tone={color.textMuted}>{subtitle}</Txt>
      </View>

      <CoachStatsFilters
        clientId={clientId}
        range={range}
        preset={preset}
        onClientChange={setClientId}
        onRangeChange={(nextPreset, nextRange) => {
          setPreset(nextPreset);
          setRange(nextRange);
        }}
      />

      {error ? (
        <Card tone="muted" padding={18} gap={12}>
          <Txt variant="body" tone={color.textSoft}>{error}</Txt>
          <Button label="Reintentar" variant="outline" size="sm" onPress={() => setRetry((value) => value + 1)} />
        </Card>
      ) : null}

      {loading && !stats ? (
        <Card tone="muted" padding={24} gap={10} style={styles.loading}>
          <ActivityIndicator color={color.lime} />
          <Txt variant="meta" tone={color.textMuted}>Calculando estadísticas…</Txt>
        </Card>
      ) : stats ? (
        <StatsContent
          stats={stats}
          hasSelectedClient={!!clientId}
          onOpenHistory={openHistory}
          onOpenExerciseProgress={openExerciseProgress}
          onSelectSession={setSelectedSession}
        />
      ) : null}
      </Screen>
      <CoachHistoryDetailSheet
        visible={!!selectedSession}
        session={selectedSession}
        tokenProvider={getToken}
        onClose={() => setSelectedSession(null)}
      />
    </>
  );
}

function StatsContent({
  stats,
  hasSelectedClient,
  onOpenHistory,
  onOpenExerciseProgress,
  onSelectSession,
}: {
  stats: CoachStatistics;
  hasSelectedClient: boolean;
  onOpenHistory: () => void;
  onOpenExerciseProgress: () => void;
  onSelectSession: (session: CoachHistorySession) => void;
}) {
  const { summary, recentSessions } = stats;

  return (
    <>
      <View style={styles.grid}>
        <StatTile value={String(summary.clientCount)} label="ALUMNOS" valueTone={color.lime} />
        <StatTile value={String(summary.activeNow)} label="ENTRENANDO HOY" />
      </View>

      <View style={styles.grid}>
        <StatTile value={String(summary.completedRoutines)} label="SESIONES CUMPLIDAS" valueTone={color.lime} />
        <StatTile value={hoursMinutes(summary.totalMinutes)} label="TIEMPO ESTIMADO" />
        <StatTile value={`${summary.completionRate} %`} label="CUMPLIMIENTO" />
      </View>

      <Txt variant="meta" tone={color.textFaint}>
        {`${summary.scheduledRoutines} rutinas programadas en el período`}
      </Txt>

      <CoachActivityCharts activity={stats.activity} />
      <CoachActivityHeatmap from={stats.scope.from} to={stats.scope.to} items={stats.heatmap} />

      {hasSelectedClient ? (
        <Button label="VER PROGRESO POR EJERCICIO" variant="outline" onPress={onOpenExerciseProgress} />
      ) : null}

      <View style={styles.historySection}>
        <View style={styles.sectionHeader}>
          <Txt variant="eyebrow">HISTORIAL DE ENTRENAMIENTOS</Txt>
          <Pressable onPress={onOpenHistory} accessibilityRole="button">
            <Txt variant="labelTight" tone={color.lime}>VER TODOS</Txt>
          </Pressable>
        </View>

        {recentSessions.length ? (
          recentSessions.slice(0, 5).map((session, index) => (
            <CoachHistoryRow
              key={session.id}
              session={session}
              showClient={!hasSelectedClient}
              latest={index === 0}
              onPress={() => onSelectSession(session)}
            />
          ))
        ) : (
          <Card tone="muted" padding={18}>
            <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos completados en este período.</Txt>
          </Card>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 4 },
  loading: { alignItems: 'center' },
  grid: { flexDirection: 'row', gap: 9 },
  historySection: { gap: 9 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
