import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Heading, Note, OrDivider } from '@/components/Note';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { useImport } from '@/state/ImportState';
import { color, radius } from '@/theme/tokens';

/** 15 · De dónde viene la rutina */
export default function ImportSource() {
  const { detectFrom } = useImport();

  const pickFile = () => {
    // A real picker (expo-document-picker) drops in here; the flow past this
    // point is identical either way.
    detectFrom('file');
    router.push('/importar/revision');
  };

  return (
    <Screen scroll gap={20}>
      <TopBar title="IMPORTAR" />

      <Heading
        title="Traé tu rutina como esté"
        subtitle="Si ya la tenés en una planilla o en un mensaje, no hace falta cargarla a mano."
      />

      <Card tone="dashed" radius={26} padding={20} gap={11} style={styles.dropzone} onPress={pickFile}>
        <View style={styles.fileMark}>
          <Txt variant="labelTight" tone={color.lime}>
            XLS
          </Txt>
        </View>
        <Txt variant="buttonUi">Subir archivo</Txt>
        <Txt variant="metaSm" tone={color.textFaint} center style={styles.formats}>
          {'.xlsx · .xls · .csv\nhasta 5 MB'}
        </Txt>
        <View style={styles.pickButton}>
          <Txt variant="labelTight" tone={color.ink}>
            ELEGIR ARCHIVO
          </Txt>
        </View>
      </Card>

      <OrDivider />

      <Card
        active
        radius={radius.xl}
        padding={18}
        style={styles.pasteRow}
        onPress={() => router.push('/importar/pegar')}
      >
        <View style={styles.pasteMark}>
          <Icon name="text" size={20} tone={color.ink} weight={2.4} />
        </View>
        <View style={styles.pasteText}>
          <Txt variant="rowTitle">Pegar texto</Txt>
          <Txt variant="meta">Un mensaje, una nota, una foto de la libreta</Txt>
        </View>
        <Icon name="chevron-right" size={16} tone={color.textMuted} />
      </Card>

      <View style={styles.footer}>
        <Note>
          La IA lee tu planilla y arma los ejercicios. Siempre te mostramos qué entendió antes de
          guardar nada.
        </Note>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dropzone: { alignItems: 'center' },
  fileMark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formats: { lineHeight: 18 },
  pickButton: {
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  pasteRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.surface },
  pasteMark: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteText: { flex: 1, gap: 2 },
  footer: { marginTop: 'auto' },
});
