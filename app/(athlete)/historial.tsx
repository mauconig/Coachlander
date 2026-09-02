import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CoachHeatmapItem, CoachHistorySession, CoachWeeklyActivity } from '@/api/client';
import { AthleteHistoryDetailSheet } from '@/components/AthleteHistoryDetailSheet';
import { Card } from '@/components/Card';
import { CoachHistoryCalendar } from '@/components/CoachHistoryCalendar';
import { CoachHistoryRow } from '@/components/CoachHistoryRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import type { SessionRecord } from '@/data/types';
import { getHistory } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { currentMonthKey, displayDate, displayMonth, shiftMonth } from '@/lib/stats';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { useApp } from '@/state/AppState';
import { color } from '@/theme/tokens';

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayOf(date: Date): Date {
  const day = date.getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

function monthActivity(month: string, history: SessionRecord[]) {
  const items = new Map<string, CoachHeatmapItem>();
  for (const session of history) {
    const date = dateKey(session.date);
    if (!date.startsWith(`${month}-`)) continue;
    const current = items.get(date) ?? { date, sessions: 0, minutes: 0 };
    current.sessions += 1;
    current.minutes += session.minutes;
    items.set(date, current);
  }
  return [...items.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function monthWeeklyAverages(month: string, activity: CoachHeatmapItem[]): CoachWeeklyActivity[] {
  const [year, monthValue] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthValue - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthValue, 0));
  const activityByDate = new Map(activity.map((item) => [item.date, item]));
  const weeks: CoachWeeklyActivity[] = [];

  for (let cursor = mondayOf(monthStart); cursor <= monthEnd; cursor = addDays(cursor, 7)) {
    const weekStart = isoDate(cursor);
    let daysIncluded = 0;
    let sessions = 0;
    let minutes = 0;
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(cursor, index);
      if (date < monthStart || date > monthEnd) continue;
      daysIncluded += 1;
      const item = activityByDate.get(isoDate(date));
      sessions += item?.sessions ?? 0;
      minutes += item?.minutes ?? 0;
    }
    weeks.push({
      start: weekStart,
      label: `${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)}`,
      sessions,
      minutes,
      daysIncluded,
      normalizedSessions: daysIncluded ? Math.round((sessions / daysIncluded) * 7 * 100) / 100 : 0,
      normalizedMinutes: daysIncluded ? Math.round((minutes / daysIncluded) * 7 * 100) / 100 : 0,
    });
  }
  return weeks;
}

function toCoachSession(session: SessionRecord): CoachHistorySession {
  return {
    id: session.id,
    clientId: '',
    clientName: '',
    date: dateKey(session.date),
    name: session.name,
    minutes: session.minutes,
    sets: session.sets,
    volumeKg: session.volume,
    completion: session.status === 'completed' ? 100 : 0,
    status: session.status,
  };
}

/** Historial del atleta: comparte el calendario mensual y la navegación del coach. */
export default function History() {
  const { unit } = useApp();
  const history = useQuery(getHistory);
  const refreshRemoteData = useRefreshRemoteData();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshRemoteData().catch((error: unknown) => {
        console.warn('[Coachlander] No se pudo actualizar el historial', error);
      });
    }, [refreshRemoteData]),
  );

  const activityItems = useMemo(() => monthActivity(month, history), [history, month]);
  const weeklyAverages = useMemo(() => monthWeeklyAverages(month, activityItems), [activityItems, month]);
  const selectedDaySessions = useMemo(
    () => history.filter((session) => dateKey(session.date) === selectedDate).map(toCoachSession),
    [history, selectedDate],
  );
  const selectedDayActivity = activityItems.find((item) => item.date === selectedDate);
  const monthSessions = activityItems.reduce((total, item) => total + item.sessions, 0);

  const changeMonth = useCallback((offset: number) => {
    setMonth((current) => shiftMonth(current, offset));
    setSelectedDate(null);
  }, []);

  return (
    <>
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="h2">Historial</Txt>
        <Txt variant="labelTight" tone={color.lime}>{displayMonth(month)}</Txt>
      </View>

      <CoachHistoryCalendar
        month={month}
        activityItems={activityItems}
        weeklyAverages={weeklyAverages}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={changeMonth}
      />

      <Txt variant="meta" tone={color.textMuted}>{`${monthSessions} sesiones realizadas en ${displayMonth(month)}`}</Txt>

      {selectedDate ? (
        <View style={styles.daySessions}>
          <Txt variant="eyebrow">{`ENTRENAMIENTOS DEL ${displayDate(selectedDate)}`}</Txt>
          {selectedDayActivity ? (
            <Txt variant="meta" tone={color.textMuted}>
              {`${selectedDayActivity.sessions} sesiones realizadas · ${selectedDayActivity.minutes} min estimados`}
            </Txt>
          ) : null}
          {selectedDaySessions.length ? selectedDaySessions.map((session, index) => (
            <CoachHistoryRow
              key={`${session.id}-${index}`}
              session={session}
              showClient={false}
              latest={index === 0}
              onPress={() => {
                const source = history.find((item) => item.id === session.id);
                if (source) setSelectedSession(source);
              }}
            />
          )) : (
            <Card tone="muted" padding={16}>
              <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos cargados para este día.</Txt>
            </Card>
          )}
        </View>
      ) : (
        <Card tone="muted" padding={16}>
          <Txt variant="body" tone={color.textMuted} center>Elegí un día para ver las rutinas completadas.</Txt>
        </Card>
      )}

      {!monthSessions ? (
        <Card tone="muted" padding={18}>
          <Txt variant="body" tone={color.textMuted} center>No hay entrenamientos completados en este mes.</Txt>
        </Card>
      ) : null}
    </Screen>
      <AthleteHistoryDetailSheet
        visible={!!selectedSession}
        session={selectedSession}
        unit={unit}
        onClose={() => setSelectedSession(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  daySessions: { gap: 9 },
});
