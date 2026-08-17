import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import type { CreatorExercise } from '@/state/CreatorState';
import { useCreator } from '@/state/CreatorState';
import { font } from '@/theme/type';
import { GUTTER, color, radius } from '@/theme/tokens';

/** 22 · Editor del creador — días y ejercicios reordenables con arrastre. */
export default function RoutineCreatorEditor() {
  const { days, updateExercise, removeExercise, moveExercise, replaceExercises, renameDay } =
    useCreator();
  const [activeDay, setActiveDay] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const day = days.find((d) => d.day === activeDay) ?? { day: activeDay, name: `Día ${activeDay}`, exercises: [] };

  const header = (
    <View style={styles.header}>
      <TopBar title="CREADOR DE RUTINA" />

      <View style={styles.dayTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabsScroll}>
          {days.map((d) => (
            <Pressable
              key={d.day}
              onPress={() => setActiveDay(d.day)}
              accessibilityRole="button"
              style={[styles.dayTab, d.day === activeDay && styles.dayTabActive]}
            >
              <Txt variant="label" tone={d.day === activeDay ? color.ink : color.textMuted}>
                {`DÍA ${d.day}`}
              </Txt>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/crear/revisar')}
            accessibilityRole="button"
            style={styles.continueTab}
          >
            <Txt variant="labelTight" tone={color.ink}>
              CONTINUAR
            </Txt>
            <Icon name="chevron-right" size={13} tone={color.ink} />
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.dayNameRow}>
        <Txt variant="label" tone={color.lime}>
          {`DÍA ${day.day}`}
        </Txt>
        <TextInput
          value={day.name}
          onChangeText={(name) => renameDay(day.day, name)}
          placeholder="Nombre del día"
          placeholderTextColor={color.textFaint}
          selectionColor={color.lime}
          autoCorrect={false}
          style={styles.dayNameInput}
        />
      </View>
    </View>
  );

  const footer = (
    <Pressable
      style={styles.addExercise}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/crear/catalogo', params: { day: String(day.day) } })}
    >
      <Icon name="plus" size={16} tone={color.textMuted} />
      <Txt variant="bodyStrong" tone={color.textMuted}>
        Agregar ejercicio
      </Txt>
    </Pressable>
  );

  return (
    <Screen gap={0}>
      <DraggableFlatList
        data={day.exercises}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => replaceExercises(day.day, data)}
        activationDistance={8}
        style={styles.listFlex}
        containerStyle={styles.listFlex}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item, drag, isActive }) => (
          <ScaleDecorator activeScale={1.02}>
            <ExerciseItem
              exercise={item}
              isActive={isActive}
              editing={item.id === editingId}
              onDrag={drag}
              onPress={() => setEditingId(item.id)}
              onPatch={(changes) => updateExercise(day.day, item.id, changes)}
              onRemove={() => {
                removeExercise(day.day, item.id);
                setEditingId(null);
              }}
              onMove={(direction) => moveExercise(day.day, item.id, direction)}
              onClose={() => setEditingId(null)}
            />
          </ScaleDecorator>
        )}
        ListEmptyComponent={
          <Card tone="muted" padding={18} gap={8}>
            <Txt variant="body" tone={color.textMuted} center>
              Este día todavía no tiene ejercicios. Agregá uno desde el catálogo.
            </Txt>
          </Card>
        }
      />
    </Screen>
  );
}

