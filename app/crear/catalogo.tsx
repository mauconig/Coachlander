import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getExercises } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useCreator } from '@/state/CreatorState';
import { color, radius } from '@/theme/tokens';

/** 21 · Catálogo — elegí ejercicios de la biblioteca o creá uno nuevo. */
export default function ExerciseCatalog() {
  const { day } = useLocalSearchParams<{ day: string }>();
  const dayNumber = Number(day) || 1;
  const { addExercise } = useCreator();
  const library = useQuery(getExercises);
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? library.filter((exercise) => exercise.name.toLowerCase().includes(q)) : library;
  }, [library, query]);

  const addFromLibrary = (name: string) => {
    addExercise(dayNumber, {
      name,
      sets: 3,
      reps: '8-10',
      loadKg: null,
      restSeconds: 90,
      note: '',
    });
    router.back();
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    addExercise(dayNumber, {
      name,
      sets: 3,
      reps: '8-10',
      loadKg: null,
      restSeconds: 90,
      note: '',
    });
    router.back();
  };

  return (
    <Screen scroll gap={16}>
      <TopBar title={`DÍA ${dayNumber} · AGREGAR EJERCICIO`} />

      <Field
        label="BUSCAR EN EL CATÁLOGO"
        value={query}
        onChangeText={setQuery}
        placeholder="Ej: press, sentadilla, remo"
        autoCapitalize="none"
      />

      <Card tone="muted" padding={16} gap={12}>
        <Txt variant="label">CREAR EJERCICIO NUEVO</Txt>
        <Field
          label="NOMBRE"
          value={customName}
          onChangeText={setCustomName}
          placeholder="Ej: Prensa de hombro con mancuernas"
        />
        <Button label="Agregar ejercicio nuevo" variant="violet" size="sm" onPress={addCustom} />
      </Card>

      <View style={styles.list}>
        <Txt variant="label" tone={color.textMuted}>
          {`CATÁLOGO · ${results.length}`}
        </Txt>
        {results.map((exercise) => (
          <Row
            key={exercise.id}
            left={<Icon name="plus" size={14} tone={color.lime} weight={2.6} />}
            title={exercise.name}
            meta={`${exercise.scheme}`}
            right={
              <Pressable
                hitSlop={8}
                onPress={() => addFromLibrary(exercise.name)}
                accessibilityRole="button"
                accessibilityLabel={`Agregar ${exercise.name}`}
              >
                <Icon name="chevron-right" size={16} tone={color.textMuted} />
              </Pressable>
            }
            onPress={() => addFromLibrary(exercise.name)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 9 },
});
