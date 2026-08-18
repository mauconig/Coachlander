import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { CoachMuscleBalance } from '@/api/client';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { color } from '@/theme/tokens';

type Props = { balance: CoachMuscleBalance };
type Region = CoachMuscleBalance['items'][number];

const FIGURE_WIDTH = 124;
const FIGURE_HEIGHT = 238;

export function CoachMuscleBalance({ balance }: Props) {
  const [selected, setSelected] = useState<Region | null>(null);
  const regions = useMemo(() => new Map(balance.items.map((item) => [item.key, item])), [balance.items]);
  const fillFor = (key: string) => regionColor(regions.get(key)?.percentage ?? 0);

  return (
    <>
      <Card padding={18} gap={14}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Txt variant="eyebrow">BALANCE DE ENTRENAMIENTO</Txt>
            <Txt variant="meta" tone={color.textMuted}>{`${balance.totalSessions} sesiones · zonas trabajadas`}</Txt>
          </View>
          <View style={styles.scale}>
            <View style={styles.scaleLow} />
            <View style={styles.scaleHigh} />
          </View>
        </View>

        <View style={styles.figures}>
          <View style={styles.figure}>
            <BodyFigure side="front" fillFor={fillFor} />
            <Txt variant="metaSm" tone={color.textFaint}>FRENTE</Txt>
          </View>
          <View style={styles.figure}>
            <BodyFigure side="back" fillFor={fillFor} />
            <Txt variant="metaSm" tone={color.textFaint}>ESPALDA</Txt>
          </View>
        </View>

        {balance.totalSessions ? (
          <View style={styles.legendGrid}>
            {balance.items.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setSelected(item)}
                style={styles.legendItem}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${item.sessions} sesiones, ${item.percentage}%`}
              >
                <View style={[styles.swatch, { backgroundColor: regionColor(item.percentage) }]} />
                <View style={styles.legendText}>
                  <Txt variant="meta" numberOfLines={1}>{item.label}</Txt>
                  <Txt variant="metaSm" tone={color.textMuted}>{`${item.sessions} sesiones · ${item.percentage}% · ${formatWeekly(item.sessionsPerWeek)}/sem`}</Txt>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Txt variant="body" tone={color.textMuted} center>No hay sesiones realizadas en este período.</Txt>
        )}
        <Txt variant="metaSm" tone={color.textFaint}>Una sesión puede trabajar varias zonas; por eso los porcentajes no tienen que sumar 100%.</Txt>
      </Card>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} eyebrow="REGIÓN TRABAJADA" title={selected?.label ?? ''}>
        {selected ? (
          <View style={styles.sheetBody}>
            <Txt variant="h3">{`${selected.sessions} sesiones · ${selected.percentage}%`}</Txt>
            <Txt variant="body" tone={color.textMuted}>{`${formatWeekly(selected.sessionsPerWeek)} sesiones por semana en el rango elegido.`}</Txt>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function formatWeekly(value: number) {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

function regionColor(percentage: number) {
  if (!percentage) return color.surfaceAlt;
  const alpha = Math.min(0.95, 0.22 + percentage / 145);
  return `rgba(228,255,26,${alpha})`;
}

function BodyFigure({ side, fillFor }: { side: 'front' | 'back'; fillFor: (key: string) => string }) {
  const front = side === 'front';
  const base = color.surfaceAlt;
  const outline = color.border;

  return (
    <Svg width={FIGURE_WIDTH} height={FIGURE_HEIGHT} viewBox="0 0 150 280">
      <Circle cx="75" cy="18" r="13" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M68 30h14l4 18H64Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M48 49Q75 39 102 49L111 103Q108 124 96 137H54Q42 124 39 103Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M44 52Q32 57 25 78L19 103 28 106 42 82 51 67Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M106 52Q118 57 125 78L131 103 122 106 108 82 99 67Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M19 103 13 143 22 146 30 106Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M131 103 137 143 128 146 120 106Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M55 131Q75 143 95 131L101 151Q75 163 49 151Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M51 148 72 151 69 210 58 231 44 225 51 199Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M78 151 99 148 106 199 112 225 98 231 87 210Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M58 228 44 225 36 267 50 267 64 232Z" fill={base} stroke={outline} strokeWidth="1.5" />
      <Path d="M92 232 106 225 114 267 100 267 86 232Z" fill={base} stroke={outline} strokeWidth="1.5" />

      {front ? (
        <>
          <Path d="M47 52Q75 42 103 52L97 78Q75 87 53 78Z" fill={fillFor('pecho')} />
          <Path d="M45 51Q34 56 28 73L43 82 54 62Z" fill={fillFor('hombros')} />
          <Path d="M105 51Q116 56 122 73L107 82 96 62Z" fill={fillFor('hombros')} />
          <Path d="M28 74 20 103 29 105 44 82Z" fill={fillFor('brazos')} />
          <Path d="M122 74 130 103 121 105 106 82Z" fill={fillFor('brazos')} />
          <Rect x="52" y="80" width="46" height="47" rx="13" fill={fillFor('core')} />
          <Path d="M51 146Q61 151 72 151L69 207 55 206Z" fill={fillFor('cuadriceps')} />
          <Path d="M78 151Q89 151 99 146L95 206 81 207Z" fill={fillFor('cuadriceps')} />
          <Path d="M55 206 69 207 58 231 44 225Z" fill={fillFor('pantorrillas')} />
          <Path d="M81 207 95 206 106 225 92 231Z" fill={fillFor('pantorrillas')} />
        </>
      ) : (
        <>
          <Path d="M48 51Q75 42 102 51L96 78Q75 91 54 78Z" fill={fillFor('espalda')} />
          <Path d="M54 78Q75 91 96 78L94 111Q75 123 56 111Z" fill={fillFor('espalda_baja')} />
          <Path d="M55 111Q65 119 75 121V153Q61 155 49 149Z" fill={fillFor('gluteos')} />
          <Path d="M95 111Q85 119 75 121V153Q89 155 101 149Z" fill={fillFor('gluteos')} />
          <Path d="M45 51Q34 56 28 73L43 82 54 62Z" fill={fillFor('brazos')} />
          <Path d="M105 51Q116 56 122 73L107 82 96 62Z" fill={fillFor('brazos')} />
          <Path d="M51 148Q61 155 72 153L69 207 55 206Z" fill={fillFor('cadena_posterior')} />
          <Path d="M78 153Q89 155 99 148L95 206 81 207Z" fill={fillFor('cadena_posterior')} />
          <Path d="M55 206 69 207 58 231 44 225Z" fill={fillFor('pantorrillas')} />
          <Path d="M81 207 95 206 106 225 92 231Z" fill={fillFor('pantorrillas')} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, gap: 4 },
  scale: { flexDirection: 'row', gap: 4, paddingTop: 2 },
  scaleLow: { width: 12, height: 12, borderRadius: 4, backgroundColor: color.surfaceAlt, borderWidth: 1, borderColor: color.border },
  scaleHigh: { width: 12, height: 12, borderRadius: 4, backgroundColor: color.lime },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  figure: { alignItems: 'center', gap: 4 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38 },
  swatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1, borderColor: color.border },
  legendText: { flex: 1, gap: 2 },
  sheetBody: { gap: 6 },
});
