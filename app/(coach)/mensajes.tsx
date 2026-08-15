import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getThreads } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { color } from '@/theme/tokens';

/**
 * Mensajes tab. The design specifies the slot in the coach tab bar (07) and
 * the "ESCRIBIR" action on the athlete profile (06); this is the inbox those
 * point at.
 */
export default function Messages() {
  const threads = useQuery(getThreads);
  const unread = threads.filter((t) => t.unread).length;

  return (
    <Screen scroll gap={16}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="eyebrow">MODO ENTRENADOR</Txt>
          <Txt variant="h2">Mensajes</Txt>
        </View>
        {unread ? (
          <Txt variant="labelTight" tone={color.lime}>
            {`${unread} SIN LEER`}
          </Txt>
        ) : null}
      </View>

      <View style={styles.list}>
        {threads.map((thread) => {
          return (
            <Row
              key={thread.clientId}
              left={<Avatar name={thread.name} size={44} tone={thread.unread ? 'violet' : 'neutral'} />}
              title={thread.name}
              meta={thread.preview}
              metaTone={thread.unread ? color.textSoft : color.textMuted}
              trailing={thread.when}
              trailingTone={thread.unread ? color.lime : color.textFaint}
              active={thread.unread}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerText: { gap: 3 },
  list: { gap: 9 },
});
