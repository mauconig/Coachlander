import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { Txt } from '@/components/Txt';
import { getMetaNumber } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { weight } from '@/lib/format';
import { useApp } from '@/state/AppState';
import { useImport } from '@/state/ImportState';
import { color, radius } from '@/theme/tokens';

/** 17 · Lo que detectó la IA — review before anything is saved. */
export default function ImportReview() {
  const { unit } = useApp();
  const { detected, sourceLabel, resolve, discard } = useImport();
  const estimateMinutes = useQuery((db) => getMetaNumber(db, 'import_estimate_minutes'));

  const totalSets = detected.reduce((n, e) => n + e.sets, 0);
  const uncertain = detected.filter((e) => e.uncertain).length;
  const sure = detected.length - uncertain;

  return (
    <Screen
      scroll
      gap={14}
      footer={
        <View style={styles.footer}>
          <Pressable
            style={styles.discard}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Txt variant="labelTight">DESCARTAR</Txt>
          </Pressable>
          <Button
            label="Guardar rutina"
            size="md"
            fill
            onPress={() => router.push('/importar/asignar')}
          />
        </View>
      }
    >
      <TopBar title="REVISAR IMPORTACIÓN" action="EDITAR" actionTone={color.lime} />

      <Card tone="violet" radius={radius.xxl} padding={18} gap={10}>
        <Txt variant="label" tone={color.onViolet}>
          {`DETECTADO DE ${sourceLabel.toUpperCase()}`}
        </Txt>
        <Txt variant="h3">{`${detected.length} ejercicios · ${totalSets} series`}</Txt>
        <View style={styles.badges}>
          <View style={styles.badgeLime}>
            <Txt variant="labelTight" tone={color.ink}>
              {`${sure} SEGUROS`}
            </Txt>
          </View>
          <View style={styles.badge}>
            <Txt variant="labelTight" tone={color.text}>
              {`${uncertain} A REVISAR`}
            </Txt>
          </View>
          <View style={styles.badge}>
            <Txt variant="labelTight" tone={color.text}>
              {`${estimateMinutes} MIN EST.`}
            </Txt>
          </View>
        </View>
      </Card>

      <View style={styles.list}>
        {detected.map((item) =>
          item.uncertain ? (
            <Card key={item.id} active radius={radius.md} padding={16} gap={12}>
              <View style={styles.questionRow}>
                <Icon name="question" size={16} tone={color.lime} />
                <View style={styles.questionText}>
                  <Txt variant="rowTitle">{item.raw ?? item.name}</Txt>
                  <Txt variant="meta" tone={color.lime}>
                    {item.question}
                  </Txt>
                </View>
              </View>

              <View style={styles.options}>
                {(item.options ?? []).map((option, i) => (
                  <Pressable
                    key={option}
                    onPress={() => resolve(item.id, i as 0 | 1)}
                    accessibilityRole="button"
                    style={[styles.option, i === 0 ? styles.optionPrimary : styles.optionSecondary]}
                  >
                    <Txt variant="labelTight" tone={i === 0 ? color.ink : color.textMuted}>
                      {option}
                    </Txt>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={() => discard(item.id)} accessibilityRole="button">
                <Txt variant="meta" tone={color.textFaint} center>
                  Descartar esta línea
                </Txt>
              </Pressable>
            </Card>
          ) : (
            <Row
              key={item.id}
              left={<Icon name="check" size={13} tone={color.lime} weight={2.6} />}
              title={item.name}
              meta={`${item.sets} × ${item.reps} · ${weight(item.load, unit)} · ${item.rest} s`}
              chevron
            />
          ),
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badgeLime: {
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  badge: {
    backgroundColor: color.onVioletFill,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  list: { gap: 8 },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  questionText: { flex: 1, gap: 2 },
  options: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  optionPrimary: { backgroundColor: color.lime },
  optionSecondary: { borderWidth: 1, borderColor: color.border },
  footer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  discard: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
});
