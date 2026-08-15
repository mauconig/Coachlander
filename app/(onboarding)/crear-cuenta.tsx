import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Heading, OrDivider } from '@/components/Note';
import { Screen } from '@/components/Screen';
import { BackButton } from '@/components/TopBar';
import { useApp } from '@/state/AppState';
import { color, radius } from '@/theme/tokens';

/** 10 · Crear cuenta con email */
export default function CreateAccount() {
  const { draft, patchDraft } = useApp();
  const canSubmit = draft.name.trim().length > 1 && draft.email.includes('@') && draft.password.length >= 8;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <BackButton />

          <Heading title="Creá tu cuenta" subtitle="Dos minutos y ya podés entrenar." />

          <View style={styles.fields}>
            <Field
              label="NOMBRE"
              value={draft.name}
              onChangeText={(name) => patchDraft({ name })}
              placeholder="Nombre y apellido"
              autoCapitalize="words"
            />
            <Field
              label="EMAIL"
              value={draft.email}
              onChangeText={(email) => patchDraft({ email })}
              placeholder="tu@mail.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="CONTRASEÑA"
              value={draft.password}
              onChangeText={(password) => patchDraft({ password })}
              secure
              hint="Mínimo 8 caracteres"
            />
          </View>

          <View style={styles.actions}>
            <Button label="Crear cuenta" disabled={!canSubmit} onPress={() => router.push('/rol')} />

            <OrDivider label="O SEGUÍ CON" />

            <View style={styles.social}>
              <Button
                label="Google"
                variant="light"
                size="md"
                fill
                icon={<View style={styles.googleMark} />}
                onPress={() => router.push('/rol')}
              />
              <Button
                label="Apple"
                variant="outline"
                size="md"
                fill
                icon={<View style={styles.appleMark} />}
                onPress={() => router.push('/rol')}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: 20, paddingBottom: 24, flexGrow: 1 },
  fields: { gap: 12 },
  actions: { gap: 14, marginTop: 'auto', paddingTop: 24 },
  social: { flexDirection: 'row', gap: 10 },
  googleMark: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: color.violet },
  appleMark: { width: 14, height: 14, borderRadius: 4, backgroundColor: color.text },
});
