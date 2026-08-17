import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { assignTemplate, createTemplate } from '@/api/client';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Heading } from '@/components/Note';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { RadioDot, Toggle } from '@/components/Toggle';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { useCreator } from '@/state/CreatorState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color } from '@/theme/tokens';

/** 24 · Guardar y asignar — plantilla y/o alumnos. */
export default function AssignCreatedRoutine() {
  const { getToken } = useAuth();
  const { unit } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const { routineName, setRoutineName, days, assignees, toggleAssignee, autoOverload, setAutoOverload, reset } =
    useCreator();

  const clients = useQuery(getClients);
  const count = assignees.length;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const publish = async (asTemplate: boolean) => {
    const nonEmptyDays = days
      .filter((d) => d.exercises.length > 0)
      .map((d) => ({
        day: d.day,
        name: d.name.trim() || `Día ${d.day}`,
        exercises: d.exercises.map((e) => ({
          name: e.name.trim(),
          sets: e.sets,
          reps: e.reps,
          loadKg: e.loadKg,
          restSeconds: e.restSeconds,
          note: e.note.trim(),
        })),
      }));

    if (!nonEmptyDays.length) {
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
        days: nonEmptyDays,
        autoOverload,
        completed: true,
      });
      if (count) {
        await assignTemplate(getToken, template.id, {
          clientIds: assignees,
          autoOverload,
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

      <Heading
        title="Guardá tu rutina"
        subtitle="Queda como plantilla en tu biblioteca y podés asignarla a tus alumnos."
        variant="h2"
      />

      <Field
        label="NOMBRE DE LA RUTINA"
        value={routineName}
        onChangeText={setRoutineName}
        placeholder="Ej: Fuerza base — 4 días"
      />

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

      <Row
        title="Overload automático"
        meta={`+2,5 ${unit} por semana`}
        right={<Toggle value={autoOverload} onChange={setAutoOverload} label="Overload automático" />}
      />

      {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}

      <View style={styles.actions}>
        <Button
          label={count ? `Marcar como completada · ${count} ${count === 1 ? 'alumno' : 'alumnos'}` : 'Marcar como completada'}
          onPress={() => publish(true)}
        />
        {count ? (
          <Pressable onPress={() => publish(false)} accessibilityRole="button">
            <Txt variant="body" tone={color.textFaint} center>
              Solo guardar como plantilla
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  actions: { marginTop: 'auto', gap: 10, paddingTop: 16 },
});