import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CoachWeekdayActivityItem } from '@/api/client';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { color, radius } from '@/theme/tokens';

type Props = {
  activity: { items: CoachWeekdayActivityItem[] };
};

function formatNumber(value: number) {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

export function CoachWeekdayActivityChart({ activity }: Props) {
  const [selected, setSelected] = useState<CoachWeekdayActivityItem | null>(null);
  const maximum = useMemo(
    () => Math.max(...activity.items.map((item) => item.averagePerWeek), 1),
    [activity.items],
  );
  const hasActivity = activity.items.some((item) => item.sessions > 0);

  return (
    <>
      <Card padding={18} gap={14}>
        <View style={styles.heading}>
          <View style={styles.titleBlock}>
            <Txt variant="eyebrow">ACTIVIDAD POR DÍA</Txt>
            <Txt variant="meta" tone={color.textMuted}>Promedio de sesiones por semana</Txt>
          </View>
          <Txt variant="metaSm" tone={color.textFaint}>TOCÁ UNA BARRA</Txt>
        </View>

        {hasActivity ? (
          <View style={styles.chart}>
            <View style={styles.baseline} />
            {activity.items.map((item) => {
              const height = item.averagePerWeek ? Math.max(8, (item.averagePerWeek / maximum) * 122) : 3;
              return (
                <Pressable
                  key={item.weekday}
                  onPress={() => setSelected(item)}
                  style={styles.barColumn}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}: ${formatNumber(item.averagePerWeek)} sesiones promedio por semana`}
                >
                  <Txt variant="metaSm" tone={item.sessions ? color.textSoft : color.textFaint}>
                    {item.sessions ? formatNumber(item.averagePerWeek) : '—'}
                  </Txt>
                  <View style={styles.track}>
                    <View style={[styles.bar, { height }]} />
                  </View>
                  <Txt variant="label" tone={color.textSoft}>{item.label}</Txt>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <Txt variant="body" tone={color.textMuted} center>No hay sesiones completadas en este período.</Txt>
          </View>
        )}
      </Card>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="FRECUENCIA SEMANAL"
        title={selected ? `DÍA ${selected.label}` : ''}
      >
        {selected ? (
          <View style={styles.sheetBody}>
            <Txt variant="h3">{`${formatNumber(selected.averagePerWeek)} sesiones por semana`}</Txt>
            <Txt variant="body" tone={color.textMuted}>{`${selected.sessions} sesiones en el rango · ${selected.percentageOfWeeks}% de las semanas con actividad.`}</Txt>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleBlock: { flex: 1, gap: 4 },
  chart: { height: 176, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5, position: 'relative', paddingTop: 2 },
  baseline: { position: 'absolute', left: 0, right: 0, bottom: 28, height: 1, backgroundColor: color.border },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 7, height: '100%' },
  track: { height: 132, width: 26, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 22, minHeight: 3, borderRadius: radius.xs, backgroundColor: color.lime },
  empty: { paddingVertical: 28 },
  sheetBody: { gap: 6 },
});
