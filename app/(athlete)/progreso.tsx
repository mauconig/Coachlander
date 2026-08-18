import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AthleteProgressChart } from '@/components/AthleteProgressChart';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import type { AthleteProgressRange } from '@/db/queries';
import { getAthleteExerciseProgress, getOverloadRows, getProgressMuscles } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { num } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { color } from '@/theme/tokens';

const RANGES = ['6 SEMANAS', '3 MESES', 'TODO'] as const;
type Range = (typeof RANGES)[number];
const DISPLAY_MODES = ['PROGRESO REAL', 'COMPARAR OBJETIVO'] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number];

export default function Progress() {
  const { unit } = useApp();
  const [range, setRange] = useState<Range>('6 SEMANAS');
  const [selectedMuscleKey, setSelectedMuscleKey] = useState<string | null>(null);
  const [selectedExerciseKey, setSelectedExerciseKey] = useState<string | null>(null);
  const [exerciseSheetOpen, setExerciseSheetOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('PROGRESO REAL');

  const muscles = useQuery(getProgressMuscles);
  const selectedMuscle = muscles.find((muscle) => muscle.key === selectedMuscleKey) ?? null;
  const exerciseOptions = selectedMuscle?.exercises ?? [];
  const selectedExercise = exerciseOptions.find((exercise) => exercise.key === selectedExerciseKey) ?? null;
  const progress = useQuery(
    (data) => selectedExercise ? getAthleteExerciseProgress(data, selectedExercise.key, range as AthleteProgressRange) : null,
    [selectedExercise?.key, range],
  );
  const overloadRows = useQuery(
    (data) => selectedExercise ? getOverloadRows(data, selectedExercise.id) : [],
    [selectedExercise?.id],
  );

  const selectMuscle = (key: string) => {
    setSelectedMuscleKey(key);
    setSelectedExerciseKey(null);
    setDisplayMode('PROGRESO REAL');
  };

  if (!muscles.length) return <ScreenEmpty />;

  const latestRow = overloadRows[overloadRows.length - 1];
  const latestPoint = progress ? progress.points[progress.points.length - 1] ?? null : null;
  const bestValue = progress?.points.reduce<number | null>((best, point) => {
    if (point.value === null) return best;
    return best === null ? point.value : Math.max(best, point.value);
  }, null) ?? null;

  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">PROGRESO</Txt>
        <Txt variant="h2">Seguí tu evolución</Txt>
      </View>

      <View style={styles.selectorBlock}>
        <Txt variant="eyebrow">MÚSCULO</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {muscles.map((muscle) => (
            <Chip
              key={muscle.key}
              label={muscle.label}
              selected={muscle.key === selectedMuscleKey}
              tone="violet"
              mono={false}
              onPress={() => selectMuscle(muscle.key)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.selectorBlock}>
        <Txt variant="eyebrow">EJERCICIO</Txt>
        <Card
          tone={selectedMuscle ? 'surface' : 'muted'}
          padding={15}
          onPress={selectedMuscle ? () => setExerciseSheetOpen(true) : undefined}
          style={!selectedMuscle ? styles.disabledField : undefined}
        >
          <View style={styles.exerciseField}>
            <View style={styles.exerciseFieldText}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {selectedExercise?.name ?? (selectedMuscle ? 'Elegí un ejercicio trabajado' : 'Primero elegí un músculo')}
              </Txt>
              <Txt variant="meta" tone={color.textMuted}>
                {selectedExercise ? `${selectedExercise.sessions} sesiones · última ${selectedExercise.lastDate}` : selectedMuscle ? `${exerciseOptions.length} ejercicios con historial` : 'El selector se habilita después'}
              </Txt>
            </View>
            <Txt variant="labelTight" tone={selectedMuscle ? color.lime : color.textFaint}>CAMBIAR</Txt>
          </View>
        </Card>
      </View>

      {!selectedExercise ? (
        <Card tone="muted" padding={22} style={styles.waitingCard}>
          <Txt variant="bodyLg" tone={color.textMuted} center>
            {selectedMuscle ? 'Elegí un ejercicio para ver tu progreso.' : 'Elegí un músculo para comenzar.'}
          </Txt>
        </Card>
      ) : (
        <>
          <ChipGroup options={RANGES} value={range} onChange={setRange} />

          {progress?.points.length ? (
            <>
              <Card tone="violet" padding={18} style={styles.summaryCard}>
                <View style={styles.summaryColumn}>
                  <Txt variant="label" tone={color.onViolet}>MEJOR MARCA</Txt>
                  <Txt variant="hero" style={styles.summaryValue}>
                    {bestValue === null ? '—' : formatValue(bestValue, progress, unit)}
                  </Txt>
                </View>
                <View style={styles.summaryColumnRight}>
                  <Txt variant="label" tone={color.onViolet}>ÚLTIMA SESIÓN</Txt>
                  <Txt variant="h4" tone={color.lime}>{latestPoint?.date ?? '—'}</Txt>
                  <Txt variant="meta" tone={color.onViolet}>{progress.exercise.targetReps ? `${progress.exercise.targetReps} objetivo` : 'sin objetivo de reps'}</Txt>
                </View>
              </Card>

              <Card padding={16} gap={12}>
                <View style={styles.chartHeader}>
                  <View style={styles.chartTitle}>
                    <Txt variant="eyebrow">PROGRESO POR SESIÓN</Txt>
                    <Txt variant="meta" tone={color.textMuted}>Una marca por cada rutina completada</Txt>
                  </View>
                  {progress.goal ? (
                    <ChipGroup options={DISPLAY_MODES} value={displayMode} onChange={setDisplayMode} tone="violet" mono={false} />
                  ) : null}
                </View>
                <AthleteProgressChart
                  progress={progress}
                  unit={unit}
                  compareGoal={displayMode === 'COMPARAR OBJETIVO'}
                />
                {!progress.goal ? <Txt variant="meta" tone={color.textMuted}>Tu entrenador todavía no definió un objetivo para este ejercicio.</Txt> : null}
              </Card>

              <RecentSessions progress={progress} unit={unit} />

              <Card tone="muted" padding={16} gap={7}>
                <View style={styles.auditHeader}>
                  <Txt variant="eyebrow">PRÓXIMA RECOMENDACIÓN</Txt>
                  <Txt variant="labelTight" tone={selectedExercise.loadSource === 'ai' ? color.violetSoft : color.lime}>
                    {selectedExercise.loadSource === 'ai' ? 'IA' : 'ENTRENADOR'}
                  </Txt>
                </View>
                <Txt variant="bodyStrong">{recommendationLabel(selectedExercise, latestRow, unit, progress)}</Txt>
                <Txt variant="meta" tone={color.textMuted}>{selectedExercise.loadReason || 'Carga definida en el plan.'}</Txt>
              </Card>
            </>
          ) : (
            <Card tone="muted" padding={22} style={styles.waitingCard}>
              <Txt variant="bodyLg" tone={color.textMuted} center>
                No hay sesiones de este ejercicio dentro del rango elegido.
              </Txt>
            </Card>
          )}
        </>
      )}

      <ExercisePickerSheet
        visible={exerciseSheetOpen}
        muscleName={selectedMuscle?.label ?? ''}
        exercises={exerciseOptions}
        selectedKey={selectedExerciseKey}
        onClose={() => setExerciseSheetOpen(false)}
        onSelect={(key) => {
          setSelectedExerciseKey(key);
          setDisplayMode('PROGRESO REAL');
          setExerciseSheetOpen(false);
        }}
      />
    </Screen>
  );
}

function ScreenEmpty() {
  return (
    <Screen scroll gap={16}>
      <View style={styles.heading}>
        <Txt variant="eyebrow">PROGRESO</Txt>
        <Txt variant="h2">Todavía no hay progreso</Txt>
      </View>
      <View style={styles.emptyState}>
        <Txt variant="bodyLg" tone={color.textMuted} center>
          Cuando completes una rutina y registres tu primer set, acá vas a poder elegir un músculo y seguir tus avances.
        </Txt>
      </View>
    </Screen>
  );
}

function RecentSessions({ progress, unit }: { progress: NonNullable<ReturnType<typeof getAthleteExerciseProgress>>; unit: 'kg' | 'lb' }) {
  return (
    <Card tone="muted" padding={16} gap={4}>
      <Txt variant="eyebrow">ÚLTIMAS SESIONES</Txt>
      {progress.points.slice().reverse().slice(0, 5).map((point, index) => (
        <View key={`${point.date}-${index}`} style={styles.sessionRow}>
          <View>
            <Txt variant="bodyStrong">{point.date}</Txt>
            <Txt variant="meta" tone={color.textMuted}>{point.reps ? `${point.reps} reps reales` : 'Sin repeticiones registradas'}</Txt>
          </View>
          <Txt variant="labelTight" tone={point.value === null ? color.textMuted : color.lime}>
            {point.value === null ? 'NO ALCANZÓ' : formatValue(point.value, progress, unit)}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

function ExercisePickerSheet({
  visible,
  muscleName,
  exercises,
  selectedKey,
  onClose,
  onSelect,
}: {
  visible: boolean;
  muscleName: string;
  exercises: Array<{ key: string; name: string; sessions: number; lastDate: string }>;
  selectedKey: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="EJERCICIOS TRABAJADOS" title={muscleName}>
      <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetContent}>
        {exercises.map((exercise) => (
          <Card key={exercise.key} tone={exercise.key === selectedKey ? 'violet' : 'muted'} padding={14} onPress={() => onSelect(exercise.key)}>
            <View style={styles.exerciseOption}>
              <View style={styles.exerciseOptionText}>
                <Txt variant="bodyStrong" numberOfLines={1}>{exercise.name}</Txt>
                <Txt variant="meta" tone={exercise.key === selectedKey ? color.onViolet : color.textMuted}>{`${exercise.sessions} sesiones · última ${exercise.lastDate}`}</Txt>
              </View>
              {exercise.key === selectedKey ? <Txt variant="labelTight" tone={color.lime}>ELEGIDO</Txt> : null}
            </View>
          </Card>
        ))}
        {!exercises.length ? <Txt variant="body" tone={color.textMuted}>Todavía no trabajaste ejercicios de este músculo.</Txt> : null}
      </ScrollView>
    </Sheet>
  );
}

function formatValue(value: number, progress: NonNullable<ReturnType<typeof getAthleteExerciseProgress>>, unit: 'kg' | 'lb') {
  if (progress.exercise.progressionMetric === 'load' && !progress.exercise.bodyweight) return `${num(value)} ${unit}`;
  return `${num(value)} ${progress.exercise.progressionMetric === 'seconds' ? 's' : 'reps'}`;
}

function recommendationLabel(
  exercise: { progressionMetric: 'load' | 'reps' | 'seconds'; suggested: number; targetReps: number },
  latestRow: { nextLoad: number; nextReps: number } | undefined,
  unit: 'kg' | 'lb',
  progress: NonNullable<ReturnType<typeof getAthleteExerciseProgress>>,
) {
  if (exercise.progressionMetric === 'load' && !progress.exercise.bodyweight) return `Próxima carga: ${num(latestRow?.nextLoad ?? exercise.suggested)} ${unit}`;
  return `Próximo objetivo: ${latestRow?.nextReps ?? exercise.targetReps} ${exercise.progressionMetric === 'seconds' ? 'segundos' : 'reps'}`;
}

const styles = StyleSheet.create({
  heading: { gap: 4 },
  selectorBlock: { gap: 8 },
  chips: { gap: 8, paddingRight: 8 },
  disabledField: { opacity: 0.55 },
  exerciseField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  exerciseFieldText: { flex: 1, gap: 4 },
  waitingCard: { minHeight: 150, justifyContent: 'center' },
  summaryCard: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  summaryColumn: { gap: 4, flex: 1 },
  summaryColumnRight: { alignItems: 'flex-end', gap: 4 },
  summaryValue: { fontSize: 36, lineHeight: 38 },
  chartHeader: { gap: 10 },
  chartTitle: { gap: 3 },
  auditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: color.hairline },
  sheetList: { maxHeight: 430 },
  sheetContent: { gap: 9, paddingBottom: 4 },
  exerciseOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  exerciseOptionText: { flex: 1, gap: 4 },
  emptyState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
