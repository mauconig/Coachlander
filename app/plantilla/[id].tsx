import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { assignTemplate, deleteTemplate } from '@/api/client';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CoachLoadModePicker, type CoachLoadMode } from '@/components/CoachLoadModePicker';
import { Heading, SectionHeader } from '@/components/Note';
import { RadioDot, Toggle } from '@/components/Toggle';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import {
  getClients,
  getCurrentWeekStart,
  getNextWeekStart,
  getTemplateById,
  weekIndexOf,
} from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

type WeekOption = { key: 'this' | 'next'; label: string; weekStart: string };

export default function TemplateDetail() {
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const template = useQuery((data) => (id ? getTemplateById(data, id) : null), [id]);
  const [assignVisible, setAssignVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!template) {
    return (
      <Screen gap={16}>
        <TopBar title="RUTINA" />
        <Heading title="No encontramos esa rutina" subtitle="Volvé a la biblioteca y elegí otra plantilla." variant="h2" />
        <Button label="Volver a Rutinas" onPress={() => router.replace('/rutinas')} />
      </Screen>
    );
  }

  const totalExercises = template.days.reduce((sum, day) => sum + day.exercises.length, 0);
  const totalSets = template.days.reduce(
    (sum, day) => sum + day.exercises.reduce((daySum, exercise) => daySum + exercise.sets, 0),
    0,
  );

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar plantilla',
      `Se va a eliminar “${template.name}”. Las rutinas ya asignadas a alumnos no se modifican.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              setError('');
              try {
                await deleteTemplate(getToken, template.id);
                await refreshRemoteData();
                router.replace('/rutinas');
              } catch (deleteError: unknown) {
                setError(deleteError instanceof Error ? deleteError.message : 'No pudimos eliminar la plantilla.');
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (deleting) {
    return <AppLoadingScreen title="Eliminando plantilla" detail="Las rutinas asignadas quedan intactas." />;
  }

  return (
    <>
      <Screen scroll gap={16}>
        <TopBar title="RUTINA" />

        <Heading
          title={template.name}
          subtitle={template.assigned ? `Asignada a ${template.assigned}` : 'Todavía no asignada'}
          variant="h2"
        />

        <Card tone="violet" radius={radius.xxl} padding={18} gap={8}>
          <Txt variant="label" tone={color.onViolet}>
            RESUMEN
          </Txt>
          <Txt variant="h4">{`${template.days.length} días · ${totalExercises} ejercicios`}</Txt>
          <Txt variant="body" tone={color.onVioletStrong}>
            {`${totalSets} series · El descanso lo configura cada alumno`}
          </Txt>
        </Card>

        <View style={styles.actions}>
          <Button
            label="Editar rutina"
            onPress={() => router.push({ pathname: '/crear/editor', params: { templateId: template.id } })}
          />
          <Button label="Asignar a alumnos" variant="outline" onPress={() => setAssignVisible(true)} />
        </View>

        <View style={styles.days}>
          <SectionHeader title="CONTENIDO" />
          {template.days.map((day) => (
            <View key={day.day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Txt variant="label" tone={color.lime}>{`DÍA ${day.day}`}</Txt>
                <Txt variant="bodyStrong">{day.name}</Txt>
              </View>
              {day.exercises.map((exercise, index) => (
                <Row
                  key={exercise.id}
                  left={<Txt variant="labelTight" tone={color.lime}>{String(index + 1).padStart(2, '0')}</Txt>}
                  title={exercise.name}
                  meta={`${exercise.sets} × ${exercise.reps}${exercise.loadKg !== null ? ` · ${exercise.loadKg} kg` : ''}`}
                />
              ))}
            </View>
          ))}
        </View>

        {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}

        <Button label="Eliminar plantilla" variant="ghost" onPress={confirmDelete} />
      </Screen>

      <AssignTemplateSheet
        visible={assignVisible}
        templateId={template.id}
        onClose={() => setAssignVisible(false)}
      />
    </>
  );
}

function AssignTemplateSheet({
  visible,
  templateId,
  onClose,
}: {
  visible: boolean;
  templateId: string;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const clients = useQuery(getClients);
  const [autoOverload, setAutoOverload] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadMode, setLoadMode] = useState<CoachLoadMode>('ai');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const weekOptions: WeekOption[] = [
    { key: 'this', label: 'ESTA SEMANA', weekStart: getCurrentWeekStart() },
    { key: 'next', label: 'SIGUIENTE SEMANA', weekStart: getNextWeekStart() },
  ];
  const [week, setWeek] = useState<WeekOption>(weekOptions[0]);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setError('');
  }, [visible]);

  const toggle = (clientId: string) => {
    setSelected((current) => (current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId]));
  };

  const save = async () => {
    if (!selected.length) {
      setError('Elegí al menos un alumno.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await assignTemplate(getToken, templateId, {
        clientIds: selected,
        autoOverload: true,
        loadMode,
        week: weekIndexOf(week.weekStart),
        weekStart: week.weekStart,
        replace: true,
      });
      await refreshRemoteData();
      onClose();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos asignar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="PLANTILLA" title="Asignar a alumnos">
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sheetGroup}>
          <Txt variant="label">¿PARA QUÉ SEMANA?</Txt>
          <View style={styles.chips}>
            {weekOptions.map((option) => (
              <Chip key={option.key} label={option.label} selected={option.key === week.key} onPress={() => setWeek(option)} />
            ))}
          </View>
        </View>

        <View style={styles.sheetGroup}>
          <Txt variant="label">ALUMNOS</Txt>
          {clients.map((client) => {
            const isSelected = selected.includes(client.id);
            return (
              <Row
                key={client.id}
                tone={isSelected ? 'violet' : 'surface'}
                left={<Avatar name={client.name} size={36} tone={isSelected ? 'ink' : 'neutral'} />}
                title={client.name}
                right={<RadioDot selected={isSelected} />}
                onPress={() => toggle(client.id)}
              />
            );
          })}
        </View>

        <CoachLoadModePicker value={loadMode} onChange={setLoadMode} />

        <Row
          title="Progresión automática"
          meta="Se aplica a las rutinas nuevas"
          right={<Toggle value={autoOverload} onChange={setAutoOverload} label="Progresión automática" />}
        />

        {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}
        <Button label={saving ? 'Asignando…' : 'Asignar rutina'} onPress={() => void save()} disabled={saving} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 9 },
  days: { gap: 12 },
  daySection: { gap: 8 },
  dayHeader: { gap: 3, paddingHorizontal: 4, paddingTop: 8 },
  sheetScroll: { maxHeight: 560 },
  sheetContent: { gap: 15, paddingBottom: 4 },
  sheetGroup: { gap: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
