import { useSSO } from '@clerk/expo/experimental';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { color, radius } from '@/theme/tokens';

/** 09 · Bienvenida — the violet cover screen with the three sign-in paths. */
export default function Welcome() {
  const { startSSOFlow } = useSSO();
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);

  const openSocialAuth = (strategy: 'oauth_google' | 'oauth_apple') => {
    setSocialBusy(strategy === 'oauth_google' ? 'google' : 'apple');
    void startSSOFlow({ strategy })
      .then((result) => {
        if (!result.createdSessionId) return;
        // Clerk exposes the sign-up resource only when this SSO flow created
        // a new account. Existing users can go straight to their plan, while
        // new users must complete the same onboarding as email sign-up.
        router.replace(result.signUp?.createdSessionId ? '/rol' : '/');
      })
      .catch((error: unknown) => {
        console.warn('[Coachlander] No se pudo abrir el acceso social', error);
      })
      .finally(() => setSocialBusy(null));
  };

  if (socialBusy) {
    return (
      <AppLoadingScreen
        title={socialBusy === 'google' ? 'Conectando con Google' : 'Conectando con Apple'}
        detail="Estamos validando tu acceso."
      />
    );
  }

  return (
    <Screen background={color.violet} contentStyle={styles.body} padded>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Image source={require('../../assets/icon.png')} style={styles.mark} />
          <Txt variant="h5">COACHLANDER</Txt>
        </View>

        <Txt variant="heroXL">{'Tu rutina.\nApretá play.'}</Txt>

        <Txt variant="bodyLg" tone={color.onVioletStrong} style={styles.pitch}>
          Tu entrenador carga el plan. Vos entrenás con los tiempos y las cargas ya calculadas,
          serie por serie.
        </Txt>
      </View>

      <View style={styles.actions}>
        <Button
          label="Continuar con Apple"
          variant="dark"
          size="md"
          icon={<View style={styles.appleMark} />}
          onPress={() => openSocialAuth('oauth_apple')}
        />
        <Button
          label="Continuar con Google"
          variant="light"
          size="md"
          icon={<View style={styles.googleMark} />}
          onPress={() => openSocialAuth('oauth_google')}
        />
        <Button
          label="Usar mi email"
          variant="outline"
          size="md"
          style={styles.emailButton}
          onPress={() => router.push('/crear-cuenta')}
        />

        <Pressable
          style={styles.signIn}
          onPress={() => router.push({ pathname: '/crear-cuenta', params: { mode: 'sign-in' } })}
          accessibilityRole="button"
        >
          <Txt variant="body" tone="rgba(255,255,255,0.72)">
            ¿Ya tenés cuenta?
          </Txt>
          <Txt variant="bodyStrong" tone={color.lime}>
            Iniciar sesión
          </Txt>
        </Pressable>

        <Txt variant="metaSm" tone="rgba(255,255,255,0.5)" center style={styles.legal}>
          Al continuar aceptás los términos y la política de privacidad.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { justifyContent: 'space-between', paddingTop: 28, paddingHorizontal: 26 },
  top: { gap: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 30, height: 30, borderRadius: 9 },
  pitch: { maxWidth: 280 },
  actions: { gap: 10, paddingBottom: 26 },
  appleMark: { width: 16, height: 16, borderRadius: 5, backgroundColor: color.text },
  googleMark: { width: 16, height: 16, borderRadius: radius.pill, backgroundColor: color.violet },
  emailButton: { borderColor: 'rgba(255,255,255,0.4)' },
  signIn: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 8 },
  legal: { paddingTop: 4, lineHeight: 17 },
});
