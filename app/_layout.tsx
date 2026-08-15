import {
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
  useFonts,
} from '@expo-google-fonts/archivo';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrate } from '@/db/migrate';
import { DATABASE_NAME } from '@/db/schema';
import { AppStateProvider } from '@/state/AppState';
import { color } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

/** Navigation chrome matched to the design's near-black canvas. */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: color.screen,
    card: color.screen,
    border: color.hairline,
    text: color.text,
    primary: color.lime,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.screen }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          {/* Children mount only once the database is open and seeded, so
              screens can read synchronously without loading states. */}
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
            <AppStateProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.screen },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="sesion" options={{ animation: 'slide_from_bottom' }} />
              </Stack>
            </AppStateProvider>
          </SQLiteProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
