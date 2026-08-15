import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/components/Note';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getClients, getRoutineSetCount, getTemplates, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { color, radius } from '@/theme/tokens';

/**
 * Rutinas tab. The design doc specifies this slot in the coach tab bar (07)
 * and the two screens it leads to — the editor (08) and the AI import (15-18);
 * this is the list that connects them.
 */
export default function Routines() {
  const templates = useQuery(getTemplates);
  const routine = useQuery(getTodayRoutine);
  const totalSets = useQuery(getRoutineSetCount);
  const firstClient = useQuery(getClients)[0];

  return (
    <Screen scroll gap={16}>
      <View style={styles.header}>
        <Txt variant="eyebrow">BIBLIOTECA</Txt>
        <Txt variant="h2">Rutinas</Txt>
      </View>

      <Card tone="violet" radius={26} padding={22} gap={12} onPress={() => router.push('/importar/origen')}>
        <Txt variant="label" tone={color.onViolet}>
          IMPORTAR CON IA
        </Txt>
        <Txt variant="h3">Traé una rutina que ya tengas</Txt>
        <Txt variant="body" tone={color.onVioletStrong}>
          Subí la planilla o pegá el texto. La IA detecta ejercicios, series y cargas.
        </Txt>
        <View style={styles.importCta}>
          <Txt variant="labelTight" tone={color.ink}>
            EMPEZAR
          </Txt>
          <Icon name="chevron-right" size={14} tone={color.ink} />
        </View>
      </Card>

      <View style={styles.list}>
        <SectionHeader title="TUS PLANTILLAS" trailing={`${templates.length}`} />
        {templates.map((template) => (
          <Row
            key={template.id}
            title={template.name}
            meta={template.meta}
            trailing={template.assigned ?? 'SIN ASIGNAR'}
            trailingTone={template.assigned ? color.lime : color.textFaint}
            onPress={() => firstClient && router.push(`/rutina/${firstClient.id}`)}
          />
        ))}
      </View>

      <Card tone="muted" padding={16} gap={4}>
        <Txt variant="label">RUTINA ACTIVA</Txt>
        <Txt variant="bodyStrong">{`${routine.name} · ${totalSets} series`}</Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3 },
  importCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: color.lime,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  list: { gap: 9 },
});
