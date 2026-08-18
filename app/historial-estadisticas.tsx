import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCoachStatisticsHistory, type CoachHistoryPage, type CoachHistorySession } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachHistoryDetailSheet } from '@/components/CoachHistoryDetailSheet';
import { CoachHistoryCalendar } from '@/components/CoachHistoryCalendar';
import { CoachHistoryRow } from '@/components/CoachHistoryRow';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { currentMonthKey, displayDate, shiftMonth } from '@/lib/stats';
import { color } from '@/theme/tokens';

const PAGE_SIZE = 25;
const EMPTY_PAGE: CoachHistoryPage = {
  items: [],
  total: 0,
  hasMore: false,
  weeklyAverages: [],
  calendarActivity: { items: [], weeks: [] },
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function CoachTrainingHistory() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const params = useLocalSearchParams<{ clientId?: string }>();
  const clients = useQuery(getClients);
  const rawClientId = firstParam(params.clientId);
  const clientId = rawClientId && rawClientId !== 'all' ? rawClientId : null;
  const selectedClient = clients.find((client) => client.id === clientId);
  const [month, setMonth] = useState(() => currentMonthKey());
  const [page, setPage] = useState<CoachHistoryPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedSession, setSelectedSession] = useState<CoachHistorySession | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(EMPTY_PAGE);
    setSelectedDate(null);
    void getCoachStatisticsHistory(() => getTokenRef.current(), {
      clientId,
      month,
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
  }, [clientId, month, retry]);

  const changeMonth = useCallback((offset: number) => {
    setMonth((current) => shiftMonth(current, offset));
  }, []);

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
        month,
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

  const selectedDaySessions = selectedDate ? page.items.filter((session) => session.date === selectedDate) : [];
  const selectedDayActivity = selectedDate ? page.calendarActivity.items.find((item) => item.date === selectedDate) : null;

  return (
    <>
      <Screen scroll gap={15}>
      <TopBar title="HISTORIAL" onBack={goBack} />

      <View style={styles.heading}>
        <Txt variant="h2">Historial de entrenamientos</Txt>
        <Txt variant="body" tone={color.textMuted}>
          {selectedClient?.name ?? 'Todos los alumnos'}
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
      ) : (
        <View style={styles.list}>
          <CoachHistoryCalendar
            month={month}
            activityItems={page.calendarActivity.items}
            weeklyAverages={page.weeklyAverages}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onMonthChange={changeMonth}
          />
          {selectedDate ? (
            <View style={styles.daySessions}>
              <Txt variant="eyebrow">{`ENTRENAMIENTOS DEL ${displayDate(selectedDate)}`}</Txt>
              {selectedDayActivity ? <Txt variant="meta" tone={color.textMuted}>{`${selectedDayActivity.sessions} sesiones realizadas · ${selectedDayActivity.minutes} min estimados`}</Txt> : null}
              {selectedDaySessions.length ? selectedDaySessions.map((session, index) => (
                <CoachHistoryRow
                  key={session.id}
                  session={session}
                  showClient={!clientId}
                  latest={index === 0}
                  onPress={() => setSelectedSession(session)}
                />
              )) : (
                <Card tone="muted" padding={16}>
                  <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos cargados para este día.</Txt>
                </Card>
              )}
            </View>
          ) : null}
          {!page.items.length ? (
            <Card tone="muted" padding={18}>
              <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos completados en este mes.</Txt>
            </Card>
          ) : null}
          {page.hasMore ? (
            <Button label={loadingMore ? 'Cargando…' : 'Cargar más'} variant="outline" onPress={() => void loadMore()} disabled={loadingMore} />
          ) : null}
          <Txt variant="meta" tone={color.textFaint} center>{`${page.items.length} de ${page.total} entrenamientos`}</Txt>
        </View>
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
  daySessions: { gap: 9 },
});
