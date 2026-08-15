import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { color } from '@/theme/tokens';

export default function AthleteTabs() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.screen },
      }}
    >
      <Tabs.Screen name="hoy" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="progreso" options={{ title: 'Progreso' }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
