import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { assignTemplate, updateRoutine, type UpdateRoutineInput } from '@/api/client';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachLoadModePicker, type CoachLoadMode } from '@/components/CoachLoadModePicker';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/Note';
import { Sheet } from '@/components/Sheet';
import { StatTile } from '@/components/StatTile';
import { BackButton } from '@/components/TopBar';
import { Toggle } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { getClient, getCurrentWeekStart, getExercises, getOverloadRows, getRoutineById, getTemplates, weekIndexOf } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { Exercise, OverloadRow } from '@/data/types';
import { num } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, hitSlop, radius } from '@/theme/tokens';

type DraftExercise = Exercise & {
  reps: string;
  /** null means the row will be created when the routine is saved. */
  persistedId: string | null;
};

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function repsFromScheme(scheme: string): string {
  const parts = scheme.split(/\s*(?:\u00d7|x)\s*/i);
  return parts[1]?.trim() || '8';
}

function draftFromExercise(exercise: Exercise): DraftExercise {
  return {
    ...exercise,
    reps: repsFromScheme(exercise.scheme),
    persistedId: exercise.id,
  };
}

function draftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftFromCatalog(exercise: Exercise): DraftExercise {
  return {
    ...exercise,
    id: draftId(),
    reps: repsFromScheme(exercise.scheme),
    persistedId: null,
  };
}

function blankDraft(focus: string): DraftExercise {
  return {
    id: draftId(),
    persistedId: null,
    name: '',
    scheme: '3 \u00d7 8',
    suggested: 0,
    sets: 3,
    work: 30,
    rest: 90,
    focus,
    cues: '',
    overload: null,
    loadSource: 'coach',
    loadReason: 'Carga definida por el entrenador.',
    progressionMetric: 'load',
    targetReps: 8,
    reps: '8',
  };
}

function exerciseFingerprint(exercise: DraftExercise): string {
  return JSON.stringify({
    id: exercise.persistedId,
    name: exercise.name.trim(),
    sets: exercise.sets,
    reps: exercise.reps.trim(),
    suggested: exercise.suggested,
    overload: exercise.overload,
    work: exercise.work,
    focus: exercise.focus.trim(),
    cues: exercise.cues.trim(),
  });
}

function draftFingerprint(exercises: DraftExercise[]): string {
  return JSON.stringify(exercises.map(exerciseFingerprint));
}

function countChanges(current: DraftExercise[], original: DraftExercise[]): number {
  const length = Math.max(current.length, original.length);
  let count = 0;
  for (let index = 0; index < length; index += 1) {
    if (!current[index] || !original[index] || exerciseFingerprint(current[index]) !== exerciseFingerprint(original[index])) {
      count += 1;
    }
  }
  return count;
}

function routinePayload(exercises: DraftExercise[]): UpdateRoutineInput {
  return {
    exercises: exercises.map((exercise) => ({
      ...(exercise.persistedId ? { id: exercise.persistedId } : {}),
      name: exercise.name.trim(),
      sets: exercise.sets,
      reps: exercise.reps.trim(),
      suggested: exercise.suggested,
      overload: exercise.overload,
      work: exercise.work,
      focus: exercise.focus.trim(),
      cues: exercise.cues.trim(),
    })),
  };
}

function routineTitle(name: string): string {
  return name.split(' · ')[0]?.trim() || name;
}

