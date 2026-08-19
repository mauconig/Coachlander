import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getCoach, getExercise, getExercises } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { num, weightLabel } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { GUTTER, color, hitSlop, radius } from '@/theme/tokens';

/** 03 · Detalle de ejercicio — how to do it, and why today's load is what it is. */
export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { unit } = useApp();
  const insets = useSafeAreaInsets();
  const [mediaFailed, setMediaFailed] = useState(false);
  const coach = useQuery(getCoach);
  const exercise = useQuery((db) => getExercise(db, id) ?? getExercises(db)[0], [id]);
  const last = exercise.lastTime;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Video header */}
        <View style={[styles.hero, { height: 178 + insets.top }]}>
          <View style={[styles.heroBar, { top: insets.top + 16 }]}>
            <Pressable
              hitSlop={hitSlop}
              onPress={() => router.back()}
              style={styles.heroCircle}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Icon name="chevron-left" size={18} tone={color.text} />
            </Pressable>
            <View style={styles.heroTag}>
              <Txt variant="label">VIDEO DEMO 0:24</Txt>
            </View>
          </View>
          {exercise.gifUrl || exercise.imageUrl ? (
            <Image
              source={{ uri: mediaFailed ? exercise.imageUrl : exercise.gifUrl ?? exercise.imageUrl }}
              style={styles.heroMedia}
              contentFit="contain"
              autoplay
              onError={() => setMediaFailed(true)}
              accessibilityLabel={`Demostración de ${exercise.name}`}
            />
          ) : (
            <Txt variant="metaSm" tone={color.textFaint}>[ demo del movimiento ]</Txt>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.heading}>
            <Txt variant="label" tone={color.lime}>
              {exercise.focus}
            </Txt>
            <Txt variant="h2" style={styles.title}>
              {exercise.name}
            </Txt>
            {exercise.attribution ? <Txt variant="metaSm" tone={color.textFaint}>{exercise.attribution}</Txt> : null}
          </View>

          <View style={styles.stats}>
            <StatTile compact value={exercise.scheme.replace(/\s/g, '')} label="SERIES" />
            <StatTile
              compact
              value={exercise.suggested ? num(exercise.suggested) : 'PC'}
              label={exercise.suggested ? `${unit.toUpperCase()} SUGERIDO` : 'PESO CORPORAL'}
            />
            <StatTile compact value={`${exercise.rest} s`} label="DESCANSO" />
          </View>

          <Card radius={radius.xl} padding={18} gap={12}>
            <Txt variant="eyebrow">CÓMO EJECUTARLO</Txt>
            <Txt variant="prose">{exercise.cues}</Txt>
          </Card>

          {last ? (
            <Card tone="lime" radius={radius.xl} padding={18} gap={6}>
              <Txt variant="eyebrow" tone={color.ink}>
                {`TU ÚLTIMA VEZ · ${last.date}`}
              </Txt>
              <Txt variant="h3" tone={color.ink}>
                {`${weightLabel(last.load, unit)} × ${last.reps.join(', ')}`}
              </Txt>
              <Txt variant="prose" tone={color.ink}>
                {last.note}
              </Txt>
            </Card>
          ) : null}

          <Card radius={radius.xl} padding={16} style={styles.coach}>
            <Avatar name={coach.name} size={38} tone="violet" />
            <View style={styles.coachText}>
              <Txt variant="bodyStrong">{coach.shortName}</Txt>
              <Txt variant="meta">Sustituir ejercicio</Txt>
            </View>
            <Icon name="chevron-right" size={16} tone={color.textMuted} />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.screen },
  scroll: { paddingBottom: 40 },
  hero: {
    backgroundColor: color.surface,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 20,
  },
  heroMedia: { width: 150, height: 140, marginTop: 26 },
  heroBar: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.glass,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTag: {
    backgroundColor: color.glass,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  body: { padding: GUTTER, gap: 16 },
  heading: { gap: 8 },
  title: { fontSize: 32 },
  stats: { flexDirection: 'row', gap: 8 },
  coach: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachText: { flex: 1, gap: 2 },
});
