import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { cancelSession, endSession, startSession, stopSession } from '@/api/client';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar } from '@/components/Progress';
import { Row, RowIndex } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useSession } from '@/session/useSession';
import { useApp } from '@/state/AppState';
import { useRefreshRemoteData } from '@/state/RemoteState';
import { font } from '@/theme/type';
import { GUTTER, color, hitSlop, radius } from '@/theme/tokens';

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'del'],
];

type ClosingAction = 'finish' | 'stop' | 'cancel' | null;
type Confirmation = Exclude<ClosingAction, 'finish' | null> | null;

function PlayerAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`session-action-${label.toLowerCase()}`}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.playerAction,
        pressed && styles.playerActionPressed,
        disabled && styles.playerActionDisabled,
      ]}
    >
      <Icon name={icon} size={22} tone={disabled ? color.textFaint : color.text} />
      <Txt variant="labelTight" tone={disabled ? color.textFaint : color.text} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

function repsLabelFromScheme(scheme: string, fallback: number) {
  const [, reps] = scheme.split(/[x×]/i);
  return reps?.trim().replace(/\s*reps?$/i, '') || String(fallback);
}

/**
 * 02 · Sesión en vivo — the player. Tap the CTA to close a set, pick the load
 * you actually used, and the rest timer starts on its own.
 */
