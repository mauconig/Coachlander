import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';
import { color } from '@/theme/tokens';

/**
 * expo-router vendors its own copy of the bottom-tabs types, so the props are
 * derived from the `Tabs` component rather than imported from
 * @react-navigation/bottom-tabs (whose types drift from it).
 */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Route name → glyph, for both the athlete and coach tab sets. */
const ICONS: Record<string, IconName> = {
  hoy: 'today',
  progreso: 'progress',
  historial: 'history',
  perfil: 'profile',
  alumnos: 'clients',
  rutinas: 'routines',
  mensajes: 'messages',
};

/**
 * Tab bar for both roles. The design gives it a hairline top rule, wide
 * horizontal padding and mono caps labels that turn lime when active.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 14 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = (options.title ?? route.name).toUpperCase();
        const icon = ICONS[route.name] ?? 'today';
        const tone = focused ? color.lime : color.textFaint;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.title}
            style={styles.item}
          >
            <Icon name={icon} size={20} tone={focused ? color.lime : color.border} />
            <Txt variant="labelSm" tone={tone} style={styles.label}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 34,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.screen,
  },
  item: { alignItems: 'center', gap: 6, minWidth: 56 },
  label: { letterSpacing: 0.9 },
});
