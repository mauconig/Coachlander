import { router } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Heading } from '@/components/Note';
import { StepProgress } from '@/components/Progress';
import { Screen } from '@/components/Screen';
import { BackButton } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getCoach } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { font } from '@/theme/type';
import { color, radius } from '@/theme/tokens';

const LENGTH = 6;

/** 12 · Código del entrenador — step 2 of 3 */
export default function CoachCode() {
  const { draft, patchDraft } = useApp();
  const coach = useQuery(getCoach);
  const input = useRef<TextInput>(null);
  const code = draft.coachCode;
  const found = code.length === LENGTH && code === coach.code;

  const onChange = (raw: string) => {
    patchDraft({ coachCode: raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH) });
  };

  const skip = () => {
    patchDraft({ soloTraining: true, coachCode: '', coachName: null });
    router.push('/datos');
  };

  return (
    <Screen scroll gap={22}>
      <View style={styles.stepper}>
        <BackButton />
        <StepProgress step={2} total={3} />
      </View>

      <Heading
        title="Conectate con tu entrenador"
        subtitle={`Pedile el código de ${LENGTH} dígitos que aparece en su perfil.`}
      />

      {/* One hidden input drives all six cells — taps anywhere focus it. */}
      <Pressable style={styles.cells} onPress={() => input.current?.focus()}>
        {/* Only the caret cell is lime — the one just typed, or the next empty
            one. Filled cells keep the plain border, as in the design. */}
        {Array.from({ length: LENGTH }, (_, i) => {
          const char = code[i];
          const caret = Math.min(code.length === 0 ? 0 : code.length - 1, LENGTH - 1);
          const active = i === caret;
          const tone = active ? color.lime : char ? color.text : color.border;
          return (
            <View key={i} style={[styles.cell, active && styles.cellHot]}>
              <Txt style={[styles.cellText, { color: tone }]}>{char ?? '·'}</Txt>
            </View>
          );
        })}
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={LENGTH}
          style={styles.hiddenInput}
          caretHidden
        />
      </Pressable>

      {found ? (
        <Card padding={18} style={styles.match}>
          <Avatar name={coach.name} size={48} tone="violet" />
          <View style={styles.matchText}>
            <Txt variant="h5">{coach.name}</Txt>
            <Txt variant="meta">{coach.specialty}</Txt>
          </View>
          <Txt variant="labelTight" tone={color.lime}>
            ENCONTRADA
          </Txt>
        </Card>
      ) : (
        <Card tone="muted" padding={18} style={styles.match}>
          <Txt variant="meta" tone={color.textFaint}>
            Escribí el código para ver a quién te conecta.
          </Txt>
        </Card>
      )}

      <Pressable onPress={skip} accessibilityRole="button">
        <Txt variant="body" tone={color.textFaint} center>
          Todavía no tengo entrenador, quiero entrenar solo
        </Txt>
      </Pressable>

      <Button
        label="Enviar solicitud"
        disabled={!found}
        onPress={() => router.push('/datos')}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cells: { flexDirection: 'row', gap: 9 },
  cell: {
    flex: 1,
    height: 66,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellHot: { borderColor: color.lime },
  cellText: { fontFamily: font.monoBold, fontSize: 26 },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  matchText: { flex: 1, gap: 3 },
  cta: { marginTop: 'auto' },
});
