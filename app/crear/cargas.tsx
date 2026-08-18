import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { assignTemplate, createTemplate, type CoachAssignmentLoad } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Heading } from '@/components/Note';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients, getCurrentWeekStart, getTemplateById, weekIndexOf } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { TemplateDay } from '@/db/queries';
import { useCreator, type CreatorDay } from '@/state/CreatorState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

type LoadExercise = {
  day: number;
  position: number;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  progressionMetric?: 'load' | 'reps' | 'seconds';
};

type LoadDay = {
  day: number;
  name: string;
  exercises: LoadExercise[];
};

type LoadsByClient = Record<string, Record<string, string>>;

export default function CoachLoadAssignment() {
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const { templateId: rawTemplateId, clientIds: rawClientIds, weekStart: rawWeekStart, week: rawWeek, returnTo: rawReturnTo } =
    useLocalSearchParams<{ templateId?: string; clientIds?: string; weekStart?: string; week?: string; returnTo?: string }>();
  const templateId = firstParam(rawTemplateId);
  const returnTo = firstParam(rawReturnTo);
  const routeClientIds = parseIds(rawClientIds);
  const template = useQuery((data) => (templateId ? getTemplateById(data, templateId) : null), [templateId]);
  const clients = useQuery(getClients);
  const {
    routineName,
    days: creatorDays,
    assignees,
    autoOverload,
    preselectWeekStart,
    reset,
  } = useCreator();
  const [activeClientId, setActiveClientId] = useState('');
  const [loads, setLoads] = useState<LoadsByClient>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
  const initializedRef = useRef('');

  const clientIds = useMemo(
    () => (routeClientIds.length ? routeClientIds : assignees),
    [assignees, routeClientIds.join(',')],
  );
  const sourceDays = useMemo(
    () => (template ? template.days.map(templateDayToLoadDay) : creatorDays.map(creatorDayToLoadDay)),
    [creatorDays, template],
  );
  const weekStart = firstParam(rawWeekStart) || preselectWeekStart?.slice(0, 10) || getCurrentWeekStart();
  const week = Number(firstParam(rawWeek)) || weekIndexOf(weekStart);
  const selectedClients = useMemo(
    () => clientIds.map((id) => clients.find((client) => client.id === id)).filter(Boolean),
    [clientIds, clients],
  );
  const activeClient = selectedClients.find((client) => client?.id === activeClientId) ?? selectedClients[0];
  const activeLoads = activeClient ? loads[activeClient.id] ?? {} : {};
  const totalExercises = sourceDays.reduce((sum, day) => sum + day.exercises.length, 0);
  const completedFor = (clientId: string) =>
    sourceDays.reduce(
      (sum, day) =>
        sum + day.exercises.filter((exercise) => isValidLoad(loads[clientId]?.[loadKey(exercise)])).length,
      0,
    );
  const ready = clientIds.length > 0 && sourceDays.length > 0 && clientIds.every((clientId) => completedFor(clientId) === totalExercises);

  useEffect(() => {
    if (!sourceDays.length || !clientIds.length) return;
    const signature = `${templateId ?? 'draft'}:${clientIds.join(',')}:${sourceDays
      .flatMap((day) => day.exercises.map((exercise) => `${day.day}:${exercise.position}`))
      .join(',')}`;
    if (initializedRef.current === signature) return;
    initializedRef.current = signature;
    setActiveClientId(clientIds[0]);
    setLoads(initializeLoads(clientIds, sourceDays));
    setError('');
  }, [clientIds, sourceDays, templateId]);

  const updateLoad = (clientId: string, exercise: LoadExercise, value: string) => {
    setLoads((current) => ({
      ...current,
      [clientId]: {
        ...(current[clientId] ?? {}),
        [loadKey(exercise)]: value.replace(',', '.'),
      },
    }));
    setError('');
  };

  const save = async () => {
    if (!ready) {
      setError('Completá una carga válida para cada ejercicio y alumno.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const coachLoads = makeCoachLoads(clientIds, sourceDays, loads);
      let targetTemplateId = createdTemplateId ?? templateId;
      if (!targetTemplateId) {
        const created = await createTemplate(getToken, {
          name: routineName.trim() || 'Rutina creada',
          days: sourceDays.map((day) => ({
            day: day.day,
            name: day.name,
            exercises: day.exercises.map((exercise) => ({
              name: exercise.name,
              sets: exercise.sets,
              reps: exercise.reps,
              loadKg: null,
              note: '',
            })),
          })),
          autoOverload,
        });
        targetTemplateId = created.id;
        setCreatedTemplateId(created.id);
      }

      await assignTemplate(getToken, targetTemplateId, {
        clientIds,
        autoOverload,
        loadMode: 'coach',
        coachLoads,
        week,
        weekStart,
        replace: true,
      });
      await refreshRemoteData();
      reset();
      if (returnTo === 'template' || returnTo === 'client' || returnTo === 'routine') {
        router.back();
      } else {
        router.dismissAll();
        router.replace('/rutinas');
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos asignar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  if (!sourceDays.length || !clientIds.length) {
    return (
      <Screen gap={16}>
        <TopBar title="CARGAS" />
        <Heading title="No hay una asignación pendiente" subtitle="Volvé al paso anterior y elegí al menos un alumno." variant="h2" />
        <Button label="Volver" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      gap={16}
      footer={
        <View style={styles.footer}>
          {error ? <Txt variant="meta" tone={color.textSoft}>{error}</Txt> : null}
          <Txt variant="labelTight" tone={ready ? color.lime : color.textMuted}>
            {ready ? 'TODAS LAS CARGAS COMPLETAS' : 'FALTAN CARGAS POR DEFINIR'}
          </Txt>
          <Button
            label={saving ? 'Asignando…' : `Asignar a ${clientIds.length} ${clientIds.length === 1 ? 'alumno' : 'alumnos'}`}
            onPress={() => void save()}
            disabled={!ready || saving}
          />
        </View>
      }
    >
      <TopBar title="CARGAS DEL ENTRENADOR" />
      <Heading
        title={template?.name ?? (routineName.trim() || 'Rutina nueva')}
        subtitle="Definí una carga para cada ejercicio y alumno antes de asignar."
        variant="h2"
      />

      <View style={styles.clientSection}>
        <Txt variant="label">ALUMNO</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clientChips}>
          {selectedClients.map((client) => (
            <Chip
              key={client!.id}
              label={`${client!.name.split(' ')[0]} · ${completedFor(client!.id)}/${totalExercises}`}
              selected={client!.id === activeClient?.id}
              onPress={() => setActiveClientId(client!.id)}
              mono={false}
            />
          ))}
        </ScrollView>
      </View>

      <Card tone="violet" radius={radius.xxl} padding={16} gap={5}>
        <Txt variant="label" tone={color.onViolet}>CARGAS DEFINIDAS POR EL ENTRENADOR</Txt>
        <Txt variant="body" tone={color.onVioletStrong}>
          La carga se aplicará a todos los sets de cada ejercicio. Usá 0 kg para peso corporal.
        </Txt>
      </Card>

      {activeClient ? (
        <View style={styles.days}>
          {sourceDays.map((day) => (
            <View key={day.day} style={styles.day}>
              <View style={styles.dayHeader}>
                <Txt variant="label" tone={color.lime}>{`DÍA ${day.day}`}</Txt>
                <Txt variant="bodyStrong">{day.name}</Txt>
              </View>
              {day.exercises.map((exercise) => (
                <View key={loadKey(exercise)} style={styles.exercise}>
                  <View style={styles.exerciseCopy}>
                    <Txt variant="rowTitle">{exercise.name}</Txt>
                    <Txt variant="meta" tone={color.textMuted}>{`${exercise.sets} × ${exercise.reps}`}</Txt>
                  </View>
                  <Field
                    label="CARGA"
                    value={activeLoads[loadKey(exercise)] ?? ''}
                    onChangeText={(value) => updateLoad(activeClient.id, exercise, value)}
                    keyboardType="decimal-pad"
                    suffix="kg"
                    placeholder="0"
                    style={styles.loadField}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIds(value: string | string[] | undefined) {
  return (firstParam(value) ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

function loadKey(exercise: Pick<LoadExercise, 'day' | 'position'>) {
  return `${exercise.day}:${exercise.position}`;
}

function isBodyweight(exercise: Pick<LoadExercise, 'name' | 'progressionMetric'>) {
  return exercise.progressionMetric === 'reps' || exercise.progressionMetric === 'seconds' || /plancha|flexiones?|dominadas?|fondos|burpees?/i.test(exercise.name);
}

function initializeLoads(clientIds: string[], days: LoadDay[]): LoadsByClient {
  return Object.fromEntries(
    clientIds.map((clientId) => [
      clientId,
      Object.fromEntries(
        days.flatMap((day) => day.exercises.map((exercise) => [loadKey(exercise), isBodyweight(exercise) ? '0' : exercise.loadKg == null ? '' : String(exercise.loadKg)])),
      ),
    ]),
  );
}

function isValidLoad(value: string | undefined) {
  if (value === undefined || value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 500 && Math.abs(number * 2 - Math.round(number * 2)) < 1e-9;
}

function makeCoachLoads(clientIds: string[], days: LoadDay[], loads: LoadsByClient): CoachAssignmentLoad[] {
  return clientIds.flatMap((clientId) =>
    days.flatMap((day) =>
      day.exercises.map((exercise) => ({
        clientId,
        day: exercise.day,
        position: exercise.position,
        loadKg: Number(loads[clientId]?.[loadKey(exercise)]),
      })),
    ),
  );
}

function templateDayToLoadDay(day: TemplateDay): LoadDay {
  return {
    day: day.day,
    name: day.name,
    exercises: day.exercises.map((exercise) => ({
      day: day.day,
      position: exercise.position,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      loadKg: exercise.loadKg,
      progressionMetric: exercise.progressionMetric,
    })),
  };
}

function creatorDayToLoadDay(day: CreatorDay): LoadDay {
  return {
    day: day.day,
    name: day.name,
    exercises: day.exercises.map((exercise, position) => ({
      day: day.day,
      position,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      loadKg: exercise.loadKg,
    })),
  };
}

const styles = StyleSheet.create({
  clientSection: { gap: 9 },
  clientChips: { gap: 8, paddingRight: 8 },
  days: { gap: 18 },
  day: { gap: 9 },
  dayHeader: { gap: 3, paddingHorizontal: 4 },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 12,
  },
  exerciseCopy: { flex: 1, gap: 4 },
  loadField: { width: 118 },
  footer: { gap: 8 },
});
