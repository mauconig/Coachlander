import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { assignTemplate, createTemplate, saveImportedRoutine } from '@/api/client';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Heading } from '@/components/Note';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { RadioDot, Toggle } from '@/components/Toggle';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import {
  getClients,
  getCurrentWeekStart,
  getNextWeekStart,
  weekIndexOf,
} from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { useCreator } from '@/state/CreatorState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

type WeekOption = { key: 'this' | 'next'; label: string; weekStart: string };

/** 24 · Guardar y asignar. El entrenador elige semana y alumnos; el atleta
 *  solo guarda la rutina directamente en su plan. */
export default function AssignCreatedRoutine() {
  const { getToken } = useAuth();
  const { unit, role, draft } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const { routineName, setRoutineName, days, assignees, toggleAssignee, autoOverload, setAutoOverload, reset, preselectWeekStart } =
    useCreator();

  const isCoach = role === 'coach';
  const isSoloAthlete = role === 'athlete' && draft.soloTraining;
  const clients = useQuery(getClients);
  const count = assignees.length;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const weekOptions: WeekOption[] = [
    { key: 'this', label: 'ESTA SEMANA', weekStart: getCurrentWeekStart() },
    { key: 'next', label: 'SIGUIENTE SEMANA', weekStart: getNextWeekStart() },
  ];
  const [selectedWeek, setSelectedWeek] = useState<WeekOption>(weekOptions[0]);

  useEffect(() => {
    if (!preselectWeekStart) return;
    const preset = weekOptions.find((w) => w.weekStart === preselectWeekStart.slice(0, 10));
    if (preset) setSelectedWeek(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectWeekStart]);

  const importDays = () =>
    days
      .filter((d) => d.exercises.length > 0)
      .map((d) => ({
        day: d.day,
        name: d.name.trim() || `Día ${d.day}`,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          name: e.name.trim(),
          sets: e.sets,
          reps: e.reps,
          restSeconds: e.restSeconds,
          day: d.day,
          load: null,
          rest: e.restSeconds,
          note: e.note.trim(),
        })),
      }));

  const templateDays = () =>
    days
      .filter((d) => d.exercises.length > 0)
      .map((d) => ({
        day: d.day,
        name: d.name.trim() || `Día ${d.day}`,
        exercises: d.exercises.map((e) => ({
          name: e.name.trim(),
          sets: e.sets,
          reps: e.reps,
          loadKg: null,
          restSeconds: e.restSeconds,
          note: e.note.trim(),
        })),
      }));

  const publishSolo = async () => {
    const list = importDays();
    if (!list.length) {
      setError('Agregá al menos un ejercicio antes de guardar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveImportedRoutine(getToken, {
        routineName: routineName.trim() || 'Mi rutina',
        days: list,
        autoOverload,
      });
      await refreshRemoteData();
      reset();
      router.dismissAll();
      router.replace('/hoy');
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  const publishCoach = async (asTemplate: boolean) => {
    const list = templateDays();
    if (!list.length) {
      setError('Agregá al menos un ejercicio antes de guardar.');
      return;
    }
    if (!asTemplate && !count) {
      setError('Elegí al menos un alumno o guardá como plantilla.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const template = await createTemplate(getToken, {
        name: routineName.trim() || 'Rutina creada',
        days: list,
        autoOverload,
      });
      if (count) {
        await assignTemplate(getToken, template.id, {
          clientIds: assignees,
          autoOverload,
          week: weekIndexOf(selectedWeek.weekStart),
          weekStart: selectedWeek.weekStart,
          replace: true,
        });
      }
      await refreshRemoteData();
      reset();
      router.dismissAll();
      router.replace('/rutinas');
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  const publish = () => {
    if (isSoloAthlete) return publishSolo();
    return publishCoach(true);
  };

  if (saving) {
    return (
      <AppLoadingScreen
        title="Guardando tu rutina"
        detail="Estamos preparando los días y asignando los ejercicios."
      />
    );
  }

  return (
    <Screen scroll gap={15}>
      <TopBar title="ÚLTIMO PASO" />

      {isSoloAthlete ? (
        <Heading
          title="Guardá tu rutina"
          subtitle="Queda en tu plan y la vas a ver en Hoy."
          variant="h2"
        />
      ) : (
        <Heading
          title="Guardá tu rutina"
          subtitle="Queda como plantilla en tu biblioteca y elegí la semana para tus alumnos."
          variant="h2"
        />
      )}

      <Field
        label="NOMBRE DE LA RUTINA"
        value={routineName}
        onChangeText={setRoutineName}
        placeholder={isSoloAthlete ? 'Ej: Mi rutina de fuerza' : 'Ej: Fuerza base — 4 días'}
      />

      {isCoach && count ? (
        <View style={styles.group}>
          <Txt variant="label">¿PARA QUÉ SEMANA?</Txt>
          <View style={styles.chips}>
            {weekOptions.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={option.weekStart === selectedWeek.weekStart}
                onPress={() => setSelectedWeek(option)}
              />
            ))}
          </View>
          <Txt variant="meta" tone={color.textFaint}>
            Si esa semana ya tenía una rutina asignada, se va a reemplazar.
          </Txt>
        </View>
      ) : null}

      {isCoach ? (
        <View style={styles.group}>
          <Txt variant="label">ASIGNAR A</Txt>
          {clients.map((client) => {
            const selected = assignees.includes(client.id);
            return (
              <Row
                key={client.id}
                tone={selected ? 'violet' : 'surface'}
                left={<Avatar name={client.name} size={38} tone={selected ? 'ink' : 'neutral'} />}
                title={client.name}
                right={<RadioDot selected={selected} />}
                onPress={() => toggleAssignee(client.id)}
              />
            );
          })}
        </View>
      ) : null}

      <Row
        title="Overload automático"
        meta={`+2,5 ${unit} por semana`}
        right={<Toggle value={autoOverload} onChange={setAutoOverload} label="Overload automático" />}
      />

      {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}

      <View style={styles.actions}>
        {isCoach ? (
          <>
            <Button
              label={count ? `Marcar como completada · ${count} ${count === 1 ? 'alumno' : 'alumnos'}` : 'Guardar como plantilla'}
              onPress={() => publishCoach(true)}
            />
            {count ? (
              <Pressable onPress={() => publishCoach(false)} accessibilityRole="button">
                <Txt variant="body" tone={color.textFaint} center>
                  Solo guardar como plantilla
                </Txt>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Button label="Guardar en mi plan" onPress={() => publish()} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { marginTop: 'auto', gap: 10, paddingTop: 16 },
});