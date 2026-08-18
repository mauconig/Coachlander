import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { CoachExerciseProgress, TokenProvider } from '@/api/client';
import { saveCoachExerciseGoal } from '@/api/client';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { parseDisplayDate } from '@/lib/stats';
import { color } from '@/theme/tokens';

type Props = {
  visible: boolean;
  clientId: string;
  progress: CoachExerciseProgress;
  tokenProvider: TokenProvider;
  onClose: () => void;
  onSaved: () => void;
};

function displayInput(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function plusDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function CoachExerciseGoalSheet({ visible, clientId, progress, tokenProvider, onClose, onSaved }: Props) {
  const firstValid = progress.points.find((point) => point.meetsTarget) ?? progress.points[0];
  const lastValid = [...progress.points].reverse().find((point) => point.meetsTarget) ?? firstValid;
  const [baselineDate, setBaselineDate] = useState('');
  const [baselineLoad, setBaselineLoad] = useState('');
  const [baselineReps, setBaselineReps] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetLoad, setTargetLoad] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const goal = progress.goal;
    const baseline = goal?.baselineDate ?? firstValid?.bucketStart ?? new Date().toISOString().slice(0, 10);
    setBaselineDate(displayInput(baseline));
    setBaselineLoad(goal?.baselineLoadKg == null ? (progress.exercise.bodyweight ? '' : String(lastValid?.loadKg ?? '')) : String(goal.baselineLoadKg));
    setBaselineReps(String(goal?.baselineReps ?? progress.exercise.targetReps));
    setTargetDate(displayInput(goal?.targetDate ?? plusDays(baseline, 28)));
    setTargetLoad(goal?.targetLoadKg == null ? '' : String(goal.targetLoadKg));
    setTargetReps(String(goal?.targetReps ?? progress.exercise.targetReps));
    setNote(goal?.note ?? '');
    setError('');
  }, [visible, progress]);

  const save = async () => {
    const parsedBaselineDate = parseDisplayDate(baselineDate);
    const parsedTargetDate = parseDisplayDate(targetDate);
    const baselineRepsNumber = Number(baselineReps);
    const targetRepsNumber = Number(targetReps);
    const baselineLoadNumber = baselineLoad.trim() ? Number(baselineLoad.replace(',', '.')) : null;
    const targetLoadNumber = targetLoad.trim() ? Number(targetLoad.replace(',', '.')) : null;
    if (!parsedBaselineDate || !parsedTargetDate || parsedBaselineDate > parsedTargetDate) {
      setError('Revisá las fechas del objetivo.');
      return;
    }
    if (!Number.isInteger(baselineRepsNumber) || !Number.isInteger(targetRepsNumber) || baselineRepsNumber < 1 || targetRepsNumber < 1) {
      setError('Las repeticiones deben ser números enteros positivos.');
      return;
    }
    if ([baselineLoadNumber, targetLoadNumber].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setError('La carga debe ser un número positivo.');
      return;
    }
    if (!progress.exercise.bodyweight && targetLoadNumber === null) {
      setError('Definí una carga objetivo para dibujar la línea ideal.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveCoachExerciseGoal(tokenProvider, {
        clientId,
        exerciseKey: progress.exercise.key,
        exerciseName: progress.exercise.name,
        baselineDate: parsedBaselineDate,
        baselineLoadKg: baselineLoadNumber,
        baselineReps: baselineRepsNumber,
        targetDate: parsedTargetDate,
        targetLoadKg: targetLoadNumber,
        targetReps: targetRepsNumber,
        note,
      });
      onSaved();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar el objetivo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="OBJETIVO DEL ENTRENADOR" title={progress.exercise.name}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Field label="FECHA BASE" value={baselineDate} onChangeText={setBaselineDate} placeholder="18/08/2026" style={styles.half} />
          <Field label="REPS BASE" value={baselineReps} onChangeText={setBaselineReps} keyboardType="number-pad" suffix="reps" style={styles.half} />
        </View>
        <Field label="CARGA BASE · OPCIONAL" value={baselineLoad} onChangeText={setBaselineLoad} keyboardType="decimal-pad" suffix={progress.exercise.bodyweight ? 'peso corporal' : 'kg'} />
        <View style={styles.row}>
          <Field label="FECHA OBJETIVO" value={targetDate} onChangeText={setTargetDate} placeholder="15/09/2026" style={styles.half} />
          <Field label="REPS OBJETIVO" value={targetReps} onChangeText={setTargetReps} keyboardType="number-pad" suffix="reps" style={styles.half} />
        </View>
        <Field label="CARGA OBJETIVO · OPCIONAL" value={targetLoad} onChangeText={setTargetLoad} keyboardType="decimal-pad" suffix={progress.exercise.bodyweight ? 'peso corporal' : 'kg'} />
        <Field label="NOTA" value={note} onChangeText={setNote} multiline placeholder="Qué querés observar en esta progresión" />
        {error ? <Txt variant="meta" tone="#FF8D8D">{error}</Txt> : null}
        <Button label={saving ? 'Guardando…' : 'Guardar objetivo'} onPress={() => void save()} disabled={saving} />
        {saving ? <ActivityIndicator color={color.lime} /> : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 6 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
