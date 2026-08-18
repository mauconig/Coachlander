import { StyleSheet, View } from 'react-native';

import { Row } from '@/components/Row';
import { RadioDot } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { color } from '@/theme/tokens';

export type CoachLoadMode = 'coach' | 'ai';

export function CoachLoadModePicker({ value, onChange }: { value: CoachLoadMode; onChange: (value: CoachLoadMode) => void }) {
  return (
    <View style={styles.group}>
      <Txt variant="label">¿QUIÉN DEFINE LAS CARGAS?</Txt>
      <Row
        title="Las define el entrenador"
        meta="Se usan las cargas escritas en la rutina."
        tone={value === 'coach' ? 'violet' : 'surface'}
        titleTone={value === 'coach' ? color.text : undefined}
        right={<RadioDot selected={value === 'coach'} />}
        onPress={() => onChange('coach')}
      />
      <Row
        title="Sugerencias de la IA"
        meta="La IA estima una carga según el historial y el perfil del alumno."
        tone={value === 'ai' ? 'violet' : 'surface'}
        titleTone={value === 'ai' ? color.text : undefined}
        right={<RadioDot selected={value === 'ai'} />}
        onPress={() => onChange('ai')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
});
