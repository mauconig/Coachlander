import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ChipGroup } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getClients, getMetaNumber } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { color, radius } from '@/theme/tokens';

const FILTERS = ['HOY (6)', 'ATRASADOS (2)', 'TODOS'] as const;
type Filter = (typeof FILTERS)[number];

/** 07 · Mis alumnos — who is training right now and who needs a nudge. */
export default function Clients() {
  const [filter, setFilter] = useState<Filter>('HOY (6)');
  const clients = useQuery(getClients);
  const clientCount = useQuery((db) => getMetaNumber(db, 'client_count'));

  const live = clients.find((c) => c.live);
  const rest = clients
    .filter((c) => !c.live)
    .filter((c) => (filter === 'ATRASADOS (2)' ? c.attention : true));

  return (
    <Screen scroll gap={16}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="eyebrow">MODO ENTRENADOR</Txt>
          <Txt variant="h2">{`${clientCount} alumnos`}</Txt>
        </View>
        <Pressable
          style={styles.add}
          onPress={() => router.push('/importar/origen')}
          accessibilityRole="button"
          accessibilityLabel="Agregar alumno o rutina"
        >
          <Icon name="plus" size={22} tone={color.ink} weight={2.6} />
        </Pressable>
      </View>

      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />

      {live ? (
        <Card tone="violet" padding={18} gap={12}>
          <Txt variant="label" tone={color.onViolet}>
            ENTRENANDO AHORA
          </Txt>
          <View style={styles.liveRow}>
            <Avatar name={live.name} size={46} tone="ink" />
            <View style={styles.liveText}>
              <Txt variant="h5">{live.name}</Txt>
              <Txt variant="meta" tone={color.onVioletStrong}>
                {live.status}
              </Txt>
            </View>
            <View style={styles.liveDot} />
          </View>
        </Card>
      ) : null}

      <View style={styles.list}>
        {rest.map((client) => (
          <Row
            key={client.id}
            left={<Avatar name={client.name} size={44} />}
            title={client.name}
            meta={client.status}
            metaTone={client.attention ? color.lime : color.textMuted}
            active={client.attention}
            right={
              client.done ? (
                <Icon name="check" size={14} tone={color.lime} weight={2.6} />
              ) : (
                <Icon name="chevron-right" size={16} tone={color.textMuted} />
              )
            }
            onPress={() => router.push(`/rutina/${client.id}`)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerText: { gap: 3 },
  add: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  liveText: { flex: 1, gap: 2 },
  liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.lime },
  list: { gap: 9 },
});
