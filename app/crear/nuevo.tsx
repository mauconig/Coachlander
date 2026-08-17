import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Heading } from '@/components/Note';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { useCreator } from '@/state/CreatorState';
import { color, radius } from '@/theme/tokens';

const DAY_OPTIONS = Array.from({ length: 7 }, (_, i) => String(i + 1));

/** 20 · Nuevo creador — nombre y cantidad de días. */
export default function CreateRoutine() {
  const { routineName, setRoutineName, setDayCount, seedPreselect } = useCreator();
  const { clientId, weekStart } = useLocalSearchParams<{ clientId?: string; weekStart?: string }>();
  const [selectedDays, setSelectedDays] = useState(4);

  useEffect(() => {
    if (clientId && weekStart) seedPreselect(clientId, weekStart);
  }, [clientId, seedPreselect, weekStart]);

  const goToEditor = (days: number) => {
    setDayCount(days);
    router.push('/crear/editor');
  };

  return (
    <Screen scroll gap={22}>
      <TopBar title="CREAR RUTINA" />

      <Heading
        title="Armá una rutina desde cero"
        subtitle="Definí los días y después agregá ejercicios con series, repeticiones y descanso."
        variant="h2"
      />

      <Field
        label="NOMBRE DE LA RUTINA"
        value={routineName}
        onChangeText={setRoutineName}
        placeholder="Ej: Fuerza base — 4 días"
        autoCapitalize="sentences"
      />

      <View style={styles.group}>
        <Txt variant="label">¿CUÁNTOS DÍAS?</Txt>
        <View style={styles.chips}>
          {DAY_OPTIONS.map((option) => {
            const value = Number(option);
            const selected = value === selectedDays;
            return (
              <Pressable
                key={option}
                onPress={() => setSelectedDays(value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option} días`}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Txt variant="labelTight" tone={selected ? color.ink : color.textMuted}>
                  {option}
                </Txt>
              </Pressable>
            );
          })}
        </View>
        <Txt variant="meta" tone={color.textFaint}>
          Tocá la cantidad de días y después continuá.
        </Txt>
      </View>

      <View style={styles.footer}>
        <Button label={`Armar ${selectedDays} ${selectedDays === 1 ? 'día' : 'días'}`} onPress={() => goToEditor(selectedDays)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 11,
    paddingHorizontal: 18,
    backgroundColor: color.surface,
  },
  chipSelected: { backgroundColor: color.lime, borderColor: color.lime },
  pressed: { opacity: 0.8 },
  footer: { marginTop: 'auto', paddingTop: 16 },
});