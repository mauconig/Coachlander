import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getMeta } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useImport } from '@/state/ImportState';
import { font } from '@/theme/type';
import { color, radius } from '@/theme/tokens';

/** 16 · Pegar texto — free-form input the parser will read. */
export default function PasteRoutine() {
  const { pasted, setPasted, detectFrom } = useImport();
  const sampleText = useQuery((db) => getMeta(db, 'import_sample_text'));

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    setPasted(text || sampleText);
  };

  const detect = () => {
    detectFrom('text');
    router.push('/importar/revision');
  };

  return (
    <Screen padded={false} bottomInset={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <TopBar title="TEXTO LIBRE" action="PEGAR" onAction={paste} />

          <Txt variant="h1" style={styles.title}>
            Pegá la rutina tal cual
          </Txt>

          <View style={styles.editor}>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              placeholder={sampleText}
              placeholderTextColor={color.textFaint}
              multiline
              textAlignVertical="top"
              selectionColor={color.lime}
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={paste} accessibilityRole="button">
              <Txt variant="labelTight">PEGAR DEL PORTAPAPELES</Txt>
            </Pressable>
            <Pressable
              style={styles.action}
              onPress={() => setPasted('')}
              accessibilityRole="button"
            >
              <Txt variant="labelTight">LIMPIAR</Txt>
            </Pressable>
          </View>

          <View style={styles.hint}>
            <Txt variant="labelTight" tone={color.lime}>
              i
            </Txt>
            <Txt variant="body" style={styles.hintText}>
              Sirve cualquier formato: abreviaturas, kilos con coma o punto, notas al final.
            </Txt>
          </View>

          <Button
            label="Detectar rutina"
            icon={<Icon name="file" size={16} tone={color.ink} />}
            onPress={detect}
            style={styles.cta}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 16 },
  title: { fontSize: 30 },
  editor: {
    flex: 1,
    minHeight: 180,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lime,
    borderRadius: radius.xl,
    padding: 18,
  },
  input: {
    flex: 1,
    color: color.textSoft,
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: 23,
  },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hintText: { flex: 1 },
  cta: { marginTop: 'auto' },
});
