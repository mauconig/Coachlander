import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@clerk/expo';

import { assignTemplate, updateExercise, type UpdateExerciseInput } from '@/api/client';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Row } from '@/components/Row';
import { Sheet } from '@/components/Sheet';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClient, getRoutineById, getTemplates, weekIndexOf } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { Exercise, Routine } from '@/data/types';
import { num } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

type DraftExercise = Exercise & { reps: string };

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function repsFromScheme(scheme: string): string {
  const parts = scheme.split(/\s*[×x]\s*/);
  return parts[1]?.trim() || '8';
}

function draftFromRoutine(routine: Routine): DraftExercise[] {
  return routine.exercises.map((exercise) => ({ ...exercise, reps: repsFromScheme(exercise.scheme) }));
}

function stepReps(value: string, delta: number): string {
  const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const low = Math.max(1, Number(range[1]) + delta);
    const high = Math.max(low, Number(range[2]) + delta);
    return `${low}-${high}`;
  }
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? String(Math.max(1, number + delta)) : delta > 0 ? '1' : value;
}

function changedInput(exercise: DraftExercise, original: DraftExercise): UpdateExerciseInput | null {
  if (
    exercise.suggested === original.suggested &&
    exercise.sets === original.sets &&
    exercise.reps === original.reps &&
    exercise.rest === original.rest &&
    exercise.overload === original.overload
  ) {
    return null;
  }
  return {
    suggested: exercise.suggested,
    sets: exercise.sets,
    reps: exercise.reps,
    rest: exercise.rest,
    overload: exercise.overload,
  };
}