function dayTitle(name: string, day: number): string {
  return name.split(' · ').slice(1).join(' · ').trim() || `Día ${day}`;
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
  const progressionByExercise = useQuery((data) => {
    const result: Record<string, OverloadRow | undefined> = {};
    for (const exercise of routine?.exercises ?? []) {
      const rows = getOverloadRows(data, exercise.id);
      result[exercise.id] = rows[rows.length - 1];
    }
    return result;
  }, [routine?.id]);
  const templates = useQuery(getTemplates);
  const catalog = useQuery(getExercises);
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [loadMode, setLoadMode] = useState<CoachLoadMode>('ai');

  useEffect(() => {
    if (!routine) return;
    const next = routine.exercises.map(draftFromExercise);
    setDraft(next);
    setBaseline(draftFingerprint(next));
    setError('');
  }, [routine]);

  if (!routine) {
    return <AppLoadingScreen error title="No encontramos esta rutina" detail="Volvé a la ficha del alumno e intentá de nuevo." />;
  }

  const original = routine.exercises.map(draftFromExercise);
  const exercises = baseline !== null ? draft : original;
  const editingExercise = exercises.find((exercise) => exercise.id === editingId) ?? null;
  const dirty = baseline !== null && draftFingerprint(exercises) !== baseline;
  const pendingChanges = countChanges(exercises, original);
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const studentName = client?.name ?? 'Alumno';
  const weekLabel = weekStart === getCurrentWeekStart() ? 'ESTA SEMANA' : `SEMANA ${routine.week}`;
  const title = routineTitle(routine.name);
  const day = dayTitle(routine.name, routine.day);

  const patchExercise = (next: DraftExercise) => {
    setDraft((current) => current.map((exercise) => (exercise.id === next.id ? next : exercise)));
    setError('');
  };

  const removeExercise = (exerciseId: string) => {
    if (exercises.length <= 1) {
      Alert.alert('La rutina necesita un ejercicio', 'Agregá otro ejercicio antes de eliminar este.');
      return;
    }

    setEditingId(null);
    Alert.alert('Eliminar ejercicio', 'Se quitará de esta rutina de este alumno.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setDraft((current) => current.filter((exercise) => exercise.id !== exerciseId));
          setError('');
        },
      },
    ]);
  };

  const addExercise = (next: DraftExercise) => {
    setDraft((current) => [...current, next]);
    setAddOpen(false);
    setEditingId(next.id);
    setError('');
  };

  const moveExercise = (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= exercises.length) return;
    setDraft((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
    setError('');
  };

  const save = async () => {
    if (!dirty || saving) return;
    const invalid = exercises.find((exercise) => !exercise.name.trim());
    if (invalid) {
      setEditingId(invalid.id);
      setError('Completá el nombre de cada ejercicio antes de guardar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateRoutine(getToken, routine.id, routinePayload(exercises));
      await refreshRemoteData();
      setEditingId(null);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar la rutina.');
    } finally {
      setSaving(false);
    }
  };

  const assignExisting = async (templateId: string, selectedLoadMode: CoachLoadMode) => {
    if (assigningId || !clientId || !weekStart) return;
    setAssigningId(templateId);
    try {
      await assignTemplate(getToken, templateId, {
        clientIds: [clientId],
        autoOverload: true,
        loadMode: selectedLoadMode,
        week: weekIndexOf(weekStart),
        weekStart,
        replace: true,
      });
      await refreshRemoteData();
      setChangeOpen(false);
      setPendingTemplateId(null);
      router.back();
    } catch (assignError: unknown) {
      Alert.alert('No pudimos cambiar la rutina', assignError instanceof Error ? assignError.message : 'Probá nuevamente.');
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <>
      <Screen
        scroll
        gap={16}
        footer={
          <View style={styles.footer}>
            {error ? <TxtMessage>{error}</TxtMessage> : null}
            <View style={styles.saveRow}>
              <View style={styles.saveStatus}>
                <Txt variant="labelTight" tone={dirty ? color.lime : color.textMuted}>
                  {dirty ? `${pendingChanges} ${pendingChanges === 1 ? 'CAMBIO' : 'CAMBIOS'} PENDIENTES` : 'SIN CAMBIOS'}
                </Txt>
              </View>
              <Button
                label={saving ? 'Guardando…' : 'Guardar cambios'}
                disabled={!dirty || saving}
                onPress={() => void save()}
                style={styles.saveButton}
              />
            </View>
            <Pressable onPress={() => setChangeOpen(true)} accessibilityRole="button" hitSlop={hitSlop}>
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
              {`${studentName.toUpperCase()} · ${weekLabel} · DÍA ${routine.day}`}
            </Txt>
            <Txt variant="h2" style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Txt>
          </View>
        </View>

        <Card tone="muted" padding={16} gap={14} radius={radius.xl}>
          <View style={styles.dayLine}>
            <View style={styles.dayMark}>
              <Txt variant="labelTight" tone={color.ink}>{`DÍA ${routine.day}`}</Txt>
            </View>
            <View style={styles.dayCopy}>
              <Txt variant="rowTitle">{day}</Txt>
              <Txt variant="meta" tone={color.textMuted}>Ajustes exclusivos para {studentName}</Txt>
            </View>
          </View>
          <View style={styles.loadAudit}>
            <Txt variant="labelTight" tone={routine.loadMode === 'ai' ? color.violet : color.lime}>
              {routine.loadMode === 'ai' ? 'CARGAS CALCULADAS POR IA' : 'CARGAS DEFINIDAS POR EL ENTRENADOR'}
            </Txt>
            <Txt variant="meta" tone={color.textMuted}>
              Cada ejercicio conserva la última actuación y el motivo de la próxima recomendación.
            </Txt>
          </View>
          <View style={styles.stats}>
            <StatTile compact value={`${routine.estimatedMinutes} min`} label="DURACIÓN" />
            <StatTile compact value={String(totalSets)} label="SERIES" />
            <StatTile compact value={String(exercises.length)} label="EJERCICIOS" />
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <SectionHeader title="EJERCICIOS" trailing={`${exercises.length} EN TOTAL`} />
          <Txt variant="meta" tone={color.textMuted}>Tocá uno para editarlo</Txt>
        </View>

        <View style={styles.list}>
          {exercises.map((exercise, index) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={exercises.length}
              unit={unit}
              progression={progressionByExercise[exercise.id]}
              onPress={() => setEditingId(exercise.id)}
              onMove={(delta) => moveExercise(index, delta)}
            />
          ))}
        </View>

        <Pressable style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]} onPress={() => setAddOpen(true)}>
          <View style={styles.addIcon}>
            <Icon name="plus" size={18} tone={color.ink} weight={2.6} />
          </View>
          <View style={styles.addCopy}>
            <Txt variant="rowTitle">Agregar ejercicio</Txt>
            <Txt variant="meta" tone={color.textMuted}>Buscá en el catálogo o creá uno nuevo</Txt>
          </View>
          <Icon name="chevron-right" size={17} tone={color.textMuted} />
        </Pressable>
      </Screen>

      <ExerciseEditSheet
        visible={!!editingExercise}
        exercise={editingExercise}
        unit={unit}
        onClose={() => setEditingId(null)}
        onApply={patchExercise}
        onDelete={removeExercise}
      />

      <AddExerciseSheet
        visible={addOpen}
        catalog={catalog}
        focus={routine.block}
        onClose={() => setAddOpen(false)}
        onAdd={addExercise}
      />

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
            onPress={() => setPendingTemplateId(template.id)}
          />
        ))}
      </Sheet>

      <Sheet
        visible={!!pendingTemplateId}
        onClose={() => setPendingTemplateId(null)}
        eyebrow="CAMBIAR RUTINA"
        title="¿Quién define las cargas?"
      >
        <CoachLoadModePicker value={loadMode} onChange={setLoadMode} />
        <Button
          label={assigningId ? 'Asignando…' : 'Continuar'}
          onPress={() => pendingTemplateId && void assignExisting(pendingTemplateId, loadMode)}
          disabled={!!assigningId}
        />
      </Sheet>
    </>
  );
}

