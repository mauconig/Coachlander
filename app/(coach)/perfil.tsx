import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { updateProfile } from '@/api/client';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { getClients, getCoach, getMetaNumber, getSettings } from '@/db/queries';
import { useQuery } from '@/db/useQuery';
import { useApp } from '@/state/AppState';
import { useRefreshRemoteData, useRemoteData } from '@/state/RemoteState';
import { color, radius } from '@/theme/tokens';

export default function CoachProfile() {
  const { getToken } = useAuth();
  const { switchRole, signOut } = useApp();
  const remoteData = useRemoteData();
  const refreshRemoteData = useRefreshRemoteData();
  const coach = useQuery(getCoach);
  const settings = useQuery((db) => getSettings(db, 'coach'));
  const clientCount = useQuery((db) => getMetaNumber(db, 'client_count'));
  const liveCount = useQuery((db) => getClients(db).filter((client) => client.live).length);
  const notifications = settings.find((item) => /notific/i.test(`${item.id} ${item.label}`));
  const displayName = remoteData.user?.displayName?.trim() || coach.name;
  const email = remoteData.user?.email ?? '';
  const [editVisible, setEditVisible] = useState(false);
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  const saveProfile = async () => {
    const nextName = name.trim();
    if (!nextName) {
      Alert.alert('Falta el nombre', 'Escribí cómo querés que te vean tus alumnos.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(getToken, {
        name: nextName,
        firstName: nextName.split(/\s+/)[0] ?? nextName,
        role: 'coach',
      });
      await refreshRemoteData({ force: true });
      setEditVisible(false);
    } catch (error: unknown) {
      Alert.alert('No pudimos guardar el perfil', error instanceof Error ? error.message : 'Probá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    if (!coach.code) return;
    await Clipboard.setStringAsync(coach.code);
    Alert.alert('Código copiado', 'Ya podés pegarlo y enviárselo a un alumno.');
  };

  const shareCode = async () => {
    if (!coach.code) return;
    try {
      await Share.share({
        message: `Conectate conmigo en Coachlander usando el código ${coach.code}.`,
      });
    } catch (error: unknown) {
      Alert.alert('No pudimos compartir el código', error instanceof Error ? error.message : 'Probá nuevamente.');
    }
  };

  return (
    <>
      <Screen scroll gap={18}>
        <View style={styles.identityHeader}>
          <View style={styles.identity}>
            <Avatar name={displayName} size={72} tone="violet" />
            <View style={styles.identityText}>
              <Txt variant="eyebrow">PERFIL PROFESIONAL</Txt>
              <Txt variant="h3">{displayName}</Txt>
              <Txt variant="meta">{coach.specialty}</Txt>
            </View>
          </View>
          <Pressable onPress={() => setEditVisible(true)} accessibilityRole="button">
            <Txt variant="labelTight" tone={color.lime}>EDITAR</Txt>
          </Pressable>
        </View>

        <Card tone="lime" padding={18} gap={12}>
          <Txt variant="eyebrow" tone={color.ink}>CONECTAR ALUMNOS</Txt>
          <Txt variant="hero" tone={color.ink} style={styles.code}>{coach.code || '—'}</Txt>
          <Txt variant="prose" tone={color.ink}>
            Compartí este código para que un alumno se conecte con tu plan.
          </Txt>
          <View style={styles.codeActions}>
            <Button label="COPIAR" variant="dark" size="sm" fill onPress={() => void copyCode()} />
            <Button label="COMPARTIR" variant="light" size="sm" fill onPress={() => void shareCode()} />
          </View>
          <View style={styles.connectionSummary}>
            <Txt variant="meta" tone={color.ink}>{`${clientCount} ${clientCount === 1 ? 'alumno conectado' : 'alumnos conectados'}`}</Txt>
            <Txt variant="meta" tone={color.ink}>{`${liveCount} entrenando ahora`}</Txt>
          </View>
        </Card>

        <View style={styles.section}>
          <Txt variant="eyebrow">PREFERENCIAS DEL ENTRENADOR</Txt>
          <View style={styles.settings}>
            <View style={styles.setting}>
              <Txt variant="bodyStrong" style={styles.settingLabel}>Notificaciones</Txt>
              <Txt variant="meta" tone={notifications?.accent ? color.lime : color.textMuted}>
                {notifications?.value || 'No configuradas'}
              </Txt>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="eyebrow">CUENTA</Txt>
          <View style={styles.settings}>
            <View style={styles.setting}>
              <Txt variant="bodyStrong" style={styles.settingLabel}>Email</Txt>
              <Txt variant="meta" tone={color.textMuted} numberOfLines={1}>{email || 'Sin email disponible'}</Txt>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              switchRole('athlete');
              router.replace('/hoy');
            }}
            accessibilityRole="button"
          >
            <Txt variant="body" tone={color.textFaint} center>Cambiar a modo alumno</Txt>
          </Pressable>
          <Pressable
            onPress={() => {
              void signOut()
                .then(() => router.replace('/bienvenida'))
                .catch((error: unknown) => {
                  Alert.alert('No pudimos cerrar la sesión', error instanceof Error ? error.message : 'Probá nuevamente.');
                });
            }}
            accessibilityRole="button"
          >
            <Txt variant="body" tone={color.textFaint} center>Cerrar sesión</Txt>
          </Pressable>
        </View>
      </Screen>

      <Sheet visible={editVisible} onClose={() => setEditVisible(false)} eyebrow="PERFIL PROFESIONAL" title="Editar perfil">
        <View style={styles.editBody}>
          <Field label="NOMBRE VISIBLE" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
          <Button label={saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'} onPress={() => void saveProfile()} disabled={saving} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  identityHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  identityText: { flex: 1, gap: 4 },
  code: { letterSpacing: 2 },
  codeActions: { flexDirection: 'row', gap: 8 },
  connectionSummary: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  section: { gap: 10 },
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
  footer: { gap: 14, paddingTop: 4, paddingBottom: 8 },
  editBody: { gap: 18 },
});