export default function LiveSession() {
  useKeepAwake();
  const { unit } = useApp();
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const routine = useQuery(getTodayRoutine);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [closingAction, setClosingAction] = useState<ClosingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const startRequestRef = useRef<{ routineId: string; promise: Promise<void> } | null>(null);

  const session = useSession(routine.exercises, {
    enabled: !closingAction,
    unit,
    estimatedMinutes: routine.estimatedMinutes,
    routineId: routine.id,
    routineTitle: `${routine.block} · ${routine.name}`,
  });
  const exerciseRepsLabel = repsLabelFromScheme(session.exercise.scheme, session.reps);

  const openQueueRef = useRef(session.openQueue);
  openQueueRef.current = session.openQueue;
  const queuePanResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (!queuePanResponderRef.current) {
    queuePanResponderRef.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -36 || gesture.vy < -0.45) openQueueRef.current();
      },
    });
  }

  // Marca "entrenando ahora" en el cliente vinculado al abrir la sesión.
  useEffect(() => {
    // No enviar el inicio remoto mientras el atleta sigue en el countdown.
    if (
      session.remoteStarted ||
      !routine.id ||
      session.phase === 'countdown' ||
      startRequestRef.current?.routineId === routine.id
    ) return;
    const promise = startSession(getToken, routine.id)
      .then(() => {
        session.markRemoteStarted();
      })
      .catch((error: unknown) => {
        if (startRequestRef.current?.routineId === routine.id) startRequestRef.current = null;
        console.warn('[Coachlander] No se pudo marcar el inicio de sesión', error);
        throw error;
      });
    startRequestRef.current = { routineId: routine.id, promise };
    void promise.catch(() => undefined);
  }, [getToken, routine.id, session.markRemoteStarted, session.phase, session.remoteStarted]);

  useEffect(() => {
    setMediaFailed(false);
  }, [session.exercise.id]);

  const syncLocalSetLogs = async () => {
    if (!session.loggedSets.length) return;
    const sessionId = session.runtime?.sessionId;
    if (!sessionId) throw new Error('No encontramos la sesión local para sincronizar');
    await session.stageSessionSync({
      sessionId,
      routineId: routine.id,
      sets: session.loggedSets,
    });
    await session.retryPendingSessionSync(sessionId);
  };

  const ensureRemoteStarted = async () => {
    if (!routine.id || session.phase === 'countdown') return false;
    if (session.remoteStarted) return true;
    if (startRequestRef.current?.routineId === routine.id) {
      await startRequestRef.current.promise;
      return true;
    }
    const promise = startSession(getToken, routine.id).then(() => {
      session.markRemoteStarted();
    });
    startRequestRef.current = { routineId: routine.id, promise };
    try {
      await promise;
    } catch (error) {
      if (startRequestRef.current?.promise === promise) startRequestRef.current = null;
      throw error;
    }
    return true;
  };

  const refreshAfterClose = async () => {
    try {
      await refreshRemoteData({ force: true });
    } catch (refreshError) {
      console.warn('[Coachlander] No se pudo refrescar la rutina tras cerrar', refreshError);
    }
  };

  const finishRoutine = async () => {
    if (closingAction) return;
    setClosingAction('finish');
    setActionError(null);
    try {
      await ensureRemoteStarted();
      await syncLocalSetLogs();
      await endSession(getToken, routine.id);
      await refreshAfterClose();
      session.finish();
      router.back();
    } catch (error) {
      console.warn('[Coachlander] No se pudo marcar la sesión como completada', error);
      setActionError('No pudimos terminar la rutina. Conservamos todo para que vuelvas a intentar.');
      setClosingAction(null);
    }
  };

  const onCta = () => {
    if (closingAction) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (session.press() === 'finish') {
      void finishRoutine();
    }
  };

  const leaveSession = async (action: Exclude<ClosingAction, 'finish' | null>) => {
    if (closingAction) return;
    setClosingAction(action);
    setActionError(null);
    try {
      const started = await ensureRemoteStarted();
      if (action === 'stop') {
        await syncLocalSetLogs();
        if (started) await stopSession(getToken, routine.id);
      } else {
        if (started) await cancelSession(getToken, routine.id);
      }
      await refreshAfterClose();
      session.discard();
      router.back();
    } catch (error) {
      console.warn('[Coachlander] No se pudo cerrar la sesión', error);
      setActionError(
        action === 'stop'
          ? 'No pudimos guardar la sesión parcial. Conservamos todo para que vuelvas a intentar.'
          : 'No pudimos cancelar la rutina. La sesión sigue guardada en este teléfono.',
      );
      setClosingAction(null);
    }
  };

  const openStopConfirmation = () => {
    setOptionsOpen(false);
    setActionError(null);
    setConfirmation('stop');
  };

  const openCancelConfirmation = () => {
    setOptionsOpen(false);
    setActionError(null);
    setConfirmation('cancel');
  };

  const skipExercise = () => {
    if (!session.canSkipExercise || closingAction) return;
    if (session.isLastExercise) {
      openStopConfirmation();
      return;
    }
    session.skipExercise();
  };

  const playerFooter = (
    <View style={styles.footerControls}>
      <View {...queuePanResponderRef.current.panHandlers}>
        <Pressable
          onPress={session.openQueue}
          style={({ pressed }) => [styles.queueTrigger, pressed && styles.queueTriggerPressed]}
          accessibilityRole="button"
          accessibilityLabel="Ver todos los ejercicios de la rutina"
          accessibilityHint="Tocá o deslizá hacia arriba"
        >
          <View style={styles.grabber} />
          <View style={styles.queueTriggerCopy}>
            <Txt variant="labelTight" tone={color.text}>VER RUTINA</Txt>
            <Txt variant="metaSm" numberOfLines={1}>{`${session.exerciseNumber}/${session.totalExercises}`}</Txt>
          </View>
          <Icon name="chevron-right" size={17} tone={color.textMuted} />
        </Pressable>
      </View>

      {actionError && !confirmation ? (
        <View style={styles.inlineError}>
          <Txt variant="metaSm" tone="#FF8A92">{actionError}</Txt>
        </View>
      ) : null}

      <Button
        label={closingAction === 'finish' ? 'TERMINANDO…' : session.ctaLabel}
        onPress={onCta}
        disabled={!!closingAction}
        testID="session-primary-cta"
        style={styles.cta}
        haptic={false}
      />
      <View style={styles.quickActions}>
        <PlayerAction
          icon="skip-next"
          label="SALTAR"
          disabled={!session.canSkipExercise || !!closingAction}
          onPress={skipExercise}
        />
        <PlayerAction
          icon="stop"
          label="PARAR"
          disabled={session.phase === 'countdown' || !!closingAction}
          onPress={openStopConfirmation}
        />
        <PlayerAction
          icon="more"
          label="OPCIONES"
          disabled={!!closingAction}
          onPress={() => {
            setActionError(null);
            setOptionsOpen(true);
          }}
        />
      </View>
    </View>
  );

  return (
    <Screen
      padded={false}
      bottomInset={false}
      footer={playerFooter}
      contentStyle={styles.playerBody}
    >
      <View style={styles.bar}>
        <Pressable
          hitSlop={hitSlop}
          onPress={() => {
            session.minimize();
            router.back();
          }}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel="Minimizar sesión"
        >
          <Icon name="chevron-down" size={18} tone={color.textMuted} />
        </Pressable>

        <View style={styles.barCentre}>
          <Txt variant="labelSm">{routine.day ? `DÍA ${routine.day}` : 'SESIÓN ACTIVA'}</Txt>
          <Txt variant="rowTitle" style={styles.barTitle} numberOfLines={1} ellipsizeMode="tail">
            {routine.name || routine.block || 'Rutina'}
          </Txt>
        </View>

        <View style={styles.circleSpacer} />
      </View>

      {/* GIF del movimiento actual; si falla, mostramos la imagen fija del catálogo. */}
      <View style={styles.demoWrap}>
        <View
          style={[
            styles.demo,
            (session.exercise.gifUrl || session.exercise.imageUrl) && styles.demoWithMedia,
          ]}
        >
          {session.exercise.gifUrl || session.exercise.imageUrl ? (
            <Image
              source={{
                uri: mediaFailed
                  ? session.exercise.imageUrl ?? session.exercise.gifUrl!
                  : session.exercise.gifUrl ?? session.exercise.imageUrl!,
              }}
              style={styles.demoMedia}
              contentFit="contain"
              autoplay
              onError={() => setMediaFailed(true)}
              accessibilityLabel={`Demostración de ${session.exercise.name}`}
            />
          ) : null}
          <View style={styles.demoTagLeft}>
            <Txt variant="label" tone={color.text} numberOfLines={1}>
              {`EJERCICIO ${session.exerciseNumber} DE ${session.totalExercises}`}
            </Txt>
          </View>
          {!session.exercise.gifUrl && !session.exercise.imageUrl ? (
            <Txt variant="metaSm" tone={color.textFaint} style={styles.demoCaption}>
              No hay una demostración disponible para este ejercicio.
            </Txt>
          ) : null}
        </View>
      </View>

      <View style={styles.exerciseBlock}>
        <Txt variant="h2" numberOfLines={2} style={styles.exerciseName}>
          {session.exercise.name}
        </Txt>

        <View style={styles.exerciseSummary}>
          <View style={styles.metricChip}>
            <Txt variant="labelTight" tone={color.textSoft} numberOfLines={1}>
              {`${session.exercise.sets} ${session.exercise.sets === 1 ? 'SERIE' : 'SERIES'}`}
            </Txt>
          </View>
          <View style={styles.metricChip}>
            <Txt variant="labelTight" tone={color.textSoft} numberOfLines={1}>
              {`${exerciseRepsLabel} REPS`}
            </Txt>
          </View>
          <Pressable
            style={({ pressed }) => [styles.loadMetric, pressed && styles.loadRowPressed]}
            onPress={() => router.push(`/ejercicio/${session.exercise.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalle. Carga sugerida ${session.suggestedShort}`}
          >
            <View style={styles.loadCopy}>
              <Txt variant="labelSm">CARGA</Txt>
              <Txt variant="labelTight" tone={color.lime} numberOfLines={1}>
                {session.suggestedShort}
              </Txt>
            </View>
            <Icon name="chevron-right" size={16} tone={color.textMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.clockBlock}>
        <ProgressBar value={session.phaseProgress} tone={session.phaseColor} />

        <View style={styles.phaseRow}>
          {/* Phase text is the live one — the set counter truncates first. */}
          <Txt variant="label" tone={session.phaseColor} numberOfLines={1}>
            {session.phaseLabel}
          </Txt>
          <Txt variant="label" tone={color.textFaint} numberOfLines={1} style={styles.setCounter}>
            {session.setCounter}
          </Txt>
        </View>

        <View style={styles.clockRow}>
          <Txt variant="clock" tone={session.phaseColor} style={styles.clockValue}>
            {session.phaseClock}
          </Txt>
          <Txt variant="labelTight" tone={color.textFaint}>
            {session.elapsedLabel}
          </Txt>
        </View>
      </View>

      <Sheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        eyebrow="CONTROL DE SESIÓN"
        title="Opciones"
      >
        <View style={styles.optionsList}>
          <Pressable
            onPress={session.toggleSound}
            style={({ pressed }) => [styles.optionRow, pressed && styles.optionPressed]}
            accessibilityRole="button"
            accessibilityLabel={session.soundEnabled ? 'Silenciar sonidos de sesión' : 'Activar sonidos de sesión'}
          >
            <View style={styles.optionCopy}>
              <Txt variant="h5">Sonidos de sesión</Txt>
              <Txt variant="meta">Avisos durante ejercicios, descansos y finalización.</Txt>
            </View>
            <View style={[styles.statusPill, session.soundEnabled && styles.statusPillActive]}>
              <Txt variant="labelTight" tone={session.soundEnabled ? color.ink : color.textMuted}>
                {session.soundEnabled ? 'ACTIVOS' : 'SILENCIO'}
              </Txt>
            </View>
          </Pressable>

          <Pressable
            onPress={openCancelConfirmation}
            style={({ pressed }) => [styles.optionRow, styles.optionDanger, pressed && styles.optionPressed]}
            accessibilityRole="button"
          >
            <View style={styles.optionCopy}>
              <Txt variant="h5" tone="#FF5D67">Cancelar rutina</Txt>
              <Txt variant="meta">Descartar las series de esta sesión.</Txt>
            </View>
            <Icon name="close" size={18} tone="#FF5D67" />
          </Pressable>
        </View>
      </Sheet>

      <Sheet
        visible={confirmation === 'stop'}
        onClose={() => {
          if (!closingAction) {
            setConfirmation(null);
            setActionError(null);
          }
        }}
        eyebrow="SESIÓN PARCIAL"
        title="¿Parar acá?"
      >
        <View style={styles.confirmationBody}>
          <View style={styles.confirmationSummary}>
            <Txt variant="h3" tone={color.lime}>{session.completedSets}</Txt>
            <View style={styles.confirmationCopy}>
              <Txt variant="bodyStrong">
                {session.completedSets === 1 ? 'serie registrada' : 'series registradas'}
              </Txt>
              <Txt variant="meta">de {session.totalSets} series planificadas</Txt>
            </View>
          </View>
          <Txt variant="prose">
            Guardaremos lo que hiciste como una sesión parcial. Sus series se conservan, pero no contará como rutina cumplida.
          </Txt>
          {actionError ? (
            <View style={styles.sheetError}>
              <Txt variant="meta" tone="#FF8A92">{actionError}</Txt>
            </View>
          ) : null}
          <View style={styles.confirmationActions}>
            <Button
              label="SEGUIR ENTRENANDO"
              testID="session-stop-continue"
              variant="outline"
              size="md"
              disabled={!!closingAction}
              onPress={() => {
                setConfirmation(null);
                setActionError(null);
              }}
            />
            <Button
              label={closingAction === 'stop' ? 'GUARDANDO…' : 'PARAR Y GUARDAR'}
              testID="session-stop-confirm"
              variant="violet"
              size="md"
              disabled={!!closingAction}
              icon={<Icon name="stop" size={18} tone={color.text} />}
              onPress={() => void leaveSession('stop')}
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        visible={confirmation === 'cancel'}
        onClose={() => {
          if (!closingAction) {
            setConfirmation(null);
            setActionError(null);
          }
        }}
        eyebrow="ACCIÓN DESTRUCTIVA"
        title="¿Cancelar rutina?"
      >
        <View style={styles.confirmationBody}>
          <Txt variant="prose">
            Se eliminarán únicamente las series de esta sesión. La rutina volverá a quedar disponible para empezarla nuevamente.
          </Txt>
          {actionError ? (
            <View style={styles.sheetError}>
              <Txt variant="meta" tone="#FF8A92">{actionError}</Txt>
            </View>
          ) : null}
          <View style={styles.confirmationActions}>
            <Button
              label="VOLVER"
              testID="session-cancel-back"
              variant="outline"
              size="md"
              disabled={!!closingAction}
              onPress={() => {
                setConfirmation(null);
                setActionError(null);
              }}
            />
            <Button
              label={closingAction === 'cancel' ? 'CANCELANDO…' : 'CANCELAR RUTINA'}
              testID="session-cancel-confirm"
              variant="danger"
              size="md"
              disabled={!!closingAction}
              onPress={() => void leaveSession('cancel')}
            />
          </View>
        </View>
      </Sheet>

      {/* Up-next queue */}
      <Sheet visible={session.queueOpen} onClose={session.closeQueue} bare swipeToDismiss>
        <View style={styles.queueHead}>
          <Txt variant="h4">A continuación</Txt>
          <Txt variant="label">{`${session.remaining} RESTAN`}</Txt>
        </View>
        <ScrollView
          style={styles.queueScroll}
          contentContainerStyle={styles.queueList}
          showsVerticalScrollIndicator={false}
        >
          {session.queue.map((item) => (
            <Row
              key={`${item.id}-${item.index}`}
              tone={item.current ? 'surface' : 'muted'}
              active={item.current}
              left={<RowIndex n={item.index + 1} tone={item.current ? color.lime : color.violet} />}
              title={item.name}
              titleTone={item.past ? color.textMuted : color.text}
              meta={item.meta}
              trailing={item.tag}
              trailingTone={item.current ? color.lime : color.textFaint}
              onPress={() => {
                session.goTo(item.index);
                session.closeQueue();
              }}
            />
          ))}
        </ScrollView>
      </Sheet>

      {/* Load picker for the set just closed */}
      <Sheet
        visible={session.sheet !== null}
        onClose={session.closeSheet}
        eyebrow={`SERIE ${(session.sheet ?? 0) + 1} HECHA · ¿CON CUÁNTO?`}
        title={session.exercise.name}
      >
        {session.keypad ? (
          <View style={styles.keypadBlock}>
            <View style={styles.readout}>
              <Txt style={styles.readoutValue}>{session.typedDisplay}</Txt>
              <Txt variant="body" tone={color.textMuted}>
                {`${unit} × ${session.reps} reps`}
              </Txt>
            </View>

            <View style={styles.keypad}>
              {KEY_ROWS.map((row, r) => (
                <View key={r} style={styles.keyRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => session.pressKey(key === ',' ? '.' : key)}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={key === 'del' ? 'Borrar' : key}
                    >
                      {key === 'del' ? (
                        <Icon name="backspace" size={20} tone={color.textMuted} />
                      ) : (
                        <Txt style={styles.keyText}>{key}</Txt>
                      )}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <Button label="Guardar serie" size="md" onPress={session.confirmTyped} />
          </View>
        ) : (
          <View style={styles.pickerBlock}>
            <Card testID="session-use-suggested" tone="violet" radius={radius.xl} padding={18} onPress={session.useSuggested}>
              <View style={styles.pickRow}>
                <View style={styles.pickText}>
                  <Txt variant="label" tone={color.onViolet}>
                    SUGERIDO POR TU PLAN
                  </Txt>
                  <Txt variant="h3" style={styles.pickValue}>
                    {session.suggestedLabel}
                  </Txt>
                </View>
                <View style={styles.pickBadgeLime}>
                  <Txt variant="labelTight" tone={color.ink}>
                    USAR
                  </Txt>
                </View>
              </View>
            </Card>

            <Card
              testID="session-use-more"
              tone="muted"
              active
              radius={radius.xl}
              padding={18}
              onPress={session.useMore}
              style={styles.pickRaised}
            >
              <View style={styles.pickRow}>
                <View style={styles.pickText}>
                  <Txt variant="label" tone={color.lime}>
                    UN POCO MÁS
                  </Txt>
                  <Txt variant="h3" style={styles.pickValue}>
                    {session.moreLabel}
                  </Txt>
                </View>
                <View style={styles.pickBadge}>
                  <Txt variant="labelTight">+2,5</Txt>
                </View>
              </View>
            </Card>

            <Card
              testID="session-open-keypad"
              tone="muted"
              radius={radius.xl}
              padding={18}
              onPress={session.openKeypad}
              style={styles.pickRaised}
            >
              <View style={styles.pickRow}>
                <View style={styles.pickText}>
                  <Txt variant="label">PERSONALIZADO</Txt>
                  <Txt variant="h3" tone={color.textMuted} style={styles.pickValue}>
                    Escribir peso y reps
                  </Txt>
                </View>
                <View style={styles.pickBadge}>
                  <Txt variant="labelTight">123</Txt>
                </View>
              </View>
            </Card>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  playerBody: {
    paddingTop: 0,
    minHeight: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 4,
  },
  circle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSpacer: { width: 34, height: 34 },
  barCentre: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingHorizontal: 12 },
  barTitle: { width: '100%', fontSize: 13, textAlign: 'center' },

  demoWrap: {
    flex: 1,
    minHeight: 164,
    paddingTop: 7,
  },
  demo: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    justifyContent: 'flex-end',
    padding: 14,
    overflow: 'hidden',
  },
  demoWithMedia: {
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
  },
  demoMedia: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  demoTagLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: color.violet,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  demoCaption: { alignSelf: 'flex-start' },

  exerciseBlock: {
    gap: 7,
    paddingHorizontal: GUTTER,
    paddingTop: 9,
  },
  exerciseName: { fontSize: 20, lineHeight: 22 },
  exerciseSummary: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  metricChip: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  loadMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 9,
  },
  loadRowPressed: { opacity: 0.75 },
  loadCopy: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },

  clockBlock: { paddingHorizontal: GUTTER, paddingTop: 8, gap: 4 },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  setCounter: { flexShrink: 1 },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 7,
  },
  clockValue: { fontSize: 62, lineHeight: 68 },

  footerControls: {
    gap: 7,
    paddingHorizontal: GUTTER,
    backgroundColor: color.screen,
  },
  cta: { height: 52 },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  playerAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  playerActionPressed: { backgroundColor: color.raised, transform: [{ scale: 0.98 }] },
  playerActionDisabled: { opacity: 0.38 },
  queueTrigger: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceAlt,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 14,
  },
  queueTriggerPressed: { backgroundColor: color.surface },
  queueTriggerCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  grabber: {
    position: 'absolute',
    top: 5,
    left: '50%',
    width: 46,
    height: 4,
    marginLeft: -23,
    borderRadius: radius.pill,
    backgroundColor: color.border,
  },
  inlineError: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,93,103,0.45)',
    backgroundColor: 'rgba(255,93,103,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  queueHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  queueScroll: { maxHeight: 420 },
  queueList: { gap: 8 },

  optionsList: { gap: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.border,
  },
  optionCopy: { flex: 1, gap: 4 },
  optionPressed: { opacity: 0.72 },
  optionDanger: { borderColor: '#FF5D67' },
  statusPill: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPillActive: { borderColor: color.lime, backgroundColor: color.lime },

  confirmationBody: { gap: 16 },
  confirmationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceAlt,
    padding: 16,
  },
  confirmationCopy: { flex: 1, gap: 2 },
  confirmationActions: { gap: 9 },
  sheetError: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,93,103,0.45)',
    backgroundColor: 'rgba(255,93,103,0.08)',
    padding: 12,
  },

  keypadBlock: { gap: 14 },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.screen,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 18,
  },
  readoutValue: {
    fontFamily: font.displayXBold,
    fontSize: 40,
    letterSpacing: -1.2,
    color: color.lime,
  },
  keypad: { gap: 8 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: {
    flex: 1,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: color.border },
  keyText: { fontFamily: font.monoBold, fontSize: 20, color: color.text },

  pickerBlock: { gap: 10 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pickText: { flex: 1, gap: 3 },
  pickValue: { fontSize: 24, lineHeight: 26 },
  pickRaised: { backgroundColor: color.raised },
  pickBadgeLime: {
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickBadge: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