function ExerciseItem({
  exercise,
  isActive,
  editing,
  onDrag,
  onPress,
  onPatch,
  onRemove,
  onMove,
  onClose,
}: {
  exercise: CreatorExercise;
  isActive: boolean;
  editing: boolean;
  onDrag: () => void;
  onPress: () => void;
  onPatch: (changes: Partial<CreatorExercise>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
}) {
  if (!editing) {
    return (
      <Row
        left={
          <Pressable
            onLongPress={onDrag}
            delayLongPress={220}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Arrastrar ${exercise.name}`}
            style={styles.dragHandle}
          >
            <Icon name="grip" size={16} tone={isActive ? color.lime : color.textMuted} />
          </Pressable>
        }
        title={exercise.name}
                meta={`${exercise.sets} × ${exercise.reps}`}
        chevron
        onPress={onPress}
        active={isActive}
        style={StyleSheet.flatten([styles.row, isActive ? styles.rowActive : null])}
      />
    );
  }

  return (
    <ExerciseEditor
      exercise={exercise}
      onDrag={onDrag}
      onPatch={onPatch}
      onRemove={onRemove}
      onMove={onMove}
      onClose={onClose}
    />
  );
}

function ExerciseEditor({
  exercise,
  onDrag,
  onPatch,
  onRemove,
  onMove,
  onClose,
}: {
  exercise: CreatorExercise;
  onDrag: () => void;
  onPatch: (changes: Partial<CreatorExercise>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
}) {
  const repsNumber = parseInt(exercise.reps, 10) || 8;

  return (
    <Card editing radius={radius.lg} padding={16} gap={12}>
      <View style={styles.editHead}>
        <Pressable
          onLongPress={onDrag}
          delayLongPress={220}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Arrastrar ${exercise.name}`}
        >
          <Icon name="grip" size={16} tone={color.textMuted} />
        </Pressable>
        <Txt variant="rowTitle" style={styles.editTitle}>
          {exercise.name}
        </Txt>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Txt variant="labelTight" tone={color.lime}>
            LISTO
          </Txt>
        </Pressable>
      </View>

      <View style={styles.steppers}>
        <Stepper
          label="SERIES"
          value={String(exercise.sets)}
          onStep={(d) => onPatch({ sets: Math.max(1, exercise.sets + d) })}
        />
        <Stepper
          label="REPS"
          value={exercise.reps}
          onStep={(d) => onPatch({ reps: `${Math.max(1, repsNumber + d)}` })}
        />
      </View>

      <TextInput
        value={exercise.note}
        onChangeText={(note) => onPatch({ note })}
        placeholder="Nota para el atleta (técnica, ritmo, sensaciones)"
        placeholderTextColor={color.textFaint}
        selectionColor={color.lime}
        autoCorrect={false}
        multiline
        style={styles.noteInput}
      />

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onMove(-1)} accessibilityRole="button">
          <Txt variant="labelTight">SUBIR</Txt>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onMove(1)} accessibilityRole="button">
          <Txt variant="labelTight">BAJAR</Txt>
        </Pressable>
        <Pressable style={[styles.action, styles.actionDanger]} onPress={onRemove} accessibilityRole="button">
          <Txt variant="labelTight" tone={color.lime}>
            QUITAR
          </Txt>
        </Pressable>
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
        <Txt variant="numeric" tone={tone} style={styles.stepperValue}>
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
  listFlex: { flex: 1 },
  content: { paddingBottom: 24, gap: 9 },
  header: { gap: 14, paddingBottom: 4 },
  dayTabs: { marginHorizontal: -GUTTER },
  dayTabsScroll: { gap: 8, paddingHorizontal: GUTTER, paddingRight: 16 },
  dayTab: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: color.surface,
  },
  dayTabActive: { backgroundColor: color.lime, borderColor: color.lime },
  continueTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: color.lime,
  },
  dayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  dayNameInput: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: color.text,
    fontFamily: font.uiSemi,
    fontSize: 15,
  },
  row: { borderRadius: radius.lg, padding: 16 },
  rowActive: { borderColor: color.lime, opacity: 0.85 },
  dragHandle: { alignItems: 'center', justifyContent: 'center' },
  editHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editTitle: { flex: 1, fontSize: 16 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: {
    flex: 1,
    minWidth: 90,
    backgroundColor: color.screen,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xs,
    padding: 11,
    gap: 4,
  },
  stepperAccent: { borderColor: color.lime },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperValue: { flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  noteInput: {
    backgroundColor: color.screen,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xs,
    color: color.textSoft,
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  action: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  actionDanger: { borderColor: color.lime },
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
    marginTop: 9,
  },
});