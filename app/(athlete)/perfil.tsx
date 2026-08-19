import { useAuth } from '@clerk/expo';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { deleteCurrentRoutine } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getAthlete, getCoach, getSettings, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { num } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

/** 06 · Perfil del alumno */
export default function AthleteProfile() {
  const { getToken } = useAuth();
  const { unit, draft, switchRole, signOut } = useApp();
  const refreshRemoteData = useRefreshRemoteData();
  const athlete = useQuery(getAthlete);
  const coach = useQuery(getCoach);
  const settings = useQuery((db) => getSettings(db, 'athlete'));
  const routine = useQuery(getTodayRoutine);
  const [deletingRoutine, setDeletingRoutine] = useState(false);
  const [routineError, setRoutineError] = useState('');
  const canDeleteRoutine = draft.soloTraining;

  useFocusEffect(
    useCallback(() => {
      void refreshRemoteData().catch((error: unknown) => {
        console.warn('[Coachlander] No se pudo actualizar el perfil', error);
      });
    }, [refreshRemoteData]),
  );

  const removeRoutine = async () => {
    setDeletingRoutine(true);
    setRoutineError('');
    try {
      await deleteCurrentRoutine(getToken);
      await refreshRemoteData();
    } catch (error: unknown) {
      setRoutineError(error instanceof Error ? error.message : 'No pudimos eliminar la rutina.');
    } finally {
      setDeletingRoutine(false);
    }
  };

  const confirmRemoveRoutine = () => {
    Alert.alert(
      'Eliminar rutina',
      'Se van a borrar todos los días y ejercicios de tu plan actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void removeRoutine() },
      ],
    );
  };

  return (
    <Screen scroll gap={16}>
      <View style={styles.identity}>
        <Avatar name={athlete.name} size={72} />
        <View style={styles.identityText}>
          <Txt variant="h3">{athlete.name}</Txt>
          <Txt variant="meta">{athlete.goal}</Txt>
        </View>
      </View>

      {canDeleteRoutine ? (
        <Card tone="muted" padding={18} gap={12}>
        <Txt variant="label" tone={color.lime}>
          GESTIONAR RUTINA
        </Txt>
        <Txt variant="h5" numberOfLines={2}>
          {routine.id ? routine.name.split(' · ')[0] : 'Sin rutina cargada'}
        </Txt>
        <Txt variant="body" tone={color.textMuted}>
          {routine.id
            ? canDeleteRoutine
              ? 'Podés reemplazar tu plan o eliminarlo para volver a empezar.'
              : 'Esta rutina fue asignada y la administra tu entrenadora.'
            : canDeleteRoutine
              ? 'Importá una rutina de entre 1 y 7 días para verla en Hoy.'
              : 'Tu entrenadora todavía no te asignó una rutina.'}
        </Txt>
        {canDeleteRoutine ? (
          <View style={styles.routineActions}>
            <Button
              label={routine.id ? 'Cambiar rutina' : 'Cargar rutina'}
              variant={routine.id ? 'outline' : 'primary'}
              size="sm"
              fill
              onPress={() => router.push('/importar/origen')}
            />
            {routine.id ? (
              <Button
                label={deletingRoutine ? 'Eliminando...' : 'Eliminar'}
                variant="ghost"
                size="sm"
                onPress={confirmRemoveRoutine}
                disabled={deletingRoutine}
              />
            ) : null}
          </View>
        ) : null}
        {routineError ? <Txt variant="meta" tone={color.textSoft}>{routineError}</Txt> : null}
        </Card>
      ) : null}

      {!draft.soloTraining && coach.name ? (
        <Card tone="violet" padding={18} style={styles.coach}>
          <Avatar name={coach.name} size={46} tone="lime" />
          <View style={styles.coachText}>
            <Txt variant="label" tone={color.onViolet}>
              TU ENTRENADOR/A
            </Txt>
            <Txt variant="h5">{coach.name}</Txt>
          </View>
          <Pressable style={styles.write} accessibilityRole="button">
            <Txt variant="labelTight" tone={color.text}>
              ESCRIBIR
            </Txt>
          </Pressable>
        </Card>
      ) : null}

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatTile value={num(athlete.weightKg)} unit={unit} label="PESO ACTUAL" />
          <StatTile value={num(athlete.heightM)} unit="m" label="ALTURA" />
        </View>
        <View style={styles.gridRow}>
          <StatTile
            value={String(athlete.totalSessions)}
            label="SESIONES TOTALES"
            valueTone={color.lime}
          />
          <StatTile
            value={String(athlete.streakWeeks)}
            label="SEMANAS SEGUIDAS"
            valueTone={color.lime}
          />
        </View>
      </View>

      <View style={styles.settings}>
        {settings.map((item, i) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={[styles.setting, i < settings.length - 1 && styles.settingDivider]}
          >
            <Txt variant="bodyStrong" style={styles.settingLabel}>
              {item.label}
            </Txt>
            {item.value ? (
              <Txt variant="meta" tone={item.accent ? color.lime : color.textMuted}>
                {item.value}
              </Txt>
            ) : null}
            <Icon name="chevron-right" size={14} tone={color.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* Role switching is in the design's copy ("podés cambiarlo después
          desde tu perfil") — this is where it lives. */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            switchRole('coach');
            router.replace('/alumnos');
          }}
          accessibilityRole="button"
        >
          <Txt variant="body" tone={color.textFaint} center>
            Cambiar a modo entrenador
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => {
            void signOut()
              .then(() => router.replace('/bienvenida'))
              .catch((error: unknown) => {
                Alert.alert(
                  'No pudimos cerrar la sesiÃ³n',
                  error instanceof Error ? error.message : 'ProbÃ¡ nuevamente.',
                );
              });
          }}
          accessibilityRole="button"
        >
          <Txt variant="body" tone={color.textFaint} center>
            Cerrar sesión
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, gap: 4 },
  coach: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachText: { flex: 1, gap: 2 },
  write: {
    backgroundColor: color.onVioletFill,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  grid: { gap: 9 },
  gridRow: { flexDirection: 'row', gap: 9 },
  routineActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settings: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  settingDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  settingLabel: { flex: 1 },
  footer: { gap: 14, paddingTop: 6 },
});
