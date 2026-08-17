import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionHeader } from '@/components/Note';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getClients, getRoutineSetCount, getTemplates, getTodayRoutine } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { color } from '@/theme/tokens';

/**
 * Rutinas tab. La biblioteca del entrenador: plantillas guardadas y la rutina
 * activa. El botón "+" de la barra inferior abre el creador o el import con IA.
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
        <Txt variant="h2">Rutinas creadas</Txt>
      </View>

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
  list: { gap: 9 },
});
