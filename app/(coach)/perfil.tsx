import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getClients, getCoach, getMetaNumber, getSettings } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

/**
 * Perfil tab for the coach. The design gives the coach's code to the athlete
 * in screen 12 ("el código que aparece en su perfil") — this is that screen.
 */
export default function CoachProfile() {
  const { switchRole, signOut } = useApp();
  const coach = useQuery(getCoach);
  const settings = useQuery((db) => getSettings(db, 'coach'));
  const clientCount = useQuery((db) => getMetaNumber(db, 'client_count'));
  const liveCount = useQuery((db) => getClients(db).filter((client) => client.live).length);

  return (
    <Screen scroll gap={16}>
      <View style={styles.identity}>
        <Avatar name={coach.name} size={72} tone="violet" />
        <View style={styles.identityText}>
          <Txt variant="h3">{coach.name}</Txt>
          <Txt variant="meta">{coach.specialty}</Txt>
        </View>
      </View>

      <Card tone="lime" padding={18} gap={6}>
        <Txt variant="eyebrow" tone={color.ink}>
          TU CÓDIGO DE ENTRENADORA
        </Txt>
        <Txt variant="hero" tone={color.ink} style={styles.code}>
          {coach.code}
        </Txt>
        <Txt variant="prose" tone={color.ink}>
          Pasáselo a un alumno nuevo para que se conecte con tu plan.
        </Txt>
      </Card>

      <View style={styles.grid}>
        <StatTile value={String(clientCount)} label="ALUMNOS" valueTone={color.lime} />
        <StatTile value={String(liveCount)} label="ENTRENANDO HOY" />
      </View>

      <View style={styles.settings}>
        {settings.map((item, i) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={[styles.setting, i < settings.length - 1 && styles.settingDivider]}
          >
            <Txt variant="bodyStrong" style={styles.settingLabel}>
              {item.label}
            </Txt>
            {item.value ? (
              <Txt variant="meta" tone={item.accent ? color.lime : color.textMuted}>
                {item.value}
              </Txt>
            ) : null}
            <Icon name="chevron-right" size={14} tone={color.textMuted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            switchRole('athlete');
            router.replace('/hoy');
          }}
          accessibilityRole="button"
        >
          <Txt variant="body" tone={color.textFaint} center>
            Cambiar a modo alumno
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => {
            signOut();
            router.replace('/bienvenida');
          }}
          accessibilityRole="button"
        >
          <Txt variant="body" tone={color.textFaint} center>
            Cerrar sesión
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, gap: 4 },
  code: { letterSpacing: 2 },
  grid: { flexDirection: 'row', gap: 9 },
  settings: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  settingDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  settingLabel: { flex: 1 },
  footer: { gap: 14, paddingTop: 6 },
});
