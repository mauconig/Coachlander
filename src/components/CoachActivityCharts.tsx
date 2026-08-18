import { StyleSheet, View } from 'react-native';

import type { CoachStatistics } from '@/api/client';
import { Card } from '@/components/Card';
import { Txt } from '@/components/Txt';
import { color } from '@/theme/tokens';

type Props = {
  activity: CoachStatistics['activity'];
};

export function CoachActivityCharts({ activity }: Props) {
  const buckets = activity.buckets;
  const maxSessions = Math.max(...buckets.map((item) => item.sessions), 1);
  const maxMinutes = Math.max(...buckets.map((item) => item.minutes), 1);
  const totalSessions = buckets.reduce((total, item) => total + item.sessions, 0);
  const totalMinutes = buckets.reduce((total, item) => total + item.minutes, 0);

  return (
    <Card padding={18} gap={14}>
      <Txt variant="eyebrow">ACTIVIDAD DEL PERÍODO</Txt>
      <MiniChart
        label="SESIONES COMPLETADAS"
        value={String(totalSessions)}
        buckets={buckets}
        valueKey="sessions"
        max={maxSessions}
        tone={color.lime}
      />
      <MiniChart
        label="MINUTOS ESTIMADOS"
        value={`${totalMinutes} min`}
        buckets={buckets}
        valueKey="minutes"
        max={maxMinutes}
        tone={color.violetSoft}
      />
    </Card>
  );
}

function MiniChart({
  label,
  value,
  buckets,
  valueKey,
  max,
  tone,
}: {
  label: string;
  value: string;
  buckets: CoachStatistics['activity']['buckets'];
  valueKey: 'sessions' | 'minutes';
  max: number;
  tone: string;
}) {
  return (
    <View style={styles.chartGroup}>
      <View style={styles.chartHeader}>
        <Txt variant="meta" tone={color.textMuted}>{label}</Txt>
        <Txt variant="rowTitle" tone={tone}>{value}</Txt>
      </View>
      {buckets.length ? (
        <>
          <View style={styles.chart}>
            {buckets.map((bucket, index) => {
              const amount = bucket[valueKey];
              return (
                <View
                  key={bucket.start}
                  style={[
                    styles.bar,
                    {
                      height: `${amount ? Math.max(8, Math.round((amount / max) * 100)) : 3}%`,
                      backgroundColor: index === buckets.length - 1 ? tone : color.border,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.axis}>
            <Txt variant="metaSm" tone={color.textFaint}>{buckets[0].label}</Txt>
            <Txt variant="metaSm" tone={color.textFaint}>{buckets[buckets.length - 1].label}</Txt>
          </View>
        </>
      ) : (
        <Txt variant="meta" tone={color.textFaint}>Sin actividad en este período.</Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartGroup: { gap: 7 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 58 },
  bar: { flex: 1, minHeight: 2, borderRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
