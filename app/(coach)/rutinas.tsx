import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/components/Note';
import { Row, RowIndex } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getTemplates } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { color } from '@/theme/tokens';

/** Biblioteca de plantillas del entrenador. Las rutinas asignadas viven en Alumnos. */
export default function Routines() {
  const templates = useQuery(getTemplates);

  return (
    <Screen scroll gap={16}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Txt variant="eyebrow">BIBLIOTECA</Txt>
          <Txt variant="h2">Rutinas</Txt>
        </View>
        <Button
          label="Nueva rutina"
          size="sm"
          icon={<Icon name="plus" size={15} tone={color.ink} weight={2.5} />}
          onPress={() => router.push('/crear/nuevo')}
        />
      </View>

      <View style={styles.list}>
        <SectionHeader title="TUS PLANTILLAS" trailing={`${templates.length}`} />
        {templates.length ? (
          templates.map((template, index) => (
            <Row
              key={template.id}
              left={<RowIndex n={index + 1} tone={color.lime} />}
              title={template.name}
              meta={template.meta}
              trailing={template.assigned ?? 'SIN ASIGNAR'}
              trailingTone={template.assigned ? color.lime : color.textFaint}
              chevron
              onPress={() => router.push({ pathname: '/plantilla/[id]', params: { id: template.id } })}
            />
          ))
        ) : (
          <Card tone="muted" padding={18} gap={8}>
            <Txt variant="bodyStrong" center>
              Todavía no tenés plantillas
            </Txt>
            <Txt variant="body" tone={color.textMuted} center>
              Creá tu primera rutina para verla acá y asignarla cuando quieras.
            </Txt>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heading: { flex: 1, gap: 4 },
  list: { gap: 9 },
});
