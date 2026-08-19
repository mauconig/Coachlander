import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExerciseCatalogMuscleList } from '@/components/ExerciseCatalogPicker';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import type { CatalogMuscle } from '@/api/client';
import { color } from '@/theme/tokens';

export default function ExerciseMusclePicker() {
  const { day } = useLocalSearchParams<{ day?: string | string[] }>();
  const dayNumber = Array.isArray(day) ? day[0] ?? '1' : day ?? '1';

  const selectMuscle = (muscle: CatalogMuscle) => {
    router.push({
      pathname: '/crear/catalogo',
      params: { day: dayNumber, muscle: muscle.key, label: muscle.label, count: String(muscle.count) },
    });
  };

  return (
    <Screen padded={false} gap={0}>
      <View style={styles.content}>
        <TopBar title={`DÍA ${dayNumber} · ELEGÍ UN MÚSCULO`} />
        <Txt variant="body" tone={color.textMuted}>
          Primero elegí qué zona querés trabajar. Después vas a poder buscar y cargar ejercicios de a poco.
        </Txt>
        <ExerciseCatalogMuscleList onSelect={selectMuscle} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 22, gap: 12 },
});