export default function RoutineDetail() {
  const { id: rawId, clientId: rawClientId, weekStart: rawWeekStart } = useLocalSearchParams<{
    id?: string | string[];
    clientId?: string | string[];
    weekStart?: string | string[];
  }>();
  const id = paramValue(rawId);
  const clientId = paramValue(rawClientId);
  const weekStart = paramValue(rawWeekStart);
  const { getToken } = useAuth();
  const { unit } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const routine = useQuery((data) => getRoutineById(data, id), [id]);
  const client = useQuery((data) => getClient(data, clientId), [clientId]);
  const templates = useQuery(getTemplates);
  const [draft, setDraft] = useState<DraftExercise[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(routine ? draftFromRoutine(routine) : null);
  }, [routine]);

  if (!routine) {
    return <AppLoadingScreen error title="No encontramos esta rutina" detail="Volvé a la ficha del alumno e intentá de nuevo." />;
  }

  const original = draftFromRoutine(routine);
  const exercises = draft ?? original;
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const changed = exercises.some((exercise, index) => changedInput(exercise, original[index]) !== null);
  const studentName = client?.name ?? 'Alumno';

  const patch = (exerciseId: string, changes: Partial<DraftExercise>) => {
    setDraft((current) =>
      (current ?? original).map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...changes } : exercise,
      ),
    );
    setError('');
  };

  const save = async () => {
    const updates = exercises
      .map((exercise, index) => changedInput(exercise, original[index]))
      .filter((input): input is UpdateExerciseInput => input !== null);
    if (!updates.length) return;

    setSaving(true);
    setError('');
    try {
      await Promise.all(
        exercises.map(async (exercise, index) => {
          const input = changedInput(exercise, original[index]);
          if (input) await updateExercise(getToken, exercise.id, input);
        }),
      );
      await refreshRemoteData();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const assignExisting = async (templateId: string) => {
    if (assigningId || !clientId || !weekStart) return;
    setAssigningId(templateId);
    try {
      await assignTemplate(getToken, templateId, {
        clientIds: [clientId],
        autoOverload: true,
        week: weekIndexOf(weekStart),
        weekStart,
        replace: true,
      });
      await refreshRemoteData();
      setChangeOpen(false);
      router.back();
    } catch (assignError: unknown) {
      Alert.alert(
        'No pudimos cambiar la rutina',
        assignError instanceof Error ? assignError.message : 'Probá nuevamente.',
      );
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <>
      <Screen
        scroll
        gap={14}
        footer={
          <View style={styles.footer}>
            {error ? <Txt variant="meta" tone={color.textSoft}>{error}</Txt> : null}
            <Button
              label={saving ? 'Guardando cambios…' : 'Guardar cambios'}
              disabled={saving || !changed}
              onPress={() => void save()}
            />
            <Pressable onPress={() => setChangeOpen(true)} accessibilityRole="button">
              <Txt variant="labelTight" tone={color.textFaint} center>
                CAMBIAR RUTINA
              </Txt>
            </Pressable>
          </View>
        }
      >
        <View style={styles.header}>
          <BackButton />
          <View style={styles.headerText}>
            <Txt variant="label" numberOfLines={1}>
              {`${studentName.toUpperCase()} · SEMANA ${routine.week} · DÍA ${routine.day}`}
            </Txt>
            <Txt variant="h4" style={styles.headerTitle} numberOfLines={1}>
              {routine.name}
            </Txt>
          </View>
        </View>

        <View style={styles.stats}>
          <StatTile compact value={`${routine.estimatedMinutes} min`} label="MIN" />
          <StatTile compact value={String(totalSets)} label="SERIES" />
          <StatTile compact value={`${routine.secondsPerSet} s`} label="POR SERIE" />
        </View>

        <View style={styles.list}>
          {exercises.map((exercise) => (
            <ExerciseEditor
              key={exercise.id}
              exercise={exercise}
              unit={unit}
              onPatch={(changes) => patch(exercise.id, changes)}
            />
          ))}
        </View>
      </Screen>

      <Sheet visible={changeOpen} onClose={() => setChangeOpen(false)} eyebrow="CAMBIAR RUTINA" title="Elegí una opción">
        <Pressable
          style={styles.newRoutine}
          onPress={() => router.push(`/crear/nuevo?clientId=${clientId}&weekStart=${weekStart}`)}
          accessibilityRole="button"
        >
          <Txt variant="rowTitle">Nueva rutina</Txt>
          <Txt variant="meta">Armala desde cero para este alumno.</Txt>
        </Pressable>
        <Txt variant="label" tone={color.textMuted}>
          PLANTILLAS EXISTENTES
        </Txt>
        {templates.map((template) => (
          <Row
            key={template.id}
            title={template.name}
            meta={template.meta}
            trailing={assigningId === template.id ? 'ASIGNANDO' : 'ASIGNAR'}
            trailingTone={assigningId === template.id ? color.lime : color.text}
            onPress={() => void assignExisting(template.id)}
          />
        ))}
      </Sheet>
    </>
  );
}

function ExerciseEditor({
  exercise,
  unit,
  onPatch,
}: {
  exercise: DraftExercise;
  unit: 'kg' | 'lb';
  onPatch: (changes: Partial<DraftExercise>) => void;
}) {
  return (
    <Card radius={radius.lg} padding={16} gap={12}>
      <View style={styles.exerciseHead}>
        <View style={styles.exerciseText}>
          <Txt variant="rowTitle">{exercise.name}</Txt>
          <Txt variant="meta" tone={color.textMuted}>{exercise.focus}</Txt>
        </View>
        <Txt variant="labelTight" tone={color.textFaint}>{exercise.cues}</Txt>
      </View>
      <View style={styles.steppers}>
        <Stepper label="SERIES" value={String(exercise.sets)} onStep={(delta) => onPatch({ sets: Math.max(1, exercise.sets + delta) })} />
        <Stepper label="REPS" value={exercise.reps} onStep={(delta) => onPatch({ reps: stepReps(exercise.reps, delta) })} />
        <Stepper label={unit.toUpperCase()} value={exercise.suggested ? num(exercise.suggested) : 'PC'} accent onStep={(delta) => onPatch({ suggested: Math.max(0, exercise.suggested + delta * 2.5) })} />
        <Stepper label="DESCANSO" value={`${exercise.rest}s`} onStep={(delta) => onPatch({ rest: Math.min(600, Math.max(20, exercise.rest + delta * 15)) })} />
      </View>
      <View style={styles.overload}>
        <Txt variant="meta" tone={color.textMuted}>{exercise.overload ? `Overload +${num(exercise.overload)} ${unit} / semana` : 'Sin overload automático'}</Txt>
      </View>
    </Card>
  );
}

function Stepper({
  label,
  value,
  onStep,
  accent,
}: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  accent?: boolean;
}) {
  return (
    <View style={[styles.stepper, accent && styles.stepperAccent]}>
      <Txt variant="metaSm" tone={accent ? color.lime : color.textMuted}>{label}</Txt>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`Bajar ${label}`}>
          <Txt variant="numeric" tone={color.textFaint}>−</Txt>
        </Pressable>
        <Txt variant="numeric" tone={accent ? color.lime : color.text}>{value}</Txt>
        <Pressable onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`Subir ${label}`}>
          <Txt variant="numeric" tone={color.textFaint}>+</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 22 },
  stats: { flexDirection: 'row', gap: 8 },
  list: { gap: 10 },
  exerciseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  exerciseText: { flex: 1, gap: 3 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: {
    width: '48%',
    backgroundColor: color.screen,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xs,
    padding: 11,
    gap: 4,
  },
  stepperAccent: { borderColor: color.lime },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overload: { borderTopWidth: 1, borderTopColor: color.border, paddingTop: 10 },
  footer: { gap: 10 },
  newRoutine: {
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 3,
  },
});
