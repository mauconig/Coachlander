import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { color } from '@/theme/tokens';

export default function CoachTabs() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.screen },
      }}
    >
      <Tabs.Screen name="alumnos" options={{ title: 'Alumnos' }} />
      <Tabs.Screen name="rutinas" options={{ title: 'Rutinas' }} />
      <Tabs.Screen name="estadisticas" options={{ title: 'Estadísticas' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