function TxtMessage({ children }: { children: string }) {
  return (
    <Txt variant="meta" tone={color.textSoft}>
      {children}
    </Txt>
  );
}

function ExerciseRow({
  exercise,
  index,
  total,
  unit,
  progression,
  onPress,
  onMove,
}: {
  exercise: DraftExercise;
  index: number;
  total: number;
  unit: 'kg' | 'lb';
  progression?: OverloadRow;
  onPress: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const load = exercise.suggested > 0 ? `${num(exercise.suggested)} ${unit}` : 'PC';
  const progressionLabel = progression
    ? exercise.progressionMetric === 'load'
      ? `Última ${num(progression.lastLoad)} ${unit} → próxima ${num(progression.nextLoad)} ${unit}`
      : `Último ${progression.lastReps}${exercise.progressionMetric === 'seconds' ? ' s' : ' reps'} → próximo ${progression.nextReps}${exercise.progressionMetric === 'seconds' ? ' s' : ' reps'}`
    : 'Todavía no hay una actuación registrada';
  return (
    <View style={styles.exerciseRow}>
      <Pressable style={({ pressed }) => [styles.exerciseMain, pressed && styles.pressed]} onPress={onPress}>
        <View style={styles.exerciseIndex}>
          <Txt variant="labelTight" tone={color.violet}>{String(index + 1).padStart(2, '0')}</Txt>
        </View>
        <View style={styles.exerciseCopy}>
          <Txt variant="metaSm" tone={exercise.loadSource === 'ai' ? color.violet : color.textFaint} numberOfLines={1}>
            {`${exercise.loadSource === 'ai' ? 'IA' : 'ENTRENADOR'} · ${exercise.loadReason || 'Carga definida en el plan.'}`}
          </Txt>
          <Txt variant="metaSm" tone={color.textMuted} numberOfLines={1}>{progressionLabel}</Txt>
          <Txt variant="rowTitle" numberOfLines={1}>{exercise.name || 'Ejercicio sin nombre'}</Txt>
          <Txt variant="meta" tone={color.textMuted} numberOfLines={1}>
            {`${exercise.sets} series · ${exercise.reps} reps · ${load}`}
          </Txt>
        </View>
        <Icon name="chevron-right" size={17} tone={color.textFaint} />
      </Pressable>
      <View style={styles.reorderBar}>
        <Icon name="grip" size={17} tone={color.textFaint} />
        <Txt variant="metaSm" tone={color.textFaint}>ORDEN</Txt>
        <View style={styles.reorderActions}>
          <MoveButton direction="up" disabled={index === 0} onPress={() => onMove(-1)} />
          <MoveButton direction="down" disabled={index === total - 1} onPress={() => onMove(1)} />
        </View>
      </View>
    </View>
  );
}

function MoveButton({ direction, disabled, onPress }: { direction: 'up' | 'down'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Subir ejercicio' : 'Bajar ejercicio'}
      style={({ pressed }) => [styles.moveButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={{ transform: [{ rotate: direction === 'up' ? '-90deg' : '90deg' }] }}>
        <Icon name="chevron-right" size={15} tone={disabled ? color.textFaint : color.textMuted} />
      </View>
    </Pressable>
  );
}

function ExerciseEditSheet({
  visible,
  exercise,
  unit,
  onClose,
  onApply,
  onDelete,
}: {
  visible: boolean;
  exercise: DraftExercise | null;
  unit: 'kg' | 'lb';
  onClose: () => void;
  onApply: (exercise: DraftExercise) => void;
  onDelete: (exerciseId: string) => void;
}) {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [cues, setCues] = useState('');
  const [overloadEnabled, setOverloadEnabled] = useState(false);
  const [overload, setOverload] = useState('2.5');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!exercise || !visible) return;
    setName(exercise.name);
    setSets(String(exercise.sets));
    setReps(exercise.reps);
    setLoad(String(exercise.suggested));
    setCues(exercise.cues);
    setOverloadEnabled(exercise.overload !== null);
    setOverload(String(exercise.overload ?? 2.5));
    setValidationError('');
  }, [exercise, visible]);

  if (!exercise) return null;

  const apply = () => {
    const parsedSets = Number(sets);
    const parsedLoad = Number(load || 0);
    const parsedOverload = Number(overload);
    const nextReps = reps.trim() || '8';

    if (!name.trim()) return setValidationError('El ejercicio necesita un nombre.');
    if (!Number.isInteger(parsedSets) || parsedSets < 1 || parsedSets > 20) {
      return setValidationError('Las series deben estar entre 1 y 20.');
    }
    if (!Number.isFinite(parsedLoad) || parsedLoad < 0 || parsedLoad > 500) {
      return setValidationError('La carga debe estar entre 0 y 500.');
    }
    if (overloadEnabled && (!Number.isFinite(parsedOverload) || parsedOverload <= 0 || parsedOverload > 50)) {
      return setValidationError('El incremento debe estar entre 0 y 50.');
    }

    onApply({
      ...exercise,
      name: name.trim(),
      scheme: `${parsedSets} \u00d7 ${nextReps}`,
      sets: parsedSets,
      reps: nextReps,
      suggested: Math.round(parsedLoad * 2) / 2,
      cues: cues.trim(),
      overload: overloadEnabled ? Math.round(parsedOverload * 2) / 2 : null,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="EDITAR EJERCICIO" title={exercise.name || 'Nuevo ejercicio'}>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field label="NOMBRE" value={name} onChangeText={setName} autoCapitalize="sentences" autoFocus={visible} />
        <View style={styles.fieldRow}>
          <Field label="SERIES" value={sets} onChangeText={setSets} keyboardType="number-pad" style={styles.halfField} />
          <Field label="REPETICIONES" value={reps} onChangeText={setReps} keyboardType="numbers-and-punctuation" style={styles.halfField} />
        </View>
        <Field label={unit.toUpperCase()} value={load} onChangeText={setLoad} keyboardType="decimal-pad" suffix={unit} />
        <Field
          label="INDICACIONES"
          value={cues}
          onChangeText={setCues}
          placeholder="Técnica, tempo o nota para el alumno"
          multiline
          autoCapitalize="sentences"
        />

        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Txt variant="rowTitle">Overload automático</Txt>
            <Txt variant="meta" tone={color.textMuted}>Subida semanal de carga</Txt>
          </View>
          <Toggle value={overloadEnabled} onChange={setOverloadEnabled} label="Overload automático" />
        </View>
        {overloadEnabled ? (
          <Field label="INCREMENTO SEMANAL" value={overload} onChangeText={setOverload} keyboardType="decimal-pad" suffix={unit} />
        ) : null}

        {validationError ? <Txt variant="meta" tone={color.textSoft}>{validationError}</Txt> : null}

        <Button label="Aplicar cambios" onPress={apply} style={styles.sheetButton} />
        <Pressable onPress={() => onDelete(exercise.id)} accessibilityRole="button" hitSlop={hitSlop}>
          <Txt variant="labelTight" tone={color.textSoft} center>ELIMINAR EJERCICIO</Txt>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function AddExerciseSheet({
  visible,
  catalog,
  focus,
  onClose,
  onAdd,
}: {
  visible: boolean;
  catalog: Exercise[];
  focus: string;
  onClose: () => void;
  onAdd: (exercise: DraftExercise) => void;
}) {
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setManualName('');
    }
  }, [visible]);

  const filtered = catalog
    .filter((exercise) => exercise.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 16);

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="AGREGAR EJERCICIO" title="Sumá un ejercicio">
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field
          label="BUSCAR EN CATÁLOGO"
          value={query}
          onChangeText={setQuery}
          placeholder="Ej: sentadilla, press, remo"
          autoCapitalize="none"
          autoFocus={visible}
        />
        {filtered.length ? (
          <View style={styles.catalogList}>
            <SectionHeader title="CATÁLOGO" />
            {filtered.map((exercise) => (
              <Row
                key={exercise.id}
                title={exercise.name}
                meta={`${exercise.sets} series · ${repsFromScheme(exercise.scheme)} reps`}
                right={<Icon name="plus" size={17} tone={color.lime} />}
                onPress={() => onAdd(draftFromCatalog(exercise))}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.manualDivider}>
          <View style={styles.rule} />
          <Txt variant="label" tone={color.textFaint}>O CREALO</Txt>
          <View style={styles.rule} />
        </View>
        <Field
          label="NOMBRE NUEVO"
          value={manualName}
          onChangeText={setManualName}
          placeholder="Ej: Press inclinado con mancuernas"
          autoCapitalize="sentences"
        />
        <Button
          label="Agregar ejercicio nuevo"
          variant="outline"
          disabled={!manualName.trim()}
          onPress={() => onAdd({ ...blankDraft(focus), name: manualName.trim() })}
        />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 3 },
  headerTitle: { fontSize: 26 },
  dayLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayMark: {
    backgroundColor: color.lime,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dayCopy: { flex: 1, gap: 3 },
  stats: { flexDirection: 'row', gap: 8 },
  loadAudit: { gap: 4, paddingTop: 2 },
  sectionHeader: { gap: 7 },
  list: { gap: 9 },
  exerciseRow: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  exerciseMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  exerciseIndex: {
    width: 34,
    height: 34,
    borderRadius: radius.xs,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseCopy: { flex: 1, gap: 4 },
  reorderBar: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  reorderActions: { flexDirection: 'row', gap: 5, marginLeft: 'auto' },
  moveButton: {
    width: 32,
    height: 30,
    borderRadius: radius.xs,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    backgroundColor: color.surfaceAlt,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.xs,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCopy: { flex: 1, gap: 3 },
  footer: { gap: 10 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveStatus: { flex: 1, gap: 3 },
  saveButton: { flex: 1.3 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
  },
  toggleCopy: { flex: 1, gap: 3 },
  sheetScroll: { maxHeight: 560 },
  sheetContent: { gap: 15, paddingBottom: 4 },
  sheetButton: { marginTop: 2 },
  catalogList: { gap: 8 },
  manualDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  rule: { flex: 1, height: 1, backgroundColor: color.border },
  newRoutine: {
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 3,
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.78 },
});
