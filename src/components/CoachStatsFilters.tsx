import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Row } from '@/components/Row';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { getClients } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import type { Client } from '@/data/types';
import {
  displayDate,
  displayRange,
  parseDisplayDate,
  presetLabel,
  presetRange,
  type StatsPreset,
  type StatsRange,
} from '@/lib/stats';
import { color } from '@/theme/tokens';

type Props = {
  clientId: string | null;
  range: StatsRange;
  preset: StatsPreset;
  onClientChange: (clientId: string | null) => void;
  onRangeChange: (preset: StatsPreset, range: StatsRange) => void;
};

const PRESETS: Array<{ key: Exclude<StatsPreset, 'custom'>; label: string }> = [
  { key: 'week', label: 'ESTA SEMANA' },
  { key: 'month', label: 'ESTE MES' },
  { key: 'threeMonths', label: 'ÚLTIMOS 3 MESES' },
];

export function CoachStatsFilters({ clientId, range, preset, onClientChange, onRangeChange }: Props) {
  const clients = useQuery(getClients);
  const [studentsVisible, setStudentsVisible] = useState(false);
  const [customVisible, setCustomVisible] = useState(false);
  const selectedClient = clients.find((client) => client.id === clientId) ?? null;

  return (
    <View style={styles.root}>
      <View style={styles.group}>
        <Txt variant="label">ALUMNO</Txt>
        <Row
          tone="muted"
          left={<Avatar name={selectedClient?.name ?? 'Todos los alumnos'} size={38} tone={clientId ? 'violet' : 'lime'} />}
          title={selectedClient?.name ?? 'Todos los alumnos'}
          meta={clientId ? 'Mostrando sólo este alumno' : 'Resumen de todos tus alumnos'}
          chevron
          onPress={() => setStudentsVisible(true)}
        />
      </View>

      <View style={styles.group}>
        <Txt variant="label">PERÍODO</Txt>
        <View style={styles.chips}>
          {PRESETS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={preset === option.key}
              onPress={() => onRangeChange(option.key, presetRange(option.key))}
            />
          ))}
          <Chip
            label={preset === 'custom' ? presetLabel('custom', range) : 'PERSONALIZADO'}
            selected={preset === 'custom'}
            onPress={() => setCustomVisible(true)}
          />
        </View>
        <Txt variant="meta" tone={color.textFaint}>
          {displayRange(range)}
        </Txt>
      </View>

      <StudentPickerSheet
        visible={studentsVisible}
        clients={clients}
        selectedId={clientId}
        onSelect={(nextId) => {
          onClientChange(nextId);
          setStudentsVisible(false);
        }}
        onClose={() => setStudentsVisible(false)}
      />

      <CustomRangeSheet
        visible={customVisible}
        range={range}
        onApply={(nextRange) => {
          onRangeChange('custom', nextRange);
          setCustomVisible(false);
        }}
        onClose={() => setCustomVisible(false)}
      />
    </View>
  );
}

function StudentPickerSheet({
  visible,
  clients,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  clients: Client[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="ESTADÍSTICAS" title="Elegí un alumno">
      <View style={styles.sheetList}>
        <Row
          tone={selectedId === null ? 'violet' : 'surface'}
          left={<Avatar name="Todos los alumnos" size={38} tone={selectedId === null ? 'ink' : 'neutral'} />}
          title="Todos los alumnos"
          meta="Ver el resumen completo"
          trailing={selectedId === null ? 'SELECCIONADO' : undefined}
          trailingTone={color.lime}
          onPress={() => onSelect(null)}
        />
        {clients.map((client) => (
          <Row
            key={client.id}
            tone={selectedId === client.id ? 'violet' : 'surface'}
            left={<Avatar name={client.name} size={38} tone={selectedId === client.id ? 'ink' : 'neutral'} />}
            title={client.name}
            trailing={selectedId === client.id ? 'SELECCIONADO' : undefined}
            trailingTone={color.lime}
            onPress={() => onSelect(client.id)}
          />
        ))}
      </View>
    </Sheet>
  );
}

function CustomRangeSheet({
  visible,
  range,
  onApply,
  onClose,
}: {
  visible: boolean;
  range: StatsRange;
  onApply: (range: StatsRange) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(displayDate(range.from));
  const [to, setTo] = useState(displayDate(range.to));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFrom(displayDate(range.from));
    setTo(displayDate(range.to));
    setError('');
  }, [range.from, range.to, visible]);

  const apply = () => {
    const nextFrom = parseDisplayDate(from);
    const nextTo = parseDisplayDate(to);
    if (!nextFrom || !nextTo) {
      setError('Usá el formato DD/MM/AAAA.');
      return;
    }
    if (nextFrom > nextTo) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    onApply({ from: nextFrom, to: nextTo });
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="PERÍODO" title="Elegí un rango">
      <View style={styles.customContent}>
        <Field label="DESDE" value={from} onChangeText={setFrom} placeholder="DD/MM/AAAA" keyboardType="number-pad" />
        <Field label="HASTA" value={to} onChangeText={setTo} placeholder="DD/MM/AAAA" keyboardType="number-pad" />
        {error ? <Txt variant="body" tone={color.textSoft}>{error}</Txt> : null}
        <Button label="Aplicar rango" onPress={apply} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { gap: 15 },
  group: { gap: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetList: { gap: 9 },
  customContent: { gap: 13 },
});
