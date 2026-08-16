import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { pushSetLog } from '@/api/client';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
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

/**
 * 02 · Sesión en vivo — the player. Tap the CTA to close a set, pick the load
 * you actually used, and the rest timer starts on its own.
 */
export default function LiveSession() {
  useKeepAwake();
  const { unit } = useApp();
  const { getToken } = useAuth();
  const refreshRemoteData = useRefreshRemoteData();
  const insets = useSafeAreaInsets();
  const routine = useQuery(getTodayRoutine);

  const session = useSession(routine.exercises, {
    unit,
    estimatedMinutes: routine.estimatedMinutes,
    onSetLogged: (entry) => {
      const payload = { routineId: routine.id, ...entry };
      void pushSetLog(getToken, payload)
        .then(() => refreshRemoteData())
        .catch((error: unknown) => {
          console.warn('[Coachlander] No se pudo sincronizar la serie', error);
        });
    },
  });

  const onCta = () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (session.press() === 'finish') router.back();
  };

  return (
    <Screen padded={false} bottomInset={false}>
      <View style={styles.bar}>
        <Pressable
          hitSlop={hitSlop}
          onPress={() => router.back()}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel="Minimizar sesión"
        >
          <Icon name="chevron-down" size={18} tone={color.textMuted} />
        </Pressable>

        <View style={styles.barCentre}>
          <Txt variant="labelSm">ENTRENANDO</Txt>
          <Txt variant="rowTitle" style={styles.barTitle}>
            {`${routine.block} · ${routine.name}`}
          </Txt>
        </View>

        <Pressable
          hitSlop={hitSlop}
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel="Más opciones"
        >
          <Icon name="more" size={16} tone={color.textMuted} />
        </Pressable>
      </View>

      {/* Movement demo. A real clip drops in here; until then the slot keeps
          the layout honest. */}
      <View style={styles.demoWrap}>
        <View style={styles.demo}>
          <View style={styles.demoTagLeft}>
            <Txt variant="label" tone={color.text} numberOfLines={1}>
              {`EJERCICIO ${session.exerciseNumber} DE ${session.totalExercises}`}
            </Txt>
          </View>
          <View style={styles.demoTagRight}>
            <Txt variant="label" numberOfLines={1}>
              LOOP 8 s
            </Txt>
          </View>
          <Txt variant="metaSm" tone={color.textFaint} style={styles.demoCaption}>
            [ demo del movimiento en video ]
          </Txt>
        </View>
      </View>

      <View style={styles.exerciseRow}>
        <View style={styles.exerciseText}>
          <Txt variant="h2" numberOfLines={2} style={styles.exerciseName}>
            {session.exercise.name}
          </Txt>
          <Txt variant="meta">{`${session.exercise.scheme} · RIR 2 · bajá en 3 s`}</Txt>
        </View>

        <Pressable
          style={styles.suggested}
          onPress={() => router.push(`/ejercicio/${session.exercise.id}`)}
          accessibilityRole="button"
        >
          <Txt variant="h5" tone={color.lime}>
            {session.suggestedShort}
          </Txt>
          <Txt variant="labelSm" tone={color.textMuted}>
            SUGERIDO
          </Txt>
        </Pressable>
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
          <Txt variant="clock" tone={session.phaseColor}>
            {session.phaseClock}
          </Txt>
          <Txt variant="labelTight" tone={color.textFaint}>
            {session.elapsedLabel}
          </Txt>
        </View>
      </View>

      <View style={styles.ctaWrap}>
        <Button
          label={session.ctaLabel}
          onPress={onCta}
          style={styles.cta}
          haptic={false}
        />
      </View>

      <Pressable
        onPress={session.toggleQueue}
        style={[styles.drawer, { paddingBottom: insets.bottom + 22 }]}
        accessibilityRole="button"
      >
        <View style={styles.grabber} />
        <Txt variant="labelSm">DESLIZÁ PARA VER LA RUTINA</Txt>
      </Pressable>

      {/* Up-next queue */}
      <Sheet visible={session.queueOpen} onClose={session.toggleQueue} bare>
        <View style={styles.queueHead}>
          <Txt variant="h4">A continuación</Txt>
          <Txt variant="label">{`${session.remaining} RESTAN`}</Txt>
        </View>
        <View style={styles.queueList}>
          {session.queue.map((item) => (
            <Row
              key={item.id}
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
                session.toggleQueue();
              }}
            />
          ))}
        </View>
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
            <Card tone="violet" radius={radius.xl} padding={18} onPress={session.useSuggested}>
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: 12,
    paddingBottom: 6,
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
  barCentre: { alignItems: 'center', gap: 3 },
  barTitle: { fontSize: 13 },

  demoWrap: { paddingHorizontal: GUTTER, paddingTop: 10 },
  demo: {
    height: 260,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    justifyContent: 'flex-end',
    padding: 18,
  },
  demoTagLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: color.violet,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  demoTagRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: color.glass,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  demoCaption: { alignSelf: 'flex-start' },

  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: GUTTER,
    paddingTop: 20,
  },
  exerciseText: { flex: 1, gap: 5 },
  exerciseName: { fontSize: 29, lineHeight: 30 },
  suggested: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lime,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'flex-end',
    gap: 2,
  },

  clockBlock: { paddingHorizontal: GUTTER, paddingTop: 14, gap: 10 },
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
    gap: 8,
    paddingTop: 6,
  },

  ctaWrap: { paddingHorizontal: GUTTER, paddingTop: 20 },
  cta: { height: 66 },

  drawer: { marginTop: 'auto', alignItems: 'center', gap: 9, paddingTop: 18 },
  grabber: { width: 46, height: 4, borderRadius: radius.pill, backgroundColor: color.border },

  queueHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  queueList: { gap: 8 },

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
