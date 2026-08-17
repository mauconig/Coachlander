import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { assignTemplate, createTemplate } from '@/api/client';
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
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { useCreator } from '@/state/CreatorState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Los lunes del mes actual: { week, weekStart (YYYY-MM-DD), label } */
function monthWeeks(now: Date): { week: number; weekStart: string; label: string }[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const mondays: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (date.getDay() === 1) mondays.push(date);
  }
  if (!mondays.length) mondays.push(new Date(year, month, 1));

  return mondays.map((date, i) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      week: i + 1,
      weekStart: iso,
      label: `SEM ${i + 1} · ${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`,
    };
  });
}

/** 24 · Guardar y asignar — plantilla y/o alumnos, eligiendo la semana. */
export default function AssignCreatedRoutine() {
  const { getToken } = useAuth();
  const { unit } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const { routineName, setRoutineName, days, assignees, toggleAssignee, autoOverload, setAutoOverload, reset, preselectWeekStart } =
    useCreator();

  const clients = useQuery(getClients);
  const count = assignees.length;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const weeks = useMemo(() => monthWeeks(new Date()), []);
  const currentWeek = weeks.find((w) => w.weekStart === new Date().toISOString().slice(0, 10));
  const [selectedWeek, setSelectedWeek] = useState(currentWeek ?? weeks[0]);

  useEffect(() => {
    if (!preselectWeekStart) return;
    const preset = weeks.find((w) => w.weekStart === preselectWeekStart.slice(0, 10));
    if (preset) setSelectedWeek(preset);
  }, [preselectWeekStart, weeks]);

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
          week: selectedWeek.week,
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
        subtitle="Queda como plantilla en tu biblioteca y elegí la semana para tus alumnos."
        variant="h2"
      />

      <Field
        label="NOMBRE DE LA RUTINA"
        value={routineName}
        onChangeText={setRoutineName}
        placeholder="Ej: Fuerza base — 4 días"
      />

      {count ? (
        <View style={styles.group}>
          <Txt variant="label">¿PARA QUÉ SEMANA?</Txt>
          <View style={styles.chips}>
            {weeks.map((option) => (
              <Chip
                key={option.weekStart}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { marginTop: 'auto', gap: 10, paddingTop: 16 },
});