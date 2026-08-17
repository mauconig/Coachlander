import { Tabs } from 'expo-router';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';
import { Txt } from './Txt';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

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
  estadisticas: 'stats',
};

/**
 * Tab bar for both roles. The design gives it a hairline top rule, wide
 * horizontal padding and mono caps labels that turn lime when active.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { role, draft } = useApp();
  const isCoach = role === 'coach';
  const isSoloAthlete = role === 'athlete' && draft.soloTraining;
  const showPlus = isCoach || isSoloAthlete;
  const [creatorOpen, setCreatorOpen] = useState(false);

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
          <Fragment key={route.key}>
            {showPlus && index === 2 ? (
              <Pressable
                onPress={() => setCreatorOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Nueva rutina"
                style={styles.loadButton}
              >
                <Icon name="plus" size={26} tone={color.ink} weight={2.4} />
              </Pressable>
            ) : null}

            <Pressable
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
          </Fragment>
        );
      })}

      <Sheet visible={creatorOpen} onClose={() => setCreatorOpen(false)} eyebrow="NUEVA RUTINA" title="¿Cómo querés armarla?">
        <Pressable
          onPress={() => {
            setCreatorOpen(false);
            router.push('/crear/nuevo');
          }}
          accessibilityRole="button"
          style={styles.option}
        >
          <View style={styles.optionMark}>
            <Icon name="plus" size={18} tone={color.ink} weight={2.4} />
          </View>
          <View style={styles.optionText}>
            <Txt variant="rowTitle">Creador de rutinas</Txt>
            <Txt variant="meta">Armala desde cero, día por día</Txt>
          </View>
          <Icon name="chevron-right" size={16} tone={color.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => {
            setCreatorOpen(false);
            router.push('/importar/origen');
          }}
          accessibilityRole="button"
          style={[styles.option, styles.optionAlt]}
        >
          <View style={[styles.optionMark, styles.optionMarkAlt]}>
            <Icon name="file" size={18} tone={color.text} weight={2.4} />
          </View>
          <View style={styles.optionText}>
            <Txt variant="rowTitle">Importar con IA</Txt>
            <Txt variant="meta">Traé una planilla o pegá el texto</Txt>
          </View>
          <Icon name="chevron-right" size={16} tone={color.textMuted} />
        </Pressable>
      </Sheet>
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
  loadButton: {
    width: 54,
    height: 54,
    marginTop: -30,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.lime,
    borderWidth: 4,
    borderColor: color.screen,
  },
  label: { letterSpacing: 0.9 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  optionAlt: { marginBottom: 2 },
  optionMark: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMarkAlt: {
    backgroundColor: color.violet,
  },
  optionText: { flex: 1, gap: 2 },
});
