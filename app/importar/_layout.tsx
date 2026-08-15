import { Stack } from 'expo-router';

import { ImportProvider } from '@/state/ImportState';
import { color } from '@/theme/tokens';

export default function ImportLayout() {
  return (
    <ImportProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.screen },
        }}
      />
    </ImportProvider>
  );
}
