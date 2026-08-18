import { StyleSheet, View } from 'react-native';

import type { CoachHistorySession } from '@/api/client';
import { Row } from '@/components/Row';
import { Txt } from '@/components/Txt';
import { dayBadge } from '@/lib/format';
import { color } from '@/theme/tokens';

export function CoachHistoryRow({
  session,
  showClient,
  latest,
  onPress,
}: {
  session: CoachHistorySession;
  showClient: boolean;
  latest: boolean;
  onPress?: () => void;
}) {
  const badge = dayBadge(new Date(`${session.date}T12:00:00`));
  const details = [
    showClient ? session.clientName : null,
    `${session.minutes} min`,
  ].filter(Boolean).join(' · ');

  return (
    <Row
      left={
        <View style={[styles.badge, latest ? styles.badgeLatest : styles.badgeMuted]}>
          <Txt variant="statSm" style={styles.badgeDay}>{badge.day}</Txt>
          <Txt variant="metaSm" tone={latest ? color.text : color.textMuted} style={styles.badgeMonth}>{badge.month}</Txt>
        </View>
      }
      title={session.name}
      meta={details}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLatest: { backgroundColor: color.violet },
  badgeMuted: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
  badgeDay: { fontSize: 14, lineHeight: 16 },
  badgeMonth: { fontSize: 8, lineHeight: 11 },
});
