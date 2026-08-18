import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCoachExerciseLibrary, type CoachExerciseLibraryItem } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { displayDate, displayRange, todayRange, type StatsRange } from '@/lib/stats';
import { num } from '@/lib/format';
import { color } from '@/theme/tokens';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function StudentExerciseProgressLibrary() {
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const params = useLocalSearchParams<{ clientId?: string; from?: string; to?: string }>();
  const clients = useQuery(getClients);
  const defaults = useMemo(() => todayRange(), []);
  const clientId = firstParam(params.clientId) ?? '';
  const fromParam = firstParam(params.from);
  const toParam = firstParam(params.to);
  const range: StatsRange = validIsoDate(fromParam) && validIsoDate(toParam) && fromParam <= toParam
    ? { from: fromParam, to: toParam }
    : defaults;
  const selectedClient = clients.find((client) => client.id === clientId);
  const [items, setItems] = useState<CoachExerciseLibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setItems([]);
    void getCoachExerciseLibrary(() => tokenRef.current(), { clientId, from: range.from, to: range.to })
      .then((response) => {
        if (!cancelled) setItems(response.items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar los ejercicios.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, retry]);

  const visibleItems = items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/estadisticas');
  };

  return (
    <Screen scroll gap={15}>
      <TopBar title="PROGRESO" onBack={goBack} />
      <View style={styles.heading}>
        <Txt variant="h2">Progreso por ejercicio</Txt>
        <Txt variant="body" tone={color.textMuted}>
          {`${selectedClient?.name ?? 'Alumno'} · ${displayRange(range)}`}
        </Txt>
      </View>
      <Field label="BUSCAR EJERCICIO" value={search} onChangeText={setSearch} placeholder="Press, sentadilla…" autoCapitalize="none" />

      {error ? (
        <Card tone="muted" padding={18} gap={12}>
          <Txt variant="body" tone={color.textSoft}>{error}</Txt>
          <Button label="Reintentar" variant="outline" size="sm" onPress={() => setRetry((value) => value + 1)} />
        </Card>
      ) : null}
      {loading ? (
        <Card tone="muted" padding={24} gap={10} style={styles.loading}>
          <ActivityIndicator color={color.lime} />
          <Txt variant="meta" tone={color.textMuted}>Cargando ejercicios…</Txt>
        </Card>
      ) : visibleItems.length ? (
        <View style={styles.list}>
          {visibleItems.map((item) => (
            <Row
              key={item.key}
              title={item.name}
              meta={`${item.sessions} ${item.sessions === 1 ? 'sesión' : 'sesiones'} · última vez ${displayDate(item.lastDate)}`}
              trailing={item.lastLoad === null ? `${item.lastReps} reps` : `${num(item.lastLoad)} kg`}
              trailingTone={color.lime}
              chevron
              onPress={() => router.push({
                pathname: '/progreso-alumno/[exerciseKey]',
                params: { exerciseKey: item.key, clientId, from: range.from, to: range.to },
              })}
            />
          ))}
        </View>
      ) : (
        <Card tone="muted" padding={20}>
          <Txt variant="body" tone={color.textMuted} center>
            {items.length ? 'No encontramos ejercicios con esa búsqueda.' : 'Este alumno no tiene ejercicios registrados en el período.'}
          </Txt>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  loading: { alignItems: 'center' },
  list: { gap: 9 },
});
