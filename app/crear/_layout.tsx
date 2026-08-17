import { Stack } from 'expo-router';

import { CreatorProvider } from '@/state/CreatorState';
import { color } from '@/theme/tokens';

export default function CreatorLayout() {
  return (
    <CreatorProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.screen },
        }}
      />
    </CreatorProvider>
  );
}