import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { saveImportedRoutine } from '@/api/client';
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
import { useImport } from '@/state/ImportState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color } from '@/theme/tokens';

/** 18 · Guardar y asignar — the last step of the import. */
export default function AssignRoutine() {
  const { getToken } = useAuth();
  const { role, unit } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const {
    routineName,
    detected,
    setRoutineName,
    assignees,
    toggleAssignee,
    autoOverload,
    setAutoOverload,
    reset,
  } = useImport();

  const clients = useQuery(getClients);
  const isCoach = role === 'coach';
  const count = assignees.length;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const publish = async () => {
    if (!detected.length) {
      setError('No hay ejercicios para guardar. Volvé a revisar la rutina.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const dayNumbers = [...new Set(detected.map((exercise) => exercise.day))].sort((a, b) => a - b);
      if (dayNumbers.length < 1 || dayNumbers.length > 7) {
        setError('La rutina debe tener entre 1 y 7 días antes de guardarla.');
        setSaving(false);
        return;
      }
      const days = dayNumbers.map((day) => {
        const exercises = detected.filter((exercise) => exercise.day === day);
        return {
          day,
          name: exercises[0]?.dayName ?? `Día ${day}`,
          exercises,
        };
      });

      await saveImportedRoutine(getToken, { routineName, days, autoOverload });
      await refreshRemoteData({ force: true });
      reset();
      router.dismissAll();
      router.replace(isCoach ? '/rutinas' : '/hoy');
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
        detail="Estamos preparando tus días para que puedas entrenar."
      />
    );
  }

  return (
    <Screen scroll gap={15}>
      <TopBar title="ÚLTIMO PASO" />

      <Heading
        title={isCoach ? '¿Para quién es esta rutina?' : 'Guardá tu rutina'}
        subtitle={
          isCoach
            ? 'Como entrenadora podés asignarla a uno o varios alumnos.'
            : 'Queda en tu plan y la vas a ver en Hoy.'
        }
        variant="h2"
      />

      <Field label="NOMBRE DE LA RUTINA" value={routineName} onChangeText={setRoutineName} />

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
        right={
          <Toggle value={autoOverload} onChange={setAutoOverload} label="Overload automático" />
        }
      />

      {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}

      <View style={styles.actions}>
        <Button
          label={
            isCoach
              ? count === 0
                ? 'Guardar como plantilla'
                : `Publicar para ${count} ${count === 1 ? 'alumno' : 'alumnos'}`
              : 'Guardar en mi plan'
          }
          onPress={publish}
        />
        {isCoach ? (
          <Pressable onPress={publish} accessibilityRole="button">
            <Txt variant="body" tone={color.textFaint} center>
              Guardar como plantilla sin asignar
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
