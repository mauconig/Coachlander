import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Toggle } from '@/components/Toggle';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getClient, getClients, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { Exercise } from '@/data/types';
import { num, weight } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

/** 08 · Editor de rutina — tune sets, reps and load, then publish to the athlete. */
export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { unit } = useApp();
  const client = useQuery((db) => getClient(db, id) ?? getClients(db)[0], [id]);
  const routine = useQuery(getTodayRoutine);

  // The editor works on a local draft; "Enviar" is where a write would land.
  const [draft, setDraft] = useState<Exercise[] | null>(null);
  const exercises = draft ?? routine.exercises;
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeId = editingId ?? exercises[0]?.id;
  const firstName = client.name.split(' ')[0];
  const totalSets = exercises.reduce((n, e) => n + e.sets, 0);

  const patch = (exerciseId: string, changes: Partial<Exercise>) =>
    setDraft((list) =>
      (list ?? routine.exercises).map((e) => (e.id === exerciseId ? { ...e, ...changes } : e)),
    );

  return (
    <Screen
      scroll
      gap={14}
      footer={
        <View style={styles.footer}>
          <Pressable style={styles.duplicate} accessibilityRole="button">
            <Txt variant="labelTight">DUPLICAR</Txt>
          </Pressable>
          <Button
            label={`Enviar a ${firstName}`}
            variant="violet"
            size="md"
            fill
            onPress={() => router.back()}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerText}>
          <Txt variant="label">{`${client.name.toUpperCase()} · SEMANA ${routine.week}`}</Txt>
          <Txt variant="h4" style={styles.headerTitle}>
            {routine.name}
          </Txt>
        </View>
        <Pressable style={styles.publish} accessibilityRole="button">
          <Txt variant="labelTight" tone={color.ink}>
            PUBLICAR
          </Txt>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <StatTile compact value={`${routine.estimatedMinutes} min`} label="EST. SESIÓN" />
        <StatTile compact value={String(totalSets)} label="SERIES" />
        <StatTile compact value={`${routine.secondsPerSet} s`} label="POR SERIE" />
      </View>

      <View style={styles.list}>
        {exercises.map((exercise) => {
          const editing = exercise.id === activeId;

          if (!editing) {
            return (
              <Row
                key={exercise.id}
                left={<Icon name="grip" size={16} tone={color.textMuted} />}
                title={exercise.name}
                meta={`${exercise.scheme} · ${weight(exercise.suggested, unit)} · ${exercise.rest} s`}
                chevron
                onPress={() => setEditingId(exercise.id)}
                style={styles.row}
              />
            );
          }

          return (
            <Card key={exercise.id} editing radius={radius.lg} padding={16} gap={12}>
              <View style={styles.editHead}>
                <Icon name="grip" size={16} tone={color.textMuted} />
                <Txt variant="rowTitle" style={styles.editTitle}>
                  {exercise.name}
                </Txt>
                <Txt variant="labelTight" tone={color.lime}>
                  EDITANDO
                </Txt>
              </View>

              <View style={styles.steppers}>
                <Stepper
                  label="SERIES"
                  value={String(exercise.sets)}
                  onStep={(d) =>
                    patch(exercise.id, {
                      sets: Math.max(1, exercise.sets + d),
                      scheme: `${Math.max(1, exercise.sets + d)} × ${exercise.scheme.split('×')[1].trim()}`,
                    })
                  }
                />
                <Stepper
                  label="REPS"
                  value={exercise.scheme.split('×')[1].trim()}
                  onStep={(d) => {
                    const reps = Math.max(1, parseInt(exercise.scheme.split('×')[1].trim(), 10) + d);
                    patch(exercise.id, { scheme: `${exercise.sets} × ${reps}` });
                  }}
                />
                <Stepper
                  label={unit.toUpperCase()}
                  value={exercise.suggested ? num(exercise.suggested) : 'PC'}
                  accent
                  onStep={(d) =>
                    patch(exercise.id, { suggested: Math.max(0, exercise.suggested + d * 2.5) })
                  }
                />
              </View>

              <View style={styles.overload}>
                <Txt variant="meta">Overload automático</Txt>
                <View style={styles.overloadRight}>
                  <Txt variant="labelTight" tone={exercise.overload ? color.lime : color.textFaint}>
                    {exercise.overload ? `+${num(exercise.overload)} ${unit} / semana` : 'Sin cambio'}
                  </Txt>
                  <Toggle
                    size="sm"
                    label="Overload automático"
                    value={!!exercise.overload}
                    onChange={(on) => patch(exercise.id, { overload: on ? 2.5 : null })}
                  />
                </View>
              </View>
            </Card>
          );
        })}

        <Pressable
          style={styles.addExercise}
          accessibilityRole="button"
          onPress={() => router.push('/importar/origen')}
        >
          <Icon name="plus" size={16} tone={color.textMuted} />
          <Txt variant="bodyStrong" tone={color.textMuted}>
            Agregar ejercicio
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}

/** Compact numeric cell with -/+ affordances, used inside the editing card. */
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
  const tone = accent ? color.lime : color.text;

  return (
    <View style={[styles.stepper, accent && styles.stepperAccent]}>
      <Txt variant="metaSm" tone={accent ? color.lime : color.textMuted}>
        {label}
      </Txt>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`Bajar ${label}`}>
          <Txt variant="numeric" tone={color.textFaint}>
            −
          </Txt>
        </Pressable>
        <Txt variant="numeric" tone={tone}>
          {value}
        </Txt>
        <Pressable onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`Subir ${label}`}>
          <Txt variant="numeric" tone={color.textFaint}>
            +
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 22 },
  publish: {
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  stats: { flexDirection: 'row', gap: 8 },
  list: { gap: 9 },
  row: { borderRadius: radius.lg, padding: 16 },
  editHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editTitle: { flex: 1, fontSize: 16 },
  steppers: { flexDirection: 'row', gap: 8 },
  stepper: {
    flex: 1,
    backgroundColor: color.screen,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xs,
    padding: 11,
    gap: 4,
  },
  stepperAccent: { borderColor: color.lime },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overload: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 12,
  },
  overloadRight: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  addExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: 16,
  },
  footer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  duplicate: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
});
