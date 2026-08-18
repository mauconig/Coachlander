import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCoachStatisticsHistory, type CoachHistoryPage, type CoachHistorySession } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachHistoryDetailSheet } from '@/components/CoachHistoryDetailSheet';
import { CoachHistoryRow } from '@/components/CoachHistoryRow';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { displayDate, todayRange, type StatsRange } from '@/lib/stats';
import { color } from '@/theme/tokens';

const PAGE_SIZE = 25;
const EMPTY_PAGE: CoachHistoryPage = { items: [], total: 0, hasMore: false };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function CoachTrainingHistory() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const params = useLocalSearchParams<{ clientId?: string; from?: string; to?: string }>();
  const clients = useQuery(getClients);
  const defaults = useMemo(() => todayRange(), []);
  const rawClientId = firstParam(params.clientId);
  const clientId = rawClientId && rawClientId !== 'all' ? rawClientId : null;
  const requestedFrom = firstParam(params.from);
  const requestedTo = firstParam(params.to);
  const parsedFrom = validIsoDate(requestedFrom) ? requestedFrom : defaults.from;
  const parsedTo = validIsoDate(requestedTo) ? requestedTo : defaults.to;
  const range: StatsRange = parsedFrom <= parsedTo
    ? { from: parsedFrom, to: parsedTo }
    : defaults;
  const selectedClient = clients.find((client) => client.id === clientId);
  const [page, setPage] = useState<CoachHistoryPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedSession, setSelectedSession] = useState<CoachHistorySession | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(EMPTY_PAGE);
    void getCoachStatisticsHistory(() => getTokenRef.current(), {
      clientId,
      from: range.from,
      to: range.to,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then((nextPage) => {
        if (!cancelled) setPage(nextPage);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar el historial.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, retry]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/estadisticas');
    }
  };

  const loadMore = async () => {
    if (loadingMore || !page.hasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const nextPage = await getCoachStatisticsHistory(() => getTokenRef.current(), {
        clientId,
        from: range.from,
        to: range.to,
        limit: PAGE_SIZE,
        offset: page.items.length,
      });
      setPage((current) => {
        const known = new Set(current.items.map((item) => item.id));
        const appended = nextPage.items.filter((item) => !known.has(item.id));
        return { ...nextPage, items: [...current.items, ...appended] };
      });
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar más entrenamientos.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <Screen scroll gap={15}>
      <TopBar title="HISTORIAL" onBack={goBack} />

      <View style={styles.heading}>
        <Txt variant="h2">Historial de entrenamientos</Txt>
        <Txt variant="body" tone={color.textMuted}>
          {`${selectedClient?.name ?? 'Todos los alumnos'} · ${displayDate(range.from)} — ${displayDate(range.to)}`}
        </Txt>
      </View>

      {error ? (
        <Card tone="muted" padding={18} gap={12}>
          <Txt variant="body" tone={color.textSoft}>{error}</Txt>
          <Button label="Reintentar" variant="outline" size="sm" onPress={() => setRetry((value) => value + 1)} />
        </Card>
      ) : null}

      {loading ? (
        <Card tone="muted" padding={24} gap={10} style={styles.loading}>
          <ActivityIndicator color={color.lime} />
          <Txt variant="meta" tone={color.textMuted}>Cargando historial…</Txt>
        </Card>
      ) : page.items.length ? (
        <View style={styles.list}>
          {page.items.map((session, index) => (
            <CoachHistoryRow
              key={session.id}
              session={session}
              showClient={!clientId}
              latest={index === 0}
              onPress={() => setSelectedSession(session)}
            />
          ))}
          {page.hasMore ? (
            <Button label={loadingMore ? 'Cargando…' : 'Cargar más'} variant="outline" onPress={() => void loadMore()} disabled={loadingMore} />
          ) : null}
          <Txt variant="meta" tone={color.textFaint} center>{`${page.items.length} de ${page.total} entrenamientos`}</Txt>
        </View>
      ) : (
        <Card tone="muted" padding={18}>
          <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos completados en este período.</Txt>
        </Card>
      )}
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

const styles = StyleSheet.create({
  heading: { gap: 6 },
  loading: { alignItems: 'center' },
  list: { gap: 9 },
});
