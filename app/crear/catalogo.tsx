import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExerciseCatalogExerciseList } from '@/components/ExerciseCatalogPicker';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import type { CatalogExerciseSummary, CatalogMuscle } from '@/api/client';
import { useCreator } from '@/state/CreatorState';

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ExerciseCatalog() {
  const params = useLocalSearchParams<{
    day?: string | string[];
    muscle?: string | string[];
    label?: string | string[];
    count?: string | string[];
  }>();
  const dayNumber = Number(paramValue(params.day)) || 1;
  const muscleKey = paramValue(params.muscle);
  const muscle: CatalogMuscle = {
    key: muscleKey,
    label: paramValue(params.label) || muscleKey,
    count: Number(paramValue(params.count)) || 0,
  };
  const { addExercise } = useCreator();

  useEffect(() => {
    if (!muscleKey) router.replace({ pathname: '/crear/musculos', params: { day: String(dayNumber) } });
  }, [dayNumber, muscleKey]);

  if (!muscleKey) return null;

  const addFromLibrary = (exercise: CatalogExerciseSummary) => {
    addExercise(dayNumber, {
      name: exercise.name,
      sets: 3,
      reps: '8-10',
      loadKg: null,
      restSeconds: 90,
      note: '',
    });
    router.back();
  };

  const addCustom = (name: string) => {
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
    <Screen padded={false} gap={0}>
      <View style={styles.content}>
        <TopBar title={`DÍA ${dayNumber} · EJERCICIOS`} />
        <ExerciseCatalogExerciseList
          muscle={muscle}
          onBack={() => router.back()}
          onAdd={addFromLibrary}
          onCreate={addCustom}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 22, gap: 10 },
});
